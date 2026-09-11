import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { app } from "../index"
import { makeTempDir, removeTempDir, setDbEnv, clearDbEnv, resetUsers, registerUser } from "./helpers"
import { aggCache, generateCacheKey, invalidateUserCache } from "../utils"

let dir: string

beforeAll(() => {
    dir = makeTempDir()
    setDbEnv(dir)
})

afterAll(() => {
    clearDbEnv()
    removeTempDir(dir)
})

beforeEach(() => {
    resetUsers()
})

const batch = (token: string, body: Record<string, unknown>) =>
    request(app).post("/data/profits-details/pairing/batch").set("Authorization", `Bearer ${token}`).send(body)

describe("count-only profits request", () => {
    it("returns the full total without the rows, and paging cannot shrink it", async () => {
        const { body } = await registerUser(app, "counter", "pw1", true)
        const token = body.accessToken!
        const pairings = [{ quoteSymbol: "USDC" }]

        const paged = await batch(token, { pairings, page: 1, limit: 1 })
        const countOnly = await batch(token, { pairings, countOnly: true })

        expect(paged.status).toBe(200)
        expect(countOnly.status).toBe(200)

        // The total is a standalone COUNT(*) — asking for one row (or for no rows
        // at all) must not change it, which is what lets the dashboard ask for the
        // count instead of downloading detail rows it only counts.
        expect(paged.body.pagination.total).toBeGreaterThan(1)
        expect(countOnly.body.pagination.total).toBe(paged.body.pagination.total)
        // ...and the rows it would have discarded are not shipped.
        expect(Object.keys(paged.body.data)).not.toHaveLength(0)
        expect(Object.keys(countOnly.body.data)).toHaveLength(0)
    })
})

describe("aggregate cache invalidation", () => {
    it("drops the account's entries and leaves other accounts alone", () => {
        const key = (username: string) =>
            generateCacheKey({ endpoint: "e", type: "spot", username, address: "", interval: "raw", pairings: [] })

        aggCache.set(key("alice"), { n: 1 })
        aggCache.set(key("bob"), { n: 2 })
        // A count-only response must not collide with the row response.
        expect(key("alice")).not.toBe(
            generateCacheKey({ endpoint: "e", type: "spot", username: "alice", address: "", interval: "raw", pairings: [] }) +
                ":count",
        )

        invalidateUserCache("alice")

        expect(aggCache.get(key("alice"))).toBeUndefined()
        expect(aggCache.get(key("bob"))).toEqual({ n: 2 })
    })
})
