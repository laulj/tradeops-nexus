import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import { makeTempDir, removeTempDir, query, hashPassword, openDb } from "./helpers"
import { database, initDatabase, createUser, getUser, listUsers, migrateAddUsernameColumn } from "../database"

let dir: string
let txPath: string

beforeAll(async () => {
    dir = makeTempDir()
    txPath = path.join(dir, "tx.db")
    await database.updateDB(txPath)
})

afterAll(async () => {
    await database.closeDB()
    removeTempDir(dir)
})

describe("users table (current schema)", () => {
    it("creates the users table and seeds both bootstrap accounts, empty", async () => {
        const db = await openDb(txPath)
        const rows = await query(db, `SELECT username, demo_populated FROM users ORDER BY username`)
        expect(rows).toEqual([
            { username: "admin", demo_populated: 0 },
            { username: "userDemo", demo_populated: 0 },
        ])
        db.close()
    })

    it("createUser / getUser / listUsers roundtrip", async () => {
        await createUser("alice", Uint8Array.from(hashPassword("pw")))
        const user = await getUser("alice")
        expect(user?.username).toBe("alice")
        expect(Array.from(user!.password_hash)).toEqual(hashPassword("pw"))
        expect(user!.demo_populated).toBe(0)

        const list = await listUsers()
        expect(list.map((u) => u.username)).toEqual(["admin", "alice", "userDemo"])
    })
})

describe("schema migration", () => {
    it("adds the username column to legacy tables and is idempotent", async () => {
        await database.db!.exec(`CREATE TABLE IF NOT EXISTS legacy_table (id INTEGER NOT NULL)`)
        await migrateAddUsernameColumn(database.db!)
        await migrateAddUsernameColumn(database.db!) // second run must not throw
        const db = await openDb(txPath)
        const cols = await query(db, `PRAGMA table_info("legacy_table")`)
        expect(cols.map((c: any) => c.name)).toContain("username")
        db.close()
    })

    it("every table in a fresh spot DB carries the username column", async () => {
        const db = await initDatabase(txPath, "spot")
        await db.close()
        const raw = await openDb(txPath)
        const tables = (await query(raw, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'users'`)).map(
            (t: any) => t.name,
        )
        expect(tables.length).toBeGreaterThan(0)
        for (const name of tables) {
            const cols = await query(raw, `PRAGMA table_info("${name}")`)
            expect(cols.map((c: any) => c.name), `table ${name}`).toContain("username")
        }
        raw.close()
    })

    // Two overlapping initializations of one file: a first page load firing
    // several requests at once (initMiddleware re-opened the databases per
    // request), two cluster workers, or the old and new process during a nodemon
    // restart. Both read the old schema and both try to add the column, so the
    // loser used to fail its request with "duplicate column name: username".
    it("survives two overlapping initializations of the same fresh file", async () => {
        const freshPath = path.join(dir, "overlap.db")
        const seed = await openDb(freshPath)
        // `query` runs the statement through the driver's `all`, which is enough
        // for DDL and avoids a second promisified helper.
        for (const ddl of [
            `CREATE TABLE cexTxs (orderId TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL)`,
            `CREATE TABLE dexTxs (txHash TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL)`,
            `CREATE TABLE transactions (timestamp TEXT NOT NULL, address TEXT NOT NULL, cexId TEXT UNIQUE, dexId TEXT UNIQUE)`,
            `CREATE TABLE accounts (address TEXT UNIQUE)`,
            `CREATE TABLE ethTxs (orderId TEXT UNIQUE, txHash TEXT UNIQUE, amount REAL NOT NULL, ratio REAL NOT NULL)`,
            `CREATE TABLE usdcTxs (orderId TEXT UNIQUE, txHash TEXT UNIQUE, amount REAL NOT NULL, ratio REAL NOT NULL)`,
        ]) {
            await query(seed, ddl)
        }
        seed.close()

        const [a, b] = await Promise.all([initDatabase(freshPath, "spot"), initDatabase(freshPath, "spot")])
        await Promise.all([a.close(), b.close()])

        const raw = await openDb(freshPath)
        for (const name of ["cexTxs", "dexTxs", "transactions", "accounts", "ethTxs", "usdcTxs"]) {
            const cols = await query(raw, `PRAGMA table_info("${name}")`)
            expect(cols.map((c: any) => c.name), `table ${name}`).toContain("username")
        }
        raw.close()
    })
})
