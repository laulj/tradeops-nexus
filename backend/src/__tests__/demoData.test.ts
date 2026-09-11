import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import { makeTempDir, removeTempDir, openDb, query, countWhere, hashPassword } from "./helpers"
import { database, createUser } from "../database"
import { demoAddress, demoPlan, populateDemoData, removeUserData } from "../demoData"

let dir: string
let txPath: string
let sfPath: string
let frPath: string

// Tests seed a short window. The shape is identical to the multi-year default —
// only the row counts scale — which keeps the suite from paying for thousands of
// rows per user while still exercising every code path.
const WINDOW_DAYS = 120
const plan = demoPlan(WINDOW_DAYS)

beforeAll(async () => {
    dir = makeTempDir()
    txPath = path.join(dir, "tx.db")
    sfPath = path.join(dir, "spotFuture.db")
    frPath = path.join(dir, "fRate.db")
    await database.updateDB(txPath)
    await database.updateSpotFutureDB(sfPath)
    await database.updateFundingRateDB(frPath)
})

afterAll(async () => {
    await database.closeDB()
    removeTempDir(dir)
})

describe("demoAddress", () => {
    it("is deterministic and unique per user / index", () => {
        expect(demoAddress("alice", 0)).toBe(demoAddress("alice", 0))
        expect(demoAddress("alice", 0)).not.toBe(demoAddress("alice", 1))
        expect(demoAddress("alice", 0)).not.toBe(demoAddress("bob", 0))
    })

    it("returns a valid 0x address", () => {
        expect(demoAddress("alice", 0)).toMatch(/^0x[0-9a-f]{40}$/)
    })
})

describe("demoPlan", () => {
    it("derives a multi-year dataset from the window and never degenerates", () => {
        const years = demoPlan(1095)
        expect(years.windowDays).toBe(1095)
        expect(years.spotTrades).toBeGreaterThan(500) // ≈4 trades a week for 3 years
        expect(years.balanceSnapshots).toBeGreaterThan(150) // weekly
        // Snapshots are weekly, plus the endpoint.
        expect(demoPlan(WINDOW_DAYS).balanceSnapshots).toBe(Math.floor(WINDOW_DAYS / 7) + 1)
        // Even an absurdly short window still yields a usable dataset.
        expect(demoPlan(1).spotTrades).toBeGreaterThanOrEqual(8)
        expect(demoPlan(1).windowDays).toBeGreaterThanOrEqual(30)
    })
})

describe("populateDemoData / removeUserData", () => {
    it("seeds rows owned by the user across all three databases", async () => {
        await createUser("alice", Uint8Array.from(hashPassword("pw")))
        await populateDemoData("alice", WINDOW_DAYS)

        const tx = await openDb(txPath)
        const sf = await openDb(sfPath)
        const fr = await openDb(frPath)

        // spot: one transaction + one quote row per round-trip, two wallets
        expect(await countWhere(tx, "transactions", "alice")).toBe(plan.spotTrades)
        expect(await countWhere(tx, "usdcTxs", "alice")).toBe(plan.spotTrades)
        expect(await countWhere(tx, "usdcBal", "alice")).toBe(plan.balanceSnapshots * 2)
        // Round-trips are mostly profitable, but the book has losing days too.
        const roundTrips = (await query(tx, `SELECT amount FROM usdcTxs WHERE username = 'alice'`)).map((r) => Number(r.amount))
        expect(roundTrips).toHaveLength(plan.spotTrades)
        expect(roundTrips.some((amount) => amount > 0)).toBe(true)
        expect(roundTrips.some((amount) => amount < 0)).toBe(true)
        // every base symbol is represented, so /data/symbols and the per-base
        // tables are never empty
        for (const base of ["eth", "btc", "sol", "arb", "wif", "tia", "tsla", "nvda"]) {
            expect(await countWhere(tx, `${base}Txs`, "alice")).toBeGreaterThan(0)
            expect(await countWhere(tx, `${base}Bal`, "alice")).toBe(plan.balanceSnapshots * 2)
        }
        // spotFuture: every open row is one transaction, every close is two
        expect(await countWhere(sf, "openedPositions", "alice")).toBe(plan.spotFuture.open)
        expect(await countWhere(sf, "closedPositions", "alice")).toBe(plan.spotFuture.closed)
        expect(await countWhere(sf, "transactions", "alice")).toBe(plan.spotFuture.open + plan.spotFuture.closed * 2)
        expect(await countWhere(sf, "usdcTxs", "alice")).toBe(plan.spotFuture.closed)
        // funding rate
        expect(await countWhere(fr, "openedPositions", "alice")).toBe(plan.fundingRate.open)
        expect(await countWhere(fr, "closedPositions", "alice")).toBe(plan.fundingRate.closed)
        expect(await countWhere(fr, "transactions", "alice")).toBe(plan.fundingRate.open + plan.fundingRate.closed * 2)
        expect(await countWhere(fr, "usdcTxs", "alice")).toBe(plan.fundingRate.closed)

        // demo flag persisted
        const users = await query(tx, `SELECT demo_populated FROM users WHERE username = 'alice'`)
        expect(Number(users[0]?.demo_populated)).toBe(1)

        tx.close()
        sf.close()
        fr.close()
    })

    it("spans the whole demo window instead of the last few weeks", async () => {
        const tx = await openDb(txPath)
        const rows = await query(tx, `SELECT MIN(timestamp) AS oldest, MAX(timestamp) AS newest FROM transactions WHERE username = 'alice'`)
        const oldest = Number(rows[0].oldest)
        const newest = Number(rows[0].newest)
        const days = (newest - oldest) / (24 * 60 * 60 * 1000)
        expect(days).toBeGreaterThan(WINDOW_DAYS * 0.8)
        expect(newest).toBeLessThanOrEqual(Date.now())
        expect(oldest).toBeLessThan(Date.now() - WINDOW_DAYS * 0.5 * 24 * 60 * 60 * 1000)
        tx.close()
    })

    it("prices each symbol on a walk, with a basis that is quoted not jittered", async () => {
        const sf = await openDb(sfPath)
        // ETH legs specifically: the same asset measured at many different times.
        const eth = await query(
            sf,
            `SELECT o.spotPrice AS openSpot, c.spotPrice AS closeSpot
             FROM closedPositions cp
             JOIN ethTxs e ON e.positionId = cp.id
             JOIN transactions o ON o.uuid = cp.openingId
             JOIN transactions c ON c.uuid = cp.closingId
             WHERE cp.username = 'alice'`,
        )
        const prices = eth.flatMap((r) => [Number(r.openSpot), Number(r.closeSpot)])
        expect(prices.length).toBeGreaterThanOrEqual(8)
        // A multi-month walk of a 3%-daily-vol asset moves much further than the
        // ±5% band the old uniform jitter produced.
        expect(Math.max(...prices) / Math.min(...prices)).toBeGreaterThan(1.08)

        const all = await query(sf, `SELECT spotPrice, futurePrice FROM transactions WHERE username = 'alice' AND spotPrice IS NOT NULL`)
        const basis = all.map((r) => Number(r.futurePrice) / Number(r.spotPrice) - 1)
        // The perp basis is a mean-reverting series: small, and both directions.
        expect(Math.max(...basis.map(Math.abs))).toBeLessThan(0.03)
        expect(basis.some((b) => b > 0)).toBe(true)
        expect(basis.some((b) => b < 0)).toBe(true)
        sf.close()
    })

    it("realises PnL that reconciles with the prices and fees on the same rows", async () => {
        const sf = await openDb(sfPath)
        const closed = await query(
            sf,
            `SELECT cp.id, o.qty AS qty, o.spotPrice AS openSpot, o.futurePrice AS openFuture, o.orderFee AS openFee,
                    c.spotPrice AS closeSpot, c.futurePrice AS closeFuture, c.orderFee AS closeFee, c.fundingFee AS fundingFee
             FROM closedPositions cp
             JOIN transactions o ON o.uuid = cp.openingId
             JOIN transactions c ON c.uuid = cp.closingId
             WHERE cp.username = 'alice'`,
        )
        expect(closed).toHaveLength(plan.spotFuture.closed)
        for (const row of closed) {
            const profit = await query(sf, `SELECT amount, ratio FROM usdcTxs WHERE positionId = ?`, [Number(row.id)])
            expect(profit).toHaveLength(1)
            // Mirrors the generator: short the perp / long the spot, so the payoff
            // is the entry basis less the exit basis, whichever way it is quoted.
            const basisOpen = Number(row.openFuture) - Number(row.openSpot)
            const basisClose = Number(row.closeFuture) - Number(row.closeSpot)
            const side = basisOpen >= 0 ? 1 : -1
            const realised = Number(row.qty) * side * (basisOpen - basisClose)
            const expected = realised - Number(row.openFee) - Number(row.closeFee) - Number(row.fundingFee)
            expect(Number(profit[0].amount)).toBeCloseTo(Number(expected.toFixed(2)), 2)
            // The stored ratio is that PnL over the notional, and the notional is
            // what the stored quantity and open price imply.
            const notional = Number(row.qty) * Number(row.openSpot)
            expect(Number(profit[0].ratio)).toBeCloseTo(Number(profit[0].amount) / notional, 3)
            expect(Math.abs(Number(profit[0].ratio))).toBeLessThanOrEqual(0.05)
        }
        sf.close()
    })

    it("runs a desk that makes money on both books, losing trades and all", async () => {
        // Asserted across several accounts and pooled, because a single account is
        // only 24 positions — the property we care about is the one that holds for
        // any username, not the luck of one draw.
        const accounts = ["pnl1", "pnl2", "pnl3", "pnl4", "pnl5"]
        for (const account of accounts) {
            await createUser(account, Uint8Array.from(hashPassword("pw")))
            await populateDemoData(account, WINDOW_DAYS)
        }

        const sf = await openDb(sfPath)
        const fr = await openDb(frPath)
        const collect = async (db: Awaited<ReturnType<typeof openDb>>, username: string) =>
            (await query(db, `SELECT amount FROM usdcTxs WHERE username = ?`, [username])).map((r) => Number(r.amount))
        const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

        const spotFuture: number[] = []
        const fundingRate: number[] = []
        let sfAhead = 0
        let frAhead = 0
        for (const account of accounts) {
            const sfPnl = await collect(sf, account)
            const frPnl = await collect(fr, account)
            expect(sfPnl).toHaveLength(plan.spotFuture.closed)
            expect(frPnl).toHaveLength(plan.fundingRate.closed)
            spotFuture.push(...sfPnl)
            fundingRate.push(...frPnl)
            if (mean(sfPnl) > 0) sfAhead++
            if (mean(frPnl) > 0) frAhead++
        }

        // Both books are businesses: the pooled numbers below are the real contract
        // (over a three-year history 11/12 accounts are ahead on spot-futures and
        // 12/12 on funding-rate), but a single account is only 24 positions, so one
        // account may sit fractionally behind on a short window.
        expect(sfAhead).toBeGreaterThanOrEqual(accounts.length - 2)
        expect(frAhead).toBeGreaterThanOrEqual(accounts.length - 2)
        // ...and the aggregate clears the fee and funding drag.
        expect(mean(spotFuture)).toBeGreaterThan(0)
        expect(mean(fundingRate)).toBeGreaterThan(0)
        // It isn't a fantasy either: real trades lose money.
        expect(spotFuture.filter((amount) => amount < 0).length).toBeGreaterThan(0)
        expect(fundingRate.filter((amount) => amount < 0).length).toBeGreaterThan(0)
        sf.close()
        fr.close()
    })

    it("collects funding on one leg and pays it on the other", async () => {
        const fr = await openDb(frPath)
        // Every venue, ignoring the zero funding of legs that have not settled.
        const fees: number[] = []
        for (const exchange of ["bybit", "hl", "binance", "gate"]) {
            const rows = await query(fr, `SELECT fundingFee FROM ${exchange}Txs WHERE username = 'alice' AND fundingFee <> 0`)
            fees.push(...rows.map((r) => Number(r.fundingFee)))
        }
        expect(fees.length).toBeGreaterThan(0)
        expect(fees.some((fee) => fee > 0)).toBe(true)
        expect(fees.some((fee) => fee < 0)).toBe(true)
        fr.close()
    })

    it("removeUserData deletes every row owned by the user plus the users entry", async () => {
        await removeUserData("alice")

        const tx = await openDb(txPath)
        const sf = await openDb(sfPath)
        const fr = await openDb(frPath)

        expect(await countWhere(tx, "transactions", "alice")).toBe(0)
        expect(await countWhere(tx, "usdcTxs", "alice")).toBe(0)
        expect(await countWhere(tx, "usdcBal", "alice")).toBe(0)
        expect(await countWhere(sf, "openedPositions", "alice")).toBe(0)
        expect(await countWhere(sf, "closedPositions", "alice")).toBe(0)
        expect(await countWhere(sf, "transactions", "alice")).toBe(0)
        expect(await countWhere(fr, "transactions", "alice")).toBe(0)
        expect(await countWhere(fr, "usdcTxs", "alice")).toBe(0)

        const users = await query(tx, `SELECT username FROM users WHERE username = 'alice'`)
        expect(users).toEqual([])

        tx.close()
        sf.close()
        fr.close()
    })
})

describe("demo data determinism", () => {
    it("replays the same history for a username, and a different one for another user", async () => {
        const fingerprint = (rows: { amount: number; ratio: number }[]) => rows.map((r) => `${r.amount}:${r.ratio}`).join("|")

        await createUser("detA", Uint8Array.from(hashPassword("pw")))
        await populateDemoData("detA", WINDOW_DAYS)
        const tx = await openDb(txPath)
        const first = await query(tx, `SELECT amount, ratio FROM usdcTxs WHERE username = 'detA' ORDER BY orderId`)
        expect(first).toHaveLength(plan.spotTrades)

        // Same username, seeded from scratch → an identical portfolio.
        await removeUserData("detA")
        await createUser("detA", Uint8Array.from(hashPassword("pw")))
        await populateDemoData("detA", WINDOW_DAYS)
        const replayed = await query(tx, `SELECT amount, ratio FROM usdcTxs WHERE username = 'detA' ORDER BY orderId`)
        expect(fingerprint(replayed)).toBe(fingerprint(first))

        // A different username still gets its own numbers (the dashboard is not
        // identical for every account).
        await createUser("detB", Uint8Array.from(hashPassword("pw")))
        await populateDemoData("detB", WINDOW_DAYS)
        const other = await query(tx, `SELECT amount, ratio FROM usdcTxs WHERE username = 'detB' ORDER BY orderId`)
        expect(other).toHaveLength(plan.spotTrades)
        expect(fingerprint(other)).not.toBe(fingerprint(first))
        tx.close()
    })
})
