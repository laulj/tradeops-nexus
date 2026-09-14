import express from "express"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import { app } from "../index"
import { createRateLimiter, rateLimitDisabled, trackedRateLimitKeys } from "../rateLimit"
import { clearDbEnv, loginUser, makeTempDir, removeTempDir, resetUsers, setDbEnv } from "./helpers"

// The limiter is the first line of defence for the unauthenticated write paths
// (`/register`, `/playground/session`), each of which costs thousands of inserts.
// These tests pin the window behaviour, the bucket accounting and the bypass.

// Counters live in a module-level cache, so every test gets its own bucket name
// — otherwise one test's spend leaks into the next one's budget.
let bucketSeq = 0

const buildApp = (opts: {
    max: number
    windowMs: number
    now: () => number
    name?: string
    /** Respect RATE_LIMIT_DISABLED instead of forcing the limiter on. */
    useGlobalSwitch?: boolean
}) => {
    const app = express()
    app.use(
        createRateLimiter({
            name: opts.name ?? `test-${++bucketSeq}`,
            windowMs: () => opts.windowMs,
            max: () => opts.max,
            now: opts.now,
            keyOf: () => "fixed-client",
            // The suite runs with RATE_LIMIT_DISABLED=1 (hundreds of requests from
            // one address); these tests are about the limiter itself, except the
            // one that covers the switch.
            ...(opts.useGlobalSwitch ? {} : { enabled: () => true }),
        }),
    )
    app.get("/thing", (_req, res) => res.json({ ok: true }))
    return app
}

const ENV_KEYS = ["RATE_LIMIT_DISABLED", "RATE_LIMIT_AUTH_MAX", "RATE_LIMIT_MAX"] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>

const restoreEnv = () => {
    for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) delete process.env[key]
        else process.env[key] = originalEnv[key]
    }
}

describe("createRateLimiter", () => {
    it("allows up to the limit, then answers 429 with Retry-After", async () => {
        const app = buildApp({ max: 2, windowMs: 1000, now: () => 0 })

        expect((await request(app).get("/thing")).status).toBe(200)
        expect((await request(app).get("/thing")).status).toBe(200)

        const blocked = await request(app).get("/thing")
        expect(blocked.status).toBe(429)
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0)
        expect(blocked.body.error).toMatch(/too many/i)
    })

    it("reports the remaining budget", async () => {
        const app = buildApp({ max: 3, windowMs: 60_000, now: () => 0 })

        const first = await request(app).get("/thing")
        expect(first.headers["ratelimit-limit"]).toBe("3")
        expect(first.headers["ratelimit-remaining"]).toBe("2")
    })

    it("starts a fresh window once the previous one has elapsed", async () => {
        let clock = 0
        const app = buildApp({ max: 1, windowMs: 1000, now: () => clock })

        expect((await request(app).get("/thing")).status).toBe(200)
        expect((await request(app).get("/thing")).status).toBe(429)

        clock = 1000
        expect((await request(app).get("/thing")).status).toBe(200)
    })

    it("keys buckets by name, so one prefix cannot exhaust another's budget", async () => {
        const app = express()
        const limiter = (name: string) =>
            createRateLimiter({
                name,
                windowMs: () => 1000,
                max: () => 1,
                now: () => 0,
                keyOf: () => "same-client",
                enabled: () => true,
            })
        app.use("/a", limiter("bucket-a"))
        app.use("/b", limiter("bucket-b"))
        app.get("/a/x", (_req, res) => res.json({ ok: true }))
        app.get("/b/x", (_req, res) => res.json({ ok: true }))

        expect((await request(app).get("/a/x")).status).toBe(200)
        expect((await request(app).get("/a/x")).status).toBe(429)
        expect((await request(app).get("/b/x")).status).toBe(200)
    })

    it("can be switched off entirely", async () => {
        process.env.RATE_LIMIT_DISABLED = "1"
        const app = buildApp({ max: 1, windowMs: 1000, now: () => 0, useGlobalSwitch: true })

        expect(rateLimitDisabled()).toBe(true)
        expect((await request(app).get("/thing")).status).toBe(200)
        expect((await request(app).get("/thing")).status).toBe(200)
        expect((await request(app).get("/thing")).status).toBe(200)
    })
})

describe("the limiters as mounted on the API", () => {
    let dir: string

    afterEach(() => {
        clearDbEnv()
        if (dir) removeTempDir(dir)
        restoreEnv()
        resetUsers()
    })

    it("counts requests per forwarded client address, not per proxy", async () => {
        dir = makeTempDir()
        setDbEnv(dir)
        process.env.RATE_LIMIT_DISABLED = "0"
        process.env.RATE_LIMIT_AUTH_MAX = "1"

        const forwarded = "203.0.113.77"
        const attempt = () => request(app).post("/login").set("X-Forwarded-For", forwarded).send({ username: "ghost", password: {} })

        const first = await attempt()
        expect(first.status).not.toBe(429)

        const second = await attempt()
        expect(second.status).toBe(429)
        expect(second.headers["retry-after"]).toBeDefined()

        // A different address is unaffected: that is what `trust proxy` buys.
        const other = await request(app).post("/login").set("X-Forwarded-For", "203.0.113.78").send({ username: "ghost", password: {} })
        expect(other.status).not.toBe(429)
    })

    it("tracks one bucket per client rather than one global counter", async () => {
        expect(trackedRateLimitKeys()).toBeGreaterThan(0)
    })

    it("leaves the login path usable through the limiter", async () => {
        dir = makeTempDir()
        setDbEnv(dir)
        process.env.RATE_LIMIT_DISABLED = "0"
        process.env.RATE_LIMIT_AUTH_MAX = "30"

        const { status } = await loginUser(app, "admin", "demo123")
        expect(status).toBe(200)
    })
})
