import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import path from "path"
import request from "supertest"
import { app } from "../index"
import { makeTempDir, removeTempDir, setDbEnv, clearDbEnv, resetUsers, registerUser, openDb, countWhere } from "./helpers"

let dir: string
let frPath: string
let seq = 0
const now = Date.now()

beforeAll(() => {
    dir = makeTempDir()
    frPath = path.join(dir, "fRate.db")
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
    const name = `fru${seq}`
    const pad = seq.toString(16).padStart(2, "0")
    const { body } = await registerUser(app, name, "pw1")
    return { name, addr: `0x${pad}f`.padEnd(42, "a"), token: body.accessToken! }
}

const postAs = (token: string, url: string, payload: unknown) =>
    request(app).post(url).set("Authorization", `Bearer ${token}`).send(payload)

const tokenPair = (id: string, symbol: string, price: number) => ({
    symbol,
    denom: symbol.toLowerCase(),
    amount: price,
})

describe("funding-rate ingestion endpoints (called by the external server)", () => {
    it("open → close lifecycle via /data/fRate/update writes username-scoped rows", async () => {
        const u = await freshUser()
        const openUuid = `fr-open-${seq}`

        // 1. upload the OPEN transaction + exchange legs + opened position
        expect(
            (
                await postAs(u.token, "/data/fRate/txs/update", {
                    data: [{ uuid: openUuid, timestamp: String(now - 3_600_000), address: u.addr, EX1: { id: "frb-1", name: "bybit" }, EX2: { id: "frh-1", name: "hl" }, qty: 1 }],
                })
            ).status,
        ).toBe(201)
        expect(
            (
                await postAs(u.token, "/data/fRate/typedTxs/update", {
                    data: [
                        { typed: "bybit", id: "frb-1", price: 2000, orderFee: 0.3, fundingFee: 0.05, tokenIn: "ETH", tokenOut: "USDC" },
                        { typed: "hl", id: "frh-1", price: 2001, orderFee: 0.3, fundingFee: 0.04, tokenIn: "ETH", tokenOut: "USDC" },
                    ],
                })
            ).status,
        ).toBe(201)
        expect(
            (
                await postAs(u.token, "/data/fRate/openedPositions/update", {
                    data: [{ timestamp: now - 3_600_000, openingId: openUuid }],
                })
            ).status,
        ).toBe(201)

        const position = {
            address: u.addr,
            profit: { ETH: { amount: 60, ratio: 0.001 } },
            txs: [
                {
                    timestamp: now - 3_600_000,
                    type: "OPEN",
                    qty: 1,
                    typedTxs: [
                        { typedSymbol: "bybit", type: "CEX", id: "frb-1", symbol: "ETH", price: 2000, orderFee: 0.3, fundingFee: 0.05, tokenIn: tokenPair("frb-1", "ETH", 2000), tokenOut: tokenPair("frb-1", "USDC", 2000) },
                        { typedSymbol: "hl", type: "CEX", id: "frh-1", symbol: "ETH", price: 2001, orderFee: 0.3, fundingFee: 0.04, tokenIn: tokenPair("frh-1", "ETH", 2001), tokenOut: tokenPair("frh-1", "USDC", 2001) },
                    ],
                },
                {
                    timestamp: now,
                    type: "CLOSE",
                    qty: 1,
                    typedTxs: [
                        { typedSymbol: "bybit", type: "CEX", id: "frb-2", symbol: "ETH", price: 2020, orderFee: 0.3, fundingFee: 0.05, tokenIn: tokenPair("frb-2", "ETH", 2020), tokenOut: tokenPair("frb-2", "USDC", 2020) },
                        { typedSymbol: "hl", type: "CEX", id: "frh-2", symbol: "ETH", price: 2021, orderFee: 0.3, fundingFee: 0.04, tokenIn: tokenPair("frh-2", "ETH", 2021), tokenOut: tokenPair("frh-2", "USDC", 2021) },
                    ],
                },
            ],
        }
        const res = await postAs(u.token, "/data/fRate/update", { data: [position] })
        expect(res.status).toBe(201)

        const db = await openDb(frPath)
        expect(await countWhere(db, "transactions", u.name)).toBe(2)
        expect(await countWhere(db, "bybitTxs", u.name)).toBe(2)
        expect(await countWhere(db, "hlTxs", u.name)).toBe(2)
        expect(await countWhere(db, "ethTxs", u.name)).toBe(1)
        expect(await countWhere(db, "closedPositions", u.name)).toBe(1)
        expect(await countWhere(db, "openedPositions", u.name)).toBe(0) // removed on close
        db.close()
    })

    it("fine-grained FR endpoints write username-scoped rows", async () => {
        const u = await freshUser()
        const t = u.token

        expect(
            (
                await postAs(t, "/data/fRate/txs/update", {
                    data: [{ uuid: "frf-open-1", timestamp: String(now), address: u.addr, EX1: { id: "fxb-1", name: "bybit" }, EX2: { id: "fxh-1", name: "hl" }, qty: 1 }],
                })
            ).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/fRate/typedTxs/update", { data: [{ typed: "gate", id: "gate-1", price: 100, orderFee: 0.1, fundingFee: 0.01, tokenIn: "ETH", tokenOut: "USDC" }] })).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/fRate/closedPositions/update", { data: [{ timestamp: now, openingId: "cp-op", closingId: "cp-cl" }] })).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/fRate/openedPositions/update", { data: [{ timestamp: now, openingId: "fr-open-2" }] })).status,
        ).toBe(201)
        expect((await postAs(t, "/data/fRate/tx/update", { data: [{ symbol: "ETH", positionId: 3, amount: 5, ratio: 0.001 }] })).status).toBe(201)
        expect(
            (await postAs(t, "/data/fRate/txs/updateFR", { data: [{ typedSymbol: "bybit", openingId: "frf-open-1", fundingFee: 0.9 }] })).status,
        ).toBe(201)
        expect(
            (
                await postAs(t, "/data/fRate/fundingRateTableData/update", {
                    data: [
                        {
                            pair: "BYBIT-HYPERLIQUID",
                            symbol: "ETH",
                            direction: "same",
                            difference: 0.0001,
                            hourly: 0.00001,
                            nextFundingIntervalMs: 1000,
                            estimatedFR: 0.0001,
                            costRate: 0.002,
                            estimatedProfitRatio: 0.0001,
                            minRunningHrAssumed: 2,
                            fundingInfo: [{ name: "BYBIT", funding: 0.0001, nextFundingTime: 1000, intervalHr: 8 }],
                            TimeToNextFunding: 1000,
                        },
                    ],
                })
            ).status,
        ).toBe(201)

        // PUT removes the opened position
        const put = await request(app)
            .put("/data/fRate/openedPositions/update")
            .set("Authorization", `Bearer ${t}`)
            .send([{ id: 0, timestamp: now, openingId: "fr-open-2" }])
        expect(put.status).toBe(201)

        // the new /data/fRate/typedTx query returns only the caller's typed rows
        const typed = await postAs(t, "/data/fRate/typedTx", {})
        expect(typed.status).toBe(200)
        const rows = typed.body as any[]
        const ids = rows.map((r) => r.id)
        // only rows created via typedTxs/update appear; txs/update does not create exchange rows
        expect(ids).toContain("gate-1")
        expect(ids).not.toContain("fxb-1")
        expect(ids).not.toContain("frb-2") // belongs to the other user's test

        const db = await openDb(frPath)
        expect(await countWhere(db, "transactions", u.name)).toBe(1)
        expect(await countWhere(db, "bybitTxs", u.name)).toBe(0) // txs/update does not create exchange rows
        expect(await countWhere(db, "hlTxs", u.name)).toBe(0)
        expect(await countWhere(db, "gateTxs", u.name)).toBe(1)
        expect(await countWhere(db, "ethTxs", u.name)).toBe(1)
        expect(await countWhere(db, "closedPositions", u.name)).toBe(1)
        expect(await countWhere(db, "openedPositions", u.name)).toBe(0)
        db.close()
    })
})
