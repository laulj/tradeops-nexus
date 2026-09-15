import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { app } from "../index"
import {
    makeTempDir,
    removeTempDir,
    setDbEnv,
    clearDbEnv,
    resetUsers,
    registerUser,
    openDb,
    query,
} from "./helpers"
import { database_createNewTables, insertAddressIfNotExists } from "../databaseRouter"
import { aggCache, generateCacheKey, invalidateUserCache } from "../utils"

let dir: string

beforeAll(() => {
    dir = makeTempDir()
    setDbEnv(dir)
})

afterAll(() => {
    clearDbEnv()
    removeTempDir(dir)
})

beforeEach(() => {
    resetUsers()
})

const batch = (token: string, body: Record<string, unknown>) =>
    request(app).post("/data/profits-details/pairing/batch").set("Authorization", `Bearer ${token}`).send(body)

describe("count-only profits request", () => {
    it("returns the full total without the rows, and paging cannot shrink it", async () => {
        const { body } = await registerUser(app, "counter", "pw1", true)
        const token = body.accessToken!
        const pairings = [{ quoteSymbol: "USDC" }]

        const paged = await batch(token, { pairings, page: 1, limit: 1 })
        const countOnly = await batch(token, { pairings, countOnly: true })

        expect(paged.status).toBe(200)
        expect(countOnly.status).toBe(200)

        // The total is a standalone COUNT(*) — asking for one row (or for no rows
        // at all) must not change it, which is what lets the dashboard ask for the
        // count instead of downloading detail rows it only counts.
        expect(paged.body.pagination.total).toBeGreaterThan(1)
        expect(countOnly.body.pagination.total).toBe(paged.body.pagination.total)
        // ...and the rows it would have discarded are not shipped.
        expect(Object.keys(paged.body.data)).not.toHaveLength(0)
        expect(Object.keys(countOnly.body.data)).toHaveLength(0)
    })
})

describe("aggregate cache invalidation", () => {
    it("drops the account's entries and leaves other accounts alone", () => {
        const key = (username: string) =>
            generateCacheKey({ endpoint: "e", type: "spot", username, address: "", interval: "raw", pairings: [] })

        aggCache.set(key("alice"), { n: 1 })
        aggCache.set(key("bob"), { n: 2 })
        // A count-only response must not collide with the row response.
        expect(key("alice")).not.toBe(
            generateCacheKey({ endpoint: "e", type: "spot", username: "alice", address: "", interval: "raw", pairings: [] }) +
                ":count",
        )

        invalidateUserCache("alice")

        expect(aggCache.get(key("alice"))).toBeUndefined()
        expect(aggCache.get(key("bob"))).toEqual({ n: 2 })
    })
})

// ── Base-token filter: a leg that only exists on one venue must still count ──
//
// Regression. The predicate used to demand the base token on BOTH sides:
//
//     (ctx.tokenIn = ? OR ctx.tokenOut = ?) AND (dtx.tokenIn = ? OR dtx.tokenOut = ?)
//
// Both joins are LEFT JOINs, so a CEX-only trade produced `dtx.tokenIn = NULL`,
// and `NULL = ?` is never true, so the row vanished from the totals. On the real
// book the legs dropped that way were the USDC<->USDT conversions, and every one
// of them lost money, so "Up since" read higher than the ledger it summarises.
// The base filter has to be a union over the legs that actually exist.
describe("base-token filter keeps single-leg trades", () => {
    type Db = Awaited<ReturnType<typeof openDb>>

    const ADDRESS = "0xCex0nly00000000000000000000000000000001"
    const MONTH = new Date("2026-03-15T00:00:00Z").getTime()

    // Three legs, and two of them have no DEX counterpart at all. All three are
    // USDC-quoted, so every one of them belongs in the USDC slice.
    const CEX_ONLY_USDT = -100
    const CEX_ONLY_AKT = -30
    const BOTH_LEGS_AKT = 40
    const USDC_SLICE = CEX_ONLY_USDT + CEX_ONLY_AKT + BOTH_LEGS_AKT

    const leg = async (db: Db, id: string, tokenIn: string, amount: number, username: string, dexHash?: string) => {
        await query(db, `INSERT OR IGNORE INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            id,
            tokenIn,
            "USDC",
            username,
        ])
        if (dexHash) {
            await query(db, `INSERT OR IGNORE INTO dexTxs (txHash, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
                dexHash,
                tokenIn,
                "USDC",
                username,
            ])
        }
        await query(
            db,
            `INSERT OR IGNORE INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`,
            [String(MONTH), ADDRESS, id, dexHash ?? null, username],
        )
        await query(
            db,
            `INSERT OR IGNORE INTO usdcTxs (orderId, txHash, amount, ratio, username) VALUES (?, ?, ?, ?, ?)`,
            [id, dexHash ?? null, amount, amount / 100_000, username],
        )
    }

    const seedBook = async (username: string) => {
        const db = await openDb(process.env.TX_DB_PATH!)
        try {
            // `aktTxs` only needs to exist for "akt" to count as a valid pairing
            // symbol; the P&L itself is always read from the quote table.
            await database_createNewTables("usdc", db)
            await database_createNewTables("akt", db)
            await insertAddressIfNotExists(db, ADDRESS, username)

            // Order ids and tx hashes are UNIQUE across the whole file rather than per
            // account, so every id is namespaced by user - otherwise a second account
            // seeding the same ids would be dropped by INSERT OR IGNORE.
            await leg(db, `${username}-cex-only-usdt`, "USDT", CEX_ONLY_USDT, username)
            await leg(db, `${username}-cex-only-akt`, "AKT", CEX_ONLY_AKT, username)
            await leg(db, `${username}-both-legs-akt`, "AKT", BOTH_LEGS_AKT, username, `${username}-dex-both-akt`)
        } finally {
            db.close()
        }
    }

    const sumAmounts = (body: { data?: Record<string, { amount: number }[]> }) =>
        Object.values(body.data ?? {})
            .flat()
            .reduce((total, row) => total + Number(row.amount ?? 0), 0)

    const ledgerTotal = async (username: string) => {
        const db = await openDb(process.env.TX_DB_PATH!)
        try {
            const rows = await query(db, `SELECT COALESCE(SUM(amount), 0) AS total FROM usdcTxs WHERE username = ?`, [
                username,
            ])
            return Number(rows[0]?.total ?? 0)
        } finally {
            db.close()
        }
    }

    it("counts CEX-only legs in the aggregated total the dashboard tile reads", async () => {
        const { body } = await registerUser(app, "cexonly", "pw1")
        await seedBook("cexonly")

        const res = await request(app)
            .post("/data/profits-details/pairing/aggregated/batch")
            .set("Authorization", `Bearer ${body.accessToken!}`)
            .send({ pairings: [{ baseSymbol: "USDC", quoteSymbol: "USDC" }], interval: "Monthly", page: 1, limit: 50 })

        expect(res.status).toBe(200)
        expect(sumAmounts(res.body)).toBeCloseTo(USDC_SLICE, 6)
        // The property that matters: what the endpoint reports is the whole table.
        expect(sumAmounts(res.body)).toBeCloseTo(await ledgerTotal("cexonly"), 6)
    })

    // The raw view is a list of completed round-trips: it INNER JOINs cexTxs and
    // dexTxs, so it can only ever show paired trades and its total is deliberately
    // narrower than the aggregated one. That divergence is why the ledger check
    // above is anchored to the aggregated response - the tile's source. Pinned
    // here so altering either join has to be a decision, not a silent drift.
    it("keeps the raw round-trip view paired-only, as it is built to be", async () => {
        const { body } = await registerUser(app, "cexonly2", "pw1")
        await seedBook("cexonly2")

        const res = await request(app)
            .post("/data/profits-details/pairing/batch")
            .set("Authorization", `Bearer ${body.accessToken!}`)
            .send({ pairings: [{ baseSymbol: "AKT", quoteSymbol: "USDC" }], page: 1, limit: 50 })

        expect(res.status).toBe(200)
        // Only `both-legs-akt` is a round-trip; the CEX-only legs are half a trade.
        expect(sumAmounts(res.body)).toBeCloseTo(BOTH_LEGS_AKT, 6)
    })
})
