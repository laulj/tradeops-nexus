import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import path from "path"
import request from "supertest"
import { app } from "../index"
import { makeTempDir, removeTempDir, setDbEnv, clearDbEnv, resetUsers, registerUser, openDb, query, countWhere } from "./helpers"

let dir: string
let txPath: string
let seq = 0
const now = Date.now()

beforeAll(() => {
    dir = makeTempDir()
    txPath = path.join(dir, "tx.db")
    setDbEnv(dir)
})

afterAll(() => {
    clearDbEnv()
    removeTempDir(dir)
})

beforeEach(() => {
    resetUsers()
})

const freshUser = async () => {
    seq += 1
    const name = `spotu${seq}`
    const pad = seq.toString(16).padStart(2, "0")
    const { body } = await registerUser(app, name, "pw1")
    return { name, addr1: `0x${pad}a`.padEnd(42, "a"), addr2: `0x${pad}b`.padEnd(42, "b"), token: body.accessToken! }
}

const postAs = (token: string, url: string, payload: unknown) =>
    request(app).post(url).set("Authorization", `Bearer ${token}`).send(payload)

describe("spot ingestion endpoints (called by the external server)", () => {
    it("POST /data/update stores rows under the caller's username and auto-creates symbol tables", async () => {
        const a = await freshUser()
        const b = await freshUser()

        const res = await postAs(a.token, "/data/update", {
            data: [
                {
                    timestamp: now,
                    address: a.addr1,
                    profit: { ETH: { amount: 50, ratio: 0.001 }, USDC: { amount: 50, ratio: 0.001 } },
                    cex: { id: "order-1", tokenIn: { symbol: "ETH", denom: "eth", amount: 1 }, tokenOut: { symbol: "USDC", denom: "usdc", amount: 1 } },
                    dex: { txHash: "0xhash1", tokenIn: { symbol: "ETH", denom: "eth", amount: 1 }, tokenOut: { symbol: "USDC", denom: "usdc", amount: 1 } },
                },
            ],
        })
        expect(res.status).toBe(201)

        const db = await openDb(txPath)
        expect(await countWhere(db, "transactions", a.name)).toBe(1)
        expect(await countWhere(db, "cexTxs", a.name)).toBe(1)
        expect(await countWhere(db, "dexTxs", a.name)).toBe(1)
        expect(await countWhere(db, "usdcTxs", a.name)).toBe(1)
        expect(await countWhere(db, "ethTxs", a.name)).toBe(1)

        // brand-new symbol tables carry the username column (current schema)
        const cols = await query(db, `PRAGMA table_info("ethTxs")`)
        expect(cols.some((c: any) => c.name === "username")).toBe(true)

        // the second user cannot see any of it
        expect(await countWhere(db, "transactions", b.name)).toBe(0)
        db.close()
    })

    it("POST /data/update rejects an unsafe symbol name", async () => {
        const a = await freshUser()
        const res = await postAs(a.token, "/data/update", {
            data: [
                {
                    timestamp: now,
                    address: a.addr1,
                    profit: { "eth; DROP TABLE transactions": { amount: 1, ratio: 0.1 } },
                    cex: { id: "o2", tokenIn: { symbol: "ETH", denom: "eth", amount: 1 }, tokenOut: { symbol: "USDC", denom: "usdc", amount: 1 } },
                    dex: { txHash: "0xh2", tokenIn: { symbol: "ETH", denom: "eth", amount: 1 }, tokenOut: { symbol: "USDC", denom: "usdc", amount: 1 } },
                },
            ],
        })
        expect(res.status).toBe(400)
    })

    it("POST /data/tx/update, /data/txs/update, /data/typedTxs/update, /data/balance/update, /data/accounts/update", async () => {
        const u = await freshUser()
        const t = u.token

        expect((await postAs(t, "/data/tx/update", { data: [{ symbol: "ETH", txHash: "0xtxh1", amount: 10, ratio: 0.002 }] })).status).toBe(201)
        expect(
            (await postAs(t, "/data/txs/update", { data: [{ timestamp: now, address: u.addr1, cexId: null, dexId: "0xd1" }] })).status,
        ).toBe(201)
        expect(
            (
                await postAs(t, "/data/typedTxs/update", {
                    type: "dex",
                    data: [{ txHash: "0xd2", tokenIn: "ETH", tokenOut: "USDC" }],
                })
            ).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/balance/update", { address: u.addr1, symbol: "ETH", timestamp: now, balance: 12.5 })).status,
        ).toBe(201)
        expect((await postAs(t, "/data/accounts/update", { address: [u.addr1, u.addr2] })).status).toBe(201)

        const db = await openDb(txPath)
        expect(await countWhere(db, "ethTxs", u.name)).toBe(1)
        expect(await countWhere(db, "transactions", u.name)).toBe(1)
        expect(await countWhere(db, "dexTxs", u.name)).toBe(1)
        expect(await countWhere(db, "ethBal", u.name)).toBe(1)
        expect(await countWhere(db, "accounts", u.name)).toBe(2)
        db.close()
    })
})
