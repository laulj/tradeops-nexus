import path from "path"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { app, users } from "../index"
import { initDatabase, isStorageFullError, maxPageCountFor } from "../database"
import { aggCache } from "../utils"
import {
    clearDbEnv,
    loginUser,
    makeTempDir,
    registerUser,
    removeTempDir,
    resetUsers,
    setDbEnv,
    setLimitsEnv,
} from "./helpers"

// The host gives us one instance, one fixed-size disk and 512 MB of memory. These
// tests pin the ceilings that keep the app inside that envelope: SQLite refuses
// writes before the disk fills, registration stops before the disk ceiling would
// refuse it, sessions cannot grow a token array without bound, and the request
// body limit is small everywhere except the ingestion routes.

describe("storage pragmas", () => {
    let dir: string

    beforeEach(() => {
        dir = makeTempDir()
        setDbEnv(dir)
        resetUsers()
    })

    afterEach(() => {
        clearDbEnv()
        removeTempDir(dir)
        resetUsers()
    })

    it("opens in WAL with a busy timeout and a page ceiling", async () => {
        const db = await initDatabase(path.join(dir, "tx.db"), "spot")

        const journal = (await db.get(`PRAGMA journal_mode`)) as { journal_mode: string }
        // PRAGMA busy_timeout returns its value in a column called `timeout`.
        const busy = (await db.get(`PRAGMA busy_timeout`)) as Record<string, number>
        const pages = (await db.get(`PRAGMA max_page_count`)) as { max_page_count: number }

        expect(String(journal.journal_mode).toLowerCase()).toBe("wal")
        expect(Number(Object.values(busy ?? {})[0])).toBe(5000)
        expect(Number(pages.max_page_count)).toBe(await maxPageCountFor(db, "spot"))
        await db.close()
    })

    it("refuses a write rather than filling the disk", async () => {
        setLimitsEnv({ maxDbMb: 1 }) // 256 pages, so a few 64 KB blobs is enough
        const db = await initDatabase(path.join(dir, "small.db"), "spot")
        await db.exec(`CREATE TABLE filler (payload BLOB)`)

        let failure: unknown = null
        const blob = Buffer.alloc(64 * 1024, 7)
        try {
            for (let i = 0; i < 50; i++) await db.run(`INSERT INTO filler (payload) VALUES (?)`, [blob])
        } catch (err) {
            failure = err
        }

        expect(isStorageFullError(failure)).toBe(true)
        await db.close()
    })

    it("bounds the aggregate cache", () => {
        expect(aggCache.options.maxKeys).toBe(500)
        expect(aggCache.options.stdTTL).toBe(300)
    })
})

describe("account, session and body ceilings", () => {
    let dir: string

    beforeEach(() => {
        dir = makeTempDir()
        setDbEnv(dir)
        resetUsers()
    })

    afterEach(() => {
        clearDbEnv()
        removeTempDir(dir)
        resetUsers()
    })

    it("stops registering once the account cap is reached", async () => {
        await loginUser(app, "nobody", "pw") // opens the databases
        setLimitsEnv({ maxAccounts: 3 }) // admin + userDemo + one registration

        expect((await registerUser(app, "alpha", "pw123")).status).toBe(201)

        const full = await registerUser(app, "beta", "pw123")
        expect(full.status).toBe(503)
        expect(String(full.body.error)).toMatch(/account limit/i)
    })

    it("keeps only the newest tokens per account", async () => {
        setLimitsEnv({ maxSessionsPerUser: 2 })

        const first = await loginUser(app, "admin", "demo123")
        expect(first.status).toBe(200)

        // Tokens signed back to back within the same second are byte-identical, so
        // an unmistakable older entry is seeded instead of a second sign-in.
        users["admin"].JWT.unshift("stale-token-from-an-earlier-session")
        await loginUser(app, "admin", "demo123")
        const latest = await loginUser(app, "admin", "demo123")

        expect(users["admin"].JWT).toHaveLength(2)
        expect(users["admin"].JWT).not.toContain("stale-token-from-an-earlier-session")

        // The evicted entry no longer authenticates; the newest one still does.
        const evicted = await request(app)
            .get("/usage")
            .set("Authorization", "Bearer stale-token-from-an-earlier-session")
        expect(evicted.status).toBe(401)

        const current = await request(app).get("/usage").set("Authorization", `Bearer ${latest.body.accessToken}`)
        expect(current.status).toBe(200)
    })

    it("rejects an oversized body outside /data", async () => {
        const oversized = JSON.stringify({ username: "x".repeat(300 * 1024), password: {} })

        const res = await request(app).post("/login").set("Content-Type", "application/json").send(oversized)

        expect(res.status).toBe(413)
    })
})
