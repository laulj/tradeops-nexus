import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import path from "path"
import request from "supertest"
import { app } from "../index"
import { makeTempDir, removeTempDir, setDbEnv, clearDbEnv, resetUsers, registerUser, openDb, countWhere } from "./helpers"

let dir: string
let sfPath: string
let seq = 0
const now = Date.now()

beforeAll(() => {
    dir = makeTempDir()
    sfPath = path.join(dir, "spotFuture.db")
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
    const name = `sfu${seq}`
    const pad = seq.toString(16).padStart(2, "0")
    const { body } = await registerUser(app, name, "pw1")
    return { name, addr: `0x${pad}s`.padEnd(42, "a"), token: body.accessToken! }
}

const postAs = (token: string, url: string, payload: unknown) =>
    request(app).post(url).set("Authorization", `Bearer ${token}`).send(payload)

const tokenPair = (id: string, symbol: string, price: number) => ({
    symbol,
    denom: symbol.toLowerCase(),
    amount: price,
})

describe("spotFuture ingestion endpoints (called by the external server)", () => {
    it("open → close lifecycle via /data/spotFuture/update writes username-scoped rows", async () => {
        const u = await freshUser()
        const openUuid = `sf-open-${seq}`

        // 1. upload the OPEN transaction + exchange legs + opened position
        expect(
            (
                await postAs(u.token, "/data/spotFuture/txs/update", {
                    data: [
                        {
                            uuid: openUuid,
                            timestamp: String(now - 3_600_000),
                            address: u.addr,
                            cex: { id: "byb-1", name: "bybit" },
                            dex: { id: "bin-1", name: "binance" },
                            qty: 1,
                            spotPrice: 1600,
                            futurePrice: 1601,
                            orderFee: 0.5,
                            fundingFee: 1.2,
                        },
                    ],
                })
            ).status,
        ).toBe(201)
        expect(
            (
                await postAs(u.token, "/data/spotFuture/typedTxs/update", {
                    data: [
                        { typed: "bybit", id: "byb-1", tokenIn: "ETH", tokenOut: "USDC" },
                        { typed: "binance", id: "bin-1", tokenIn: "ETH", tokenOut: "USDC" },
                    ],
                })
            ).status,
        ).toBe(201)
        expect(
            (
                await postAs(u.token, "/data/spotFuture/openedPositions/update", {
                    data: [{ timestamp: now - 3_600_000, openingId: openUuid }],
                })
            ).status,
        ).toBe(201)

        // 2. upload the full position (OPEN + CLOSE) — the route finds the existing
        //    open transaction by its exchange legs and removes the opened position.
        const position = {
            address: u.addr,
            profit: { ETH: { amount: 80, ratio: 0.002 } },
            txs: [
                {
                    timestamp: now - 3_600_000,
                    type: "OPEN",
                    qty: 1,
                    spotPrice: 1600,
                    futurePrice: 1601,
                    orderFee: 0.5,
                    fundingFee: 1.2,
                    typedTxs: [
                        { typedSymbol: "bybit", type: "CEX", id: "byb-1", tokenIn: tokenPair("byb-1", "ETH", 1600), tokenOut: tokenPair("byb-1", "USDC", 1600) },
                        { typedSymbol: "binance", type: "DEX", id: "bin-1", tokenIn: tokenPair("bin-1", "ETH", 1600), tokenOut: tokenPair("bin-1", "USDC", 1600) },
                    ],
                },
                {
                    timestamp: now,
                    type: "CLOSE",
                    qty: 1,
                    spotPrice: 1620,
                    futurePrice: 1621,
                    orderFee: 0.5,
                    fundingFee: 1.2,
                    typedTxs: [
                        { typedSymbol: "bybit", type: "CEX", id: "byb-2", tokenIn: tokenPair("byb-2", "ETH", 1620), tokenOut: tokenPair("byb-2", "USDC", 1620) },
                        { typedSymbol: "binance", type: "DEX", id: "bin-2", tokenIn: tokenPair("bin-2", "ETH", 1620), tokenOut: tokenPair("bin-2", "USDC", 1620) },
                    ],
                },
            ],
        }
        const res = await postAs(u.token, "/data/spotFuture/update", { data: [position] })
        expect(res.status).toBe(201)

        const db = await openDb(sfPath)
        expect(await countWhere(db, "transactions", u.name)).toBe(2)
        expect(await countWhere(db, "bybitTxs", u.name)).toBe(2)
        expect(await countWhere(db, "binanceTxs", u.name)).toBe(2)
        expect(await countWhere(db, "ethTxs", u.name)).toBe(1)
        expect(await countWhere(db, "closedPositions", u.name)).toBe(1)
        expect(await countWhere(db, "openedPositions", u.name)).toBe(0) // removed on close
        db.close()
    })

    it("fine-grained SF endpoints write username-scoped rows", async () => {
        const u = await freshUser()
        const t = u.token

        expect(
            (
                await postAs(t, "/data/spotFuture/txs/update", {
                    data: [
                        {
                            uuid: "frf-open-1",
                            timestamp: String(now),
                            address: u.addr,
                            cex: { id: "byb-9", name: "bybit" },
                            dex: { id: "bin-9", name: "binance" },
                            qty: 1,
                            spotPrice: 100,
                            futurePrice: 101,
                            orderFee: 0.1,
                            fundingFee: 0.2,
                        },
                    ],
                })
            ).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/spotFuture/typedTxs/update", { data: [{ typed: "gate", id: "gate-1", tokenIn: "ETH", tokenOut: "USDC" }] })).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/spotFuture/closedPositions/update", { data: [{ timestamp: now, openingId: "cp-op", closingId: "cp-cl" }] })).status,
        ).toBe(201)
        expect(
            (await postAs(t, "/data/spotFuture/openedPositions/update", { data: [{ timestamp: now, openingId: "sf-open-2" }] })).status,
        ).toBe(201)
        expect((await postAs(t, "/data/spotFuture/tx/update", { data: [{ symbol: "ETH", positionId: 7, amount: 10, ratio: 0.001 }] })).status).toBe(201)
        expect((await postAs(t, "/data/spotFuture/txs/updateFR", { data: [{ openingId: "frf-open-1", fundingFee: 2.5 }] })).status).toBe(201)

        // PUT removes the opened position
        const put = await request(app)
            .put("/data/spotFuture/openedPositions/update")
            .set("Authorization", `Bearer ${t}`)
            .send([{ id: 0, timestamp: now, openingId: "sf-open-2" }])
        expect(put.status).toBe(201)

        const db = await openDb(sfPath)
        expect(await countWhere(db, "transactions", u.name)).toBe(1)
        expect(await countWhere(db, "bybitTxs", u.name)).toBe(0) // txs/update does not create exchange rows
        expect(await countWhere(db, "binanceTxs", u.name)).toBe(0)
        expect(await countWhere(db, "gateTxs", u.name)).toBe(1)
        expect(await countWhere(db, "ethTxs", u.name)).toBe(1)
        expect(await countWhere(db, "closedPositions", u.name)).toBe(1)
        expect(await countWhere(db, "openedPositions", u.name)).toBe(0) // created then removed by PUT
        db.close()
    })
})
