import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import { makeTempDir, removeTempDir, openDb, query, countWhere, hashPassword } from "./helpers"
import { database, createUser } from "../database"
import { demoAddress, populateDemoData, removeUserData } from "../demoData"

let dir: string
let txPath: string
let sfPath: string
let frPath: string

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

describe("populateDemoData / removeUserData", () => {
    it("seeds rows owned by the user across all three databases", async () => {
        await createUser("alice", Uint8Array.from(hashPassword("pw")))
        await populateDemoData("alice")

        const tx = await openDb(txPath)
        const sf = await openDb(sfPath)
        const fr = await openDb(frPath)

        // spot
        expect(await countWhere(tx, "transactions", "alice")).toBe(128)
        expect(await countWhere(tx, "usdcTxs", "alice")).toBe(128)
        expect(await countWhere(tx, "ethTxs", "alice")).toBeGreaterThan(0)
        expect(await countWhere(tx, "usdcBal", "alice")).toBeGreaterThan(0)
        // spotFuture
        expect(await countWhere(sf, "openedPositions", "alice")).toBe(3)
        expect(await countWhere(sf, "closedPositions", "alice")).toBe(4)
        expect(await countWhere(sf, "transactions", "alice")).toBe(11)
        expect(await countWhere(sf, "usdcTxs", "alice")).toBe(4)
        // funding rate
        expect(await countWhere(fr, "openedPositions", "alice")).toBe(3)
        expect(await countWhere(fr, "closedPositions", "alice")).toBe(4)
        expect(await countWhere(fr, "transactions", "alice")).toBe(11)
        expect(await countWhere(fr, "usdcTxs", "alice")).toBe(4)

        // demo flag persisted
        const users = await query(tx, `SELECT demo_populated FROM users WHERE username = 'alice'`)
        expect(Number(users[0]?.demo_populated)).toBe(1)

        tx.close()
        sf.close()
        fr.close()
    })

    it("removeUserData deletes every row owned by the user plus the users entry", async () => {
        await removeUserData("alice")

        const tx = await openDb(txPath)
        const sf = await openDb(sfPath)
        const fr = await openDb(frPath)

        expect(await countWhere(tx, "transactions", "alice")).toBe(0)
        expect(await countWhere(tx, "usdcTxs", "alice")).toBe(0)
        expect(await countWhere(sf, "openedPositions", "alice")).toBe(0)
        expect(await countWhere(sf, "closedPositions", "alice")).toBe(0)
        expect(await countWhere(fr, "transactions", "alice")).toBe(0)
        expect(await countWhere(fr, "usdcTxs", "alice")).toBe(0)

        const users = await query(tx, `SELECT username FROM users WHERE username = 'alice'`)
        expect(users).toEqual([])

        tx.close()
        sf.close()
        fr.close()
    })
})

describe("demo data randomness", () => {
    it("populates different users with different values but identical structure", async () => {
        await createUser("rndA", Uint8Array.from(hashPassword("pw")))
        await createUser("rndB", Uint8Array.from(hashPassword("pw")))
        await populateDemoData("rndA")
        await populateDemoData("rndB")

        const tx = await openDb(txPath)
        const rowsA = await query(tx, `SELECT amount, ratio FROM usdcTxs WHERE username = 'rndA' ORDER BY orderId`)
        const rowsB = await query(tx, `SELECT amount, ratio FROM usdcTxs WHERE username = 'rndB' ORDER BY orderId`)

        // Row counts stay deterministic (the dashboard/table shapes are stable).
        expect(rowsA.length).toBe(128)
        expect(rowsB.length).toBe(128)

        const fingerprint = (rows: { amount: number; ratio: number }[]) =>
            rows.map((r) => `${r.amount}:${r.ratio}`).join("|")
        // With 128 independently randomized rows per user the chance two users
        // share every value is negligible.
        expect(fingerprint(rowsA)).not.toBe(fingerprint(rowsB))
        tx.close()
    })
})
