import path from "path"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { app, sweepPlaygroundSessions } from "../index"
import { getUser } from "../database"
import { DEMO_USERNAME } from "../credentials"
import { nextPlaygroundExpiry } from "../playground"
import {
    clearDbEnv,
    countWhere,
    hashPassword,
    loginUser,
    makeTempDir,
    openDb,
    query,
    removeTempDir,
    resetUsers,
    setDbEnv,
    setPlaygroundEnv,
} from "./helpers"

// A playground session is the "I want data but not an account" path. Its whole
// point is that the expensive artefact (a few thousand seeded rows) disappears on
// its own, so these tests pin: the deadline, the concurrency cap, the sweep
// (including evicting the token and the rows), and promotion to a real account.

let dir: string

beforeEach(() => {
    dir = makeTempDir()
    setDbEnv(dir)
    setPlaygroundEnv({ ttlMs: 10 * 60 * 1000, max: 5, enabled: true, windowDays: 30 })
    resetUsers()
})

afterEach(() => {
    clearDbEnv()
    removeTempDir(dir)
})

const txPath = () => path.join(dir, "tx.db")

const startSession = () => request(app).post("/playground/session")

describe("playground sessions", () => {
    it("creates an expiring account with a working token and a seeded dataset", async () => {
        const res = await startSession()

        expect(res.status).toBe(201)
        const { username, accessToken, expiresAt, demoPopulated } = res.body
        expect(username).toMatch(/^guest_[0-9a-f]{10}$/)
        expect(expiresAt).toBeGreaterThan(Date.now())
        expect(demoPopulated).toBe(true)

        // The token has to work, and the rows have to be there for it to show data.
        const symbols = await request(app).get("/data/symbols").set("Authorization", `Bearer ${accessToken}`)
        expect(symbols.status).toBe(200)
        expect(symbols.body.symbols.length).toBeGreaterThan(0)

        const tx = await openDb(txPath())
        const [row] = await query(tx, `SELECT demo_populated, expires_at FROM users WHERE username = ?`, [username])
        expect(Number(row.demo_populated)).toBe(1)
        expect(Number(row.expires_at)).toBe(expiresAt)
        tx.close()
    })

    it("cannot be signed into with a password", async () => {
        const { body } = await startSession()
        const attempt = await loginUser(app, body.username, "demo123")

        expect(attempt.status).not.toBe(200)
        expect(attempt.status).not.toBe(201)
    })

    it("refuses new sessions once the concurrency cap is reached", async () => {
        setPlaygroundEnv({ max: 1 })

        expect((await startSession()).status).toBe(201)
        const full = await startSession()

        expect(full.status).toBe(503)
        expect(String(full.body.error)).toMatch(/capacity/i)
    })

    it("reports itself disabled when switched off", async () => {
        setPlaygroundEnv({ enabled: false })

        expect((await startSession()).status).toBe(503)
    })

    it("deletes an expired session together with its rows and its token", async () => {
        const { body } = await startSession()

        const tx = await openDb(txPath())
        const seeded = await countWhere(tx, "transactions", body.username)
        // Force the deadline into the past rather than waiting for it.
        await query(tx, `UPDATE users SET expires_at = ? WHERE username = ?`, [Date.now() - 1, body.username])
        tx.close()
        expect(seeded).toBeGreaterThan(0)

        expect(await sweepPlaygroundSessions()).toBe(1)

        expect(await getUser(body.username)).toBeUndefined()
        const after = await openDb(txPath())
        expect(await countWhere(after, "transactions", body.username)).toBe(0)
        after.close()

        const replay = await request(app).get("/data/symbols").set("Authorization", `Bearer ${body.accessToken}`)
        expect(replay.status).toBe(401)
    })

    it("never sweeps the bootstrap accounts", async () => {
        await loginUser(app, DEMO_USERNAME, "demo123")

        await sweepPlaygroundSessions()

        expect(await getUser(DEMO_USERNAME)).toBeDefined()
        expect(await getUser("admin")).toBeDefined()
    })

    it("promotes a session into a permanent account with a real password", async () => {
        const { body } = await startSession()
        const kept = await request(app)
            .post("/playground/keep")
            .set("Authorization", `Bearer ${body.accessToken}`)
            .send({ password: hashPassword("kept-secret") })

        expect(kept.status).toBe(200)
        expect(kept.body.expiresAt).toBeNull()
        expect((await getUser(body.username))?.expires_at).toBeNull()

        resetUsers()
        expect((await loginUser(app, body.username, "kept-secret")).status).toBe(200)
    })

    it("refuses to promote an account that never expired", async () => {
        const { body } = await loginUser(app, DEMO_USERNAME, "demo123")
        const res = await request(app)
            .post("/playground/keep")
            .set("Authorization", `Bearer ${body.accessToken}`)
            .send({ password: hashPassword("whatever") })

        expect(res.status).toBe(400)
    })
})

describe("nextPlaygroundExpiry", () => {
    const ttl = 10 * 60 * 1000
    const now = 1_000_000

    it("leaves permanent accounts alone", () => {
        expect(nextPlaygroundExpiry(null, now, ttl)).toBeNull()
    })

    it("does not rewrite a session with most of its time left", () => {
        expect(nextPlaygroundExpiry(now + ttl, now, ttl)).toBeNull()
    })

    it("extends a session that is half spent", () => {
        expect(nextPlaygroundExpiry(now + ttl / 3, now, ttl)).toBe(now + ttl)
    })

    it("never resurrects a lapsed session", () => {
        expect(nextPlaygroundExpiry(now - 1, now, ttl)).toBeNull()
    })
})
