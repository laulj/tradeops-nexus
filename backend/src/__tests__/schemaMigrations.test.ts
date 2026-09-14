import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import sqlite3 from "sqlite3"
import type { Database } from "sqlite"
import { makeTempDir, removeTempDir, openDb, query } from "./helpers"
import { ensureColumn } from "../schemaMigrations"

let dir: string

beforeAll(() => {
    dir = makeTempDir()
})

afterAll(() => {
    removeTempDir(dir)
})

/** The slice of the `sqlite` wrapper the migration uses, over a raw driver handle. */
const asDatabase = (raw: sqlite3.Database): Database =>
    ({
        all: (sql: string) => query(raw, sql),
        exec: (sql: string) =>
            new Promise<void>((resolve, reject) => raw.exec(sql, (err) => (err ? reject(err) : resolve()))),
    }) as unknown as Database

const LEGACY = `CREATE TABLE cexTxs (orderId TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL)`
const USERNAME = "TEXT NOT NULL DEFAULT 'admin'"

describe("ensureColumn", () => {
    it("adds a missing column and reports that it did", async () => {
        const raw = await openDb(path.join(dir, "add.db"))
        await query(raw, LEGACY)

        expect(await ensureColumn(asDatabase(raw), "cexTxs", "username", USERNAME)).toBe(true)
        const cols = await query(raw, `PRAGMA table_info("cexTxs")`)
        expect(cols.map((c: any) => c.name)).toContain("username")
        raw.close()
    })

    it("leaves an existing column alone and reports that it added nothing", async () => {
        const raw = await openDb(path.join(dir, "present.db"))
        await query(raw, LEGACY)
        await query(raw, `ALTER TABLE cexTxs ADD COLUMN username ${USERNAME}`)

        expect(await ensureColumn(asDatabase(raw), "cexTxs", "username", USERNAME)).toBe(false)
        raw.close()
    })

    // The deterministic form of the race: the column is already there because the
    // other connection added it, but our read of the schema happened before that,
    // so the ALTER really is rejected by SQLite as a duplicate.
    it("tolerates losing the race, because the column is there afterwards", async () => {
        const raw = await openDb(path.join(dir, "race.db"))
        await query(raw, LEGACY)
        await query(raw, `ALTER TABLE cexTxs ADD COLUMN username ${USERNAME}`) // the other connection

        let schemaReads = 0
        const staleRead = {
            all: async (sql: string) => {
                // The first read is the guard, and it predates the other ALTER.
                if (/PRAGMA table_info/.test(sql) && schemaReads++ === 0) {
                    return [{ name: "orderId" }, { name: "tokenIn" }, { name: "tokenOut" }]
                }
                return query(raw, sql)
            },
            exec: (sql: string) =>
                new Promise<void>((resolve, reject) => raw.exec(sql, (err) => (err ? reject(err) : resolve()))),
        } as unknown as Database

        await expect(ensureColumn(staleRead, "cexTxs", "username", USERNAME)).resolves.toBe(false)
        expect(schemaReads).toBe(2) // the guard, then the confirmation after the failure
        raw.close()
    })

    // A duplicate the failed ALTER does not explain — the column is still missing
    // afterwards — must not be swallowed.
    it("rethrows a duplicate column error it cannot explain", async () => {
        const unexplained = {
            all: async () => [{ name: "orderId" }],
            exec: async () => {
                throw new Error("SQLITE_ERROR: duplicate column name: username")
            },
        } as unknown as Database

        await expect(ensureColumn(unexplained, "cexTxs", "username", USERNAME)).rejects.toThrow(
            /duplicate column name/,
        )
    })
})
