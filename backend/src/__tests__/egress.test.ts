import path from "path"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { app, maintainCostControls } from "../index"
import { readEgressBytes } from "../database"
import { DEMO_USERNAME } from "../credentials"
import {
    currentEgressTier,
    egressDegraded,
    egressPeriod,
    egressSnapshot,
    isAnonymousRequest,
    recordEgress,
    resetEgressState,
    restoreEgressBytes,
    wantsHtmlOrAsset,
} from "../egress"
import { clearDbEnv, loginUser, makeTempDir, removeTempDir, resetUsers, setDbEnv, setEgressEnv } from "./helpers"

// The budget is the only thing standing between an abuse loop and a bill, so the
// policy is tested directly (injected clock, no I/O) and then through the app.

const GIB = 1024 ** 3

describe("egress budget policy", () => {
    beforeEach(() => {
        resetEgressState(0)
        setEgressEnv({ warnGb: 0.5, degradeGb: 1, ceilingGb: 2, burstGbPerHour: 10, overheadFactor: 1 })
    })

    afterEach(() => {
        clearDbEnv()
        resetEgressState(0)
    })

    it("stays normal below the warn threshold", () => {
        expect(recordEgress(GIB * 0.4, 0).tier).toBe("normal")
    })

    it("warns while still inside the free allowance and never falls back", () => {
        expect(recordEgress(GIB * 0.6, 0).tier).toBe("warn")
        // A quiet period must not re-open the free tier mid-month.
        expect(recordEgress(0, 60_000).tier).toBe("warn")
    })

    it("degrades at the first paid byte and floors at the ceiling", () => {
        expect(recordEgress(GIB, 0).tier).toBe("degrade")
        expect(recordEgress(GIB, 0).tier).toBe("floor")
    })

    it("escalates on a burst while the month is still young", () => {
        setEgressEnv({ warnGb: 5, degradeGb: 8, ceilingGb: 20, burstGbPerHour: 1, overheadFactor: 1 })

        const snapshot = recordEgress(GIB * 1.2, 0)

        expect(snapshot.tier).toBe("degrade")
        expect(snapshot.bytes).toBeLessThan(GIB * 8)
    })

    it("ages the burst window out without de-escalating", () => {
        setEgressEnv({ warnGb: 5, degradeGb: 8, ceilingGb: 20, burstGbPerHour: 1, overheadFactor: 1 })
        recordEgress(GIB * 1.2, 0)

        const later = egressSnapshot(2 * 60 * 60 * 1000)

        expect(later.hourlyBytes).toBe(0)
        expect(later.tier).toBe("degrade")
    })

    it("applies the overhead factor to what it records", () => {
        setEgressEnv({ overheadFactor: 2 })

        expect(recordEgress(1_000, 0).bytes).toBe(2_000)
    })

    it("restores a persisted total and derives the tier from it", () => {
        restoreEgressBytes(GIB * 1.5, 0)

        expect(egressSnapshot(0).bytes).toBe(GIB * 1.5)
        expect(currentEgressTier()).toBe("degrade")
    })

    it("reports the period as a UTC month", () => {
        expect(egressPeriod(Date.UTC(2026, 8, 14))).toBe("2026-09")
    })

    it("classifies anonymous and asset requests for the gate", () => {
        expect(isAnonymousRequest({})).toBe(true)
        expect(isAnonymousRequest({ cookie: "a=1; tradeops_session=1" })).toBe(false)
        expect(isAnonymousRequest({ authorization: "Bearer tok" })).toBe(false)

        expect(wantsHtmlOrAsset("/", { accept: "text/html" })).toBe(true)
        expect(wantsHtmlOrAsset("/assets/app-abc.js", {})).toBe(true)
        expect(wantsHtmlOrAsset("/usage", { accept: "application/json" })).toBe(false)
    })
})

describe("the meter and gate in the app", () => {
    let dir: string

    beforeEach(() => {
        dir = makeTempDir()
        setDbEnv(dir)
        resetUsers()
        resetEgressState(Date.now())
        setEgressEnv({ warnGb: 5, degradeGb: 5, ceilingGb: 10, burstGbPerHour: 0, overheadFactor: 1, flushMs: 0 })
    })

    afterEach(() => {
        clearDbEnv()
        removeTempDir(dir)
        resetEgressState(Date.now())
    })

    it("records the bytes a response sends", async () => {
        await request(app).get("/login").set("Accept", "application/json")

        expect(egressSnapshot().bytes).toBeGreaterThan(0)
    })

    it("keeps /usage to the owner", async () => {
        const admin = await loginUser(app, "admin", "demo123")
        const mine = await request(app).get("/usage").set("Authorization", `Bearer ${admin.body.accessToken}`)
        expect(mine.status).toBe(200)
        expect(mine.body.period).toBe(egressPeriod(Date.now()))

        const demo = await loginUser(app, DEMO_USERNAME, "demo123")
        const theirs = await request(app).get("/usage").set("Authorization", `Bearer ${demo.body.accessToken}`)
        expect(theirs.status).toBe(403)
    })

    it("persists the month's total so a restart does not reset it", async () => {
        await request(app).get("/login").set("Accept", "application/json")
        // The request path already kicked a run off; joining it and running once
        // more guarantees the flush covers the bytes just recorded.
        await maintainCostControls()
        await maintainCostControls()

        const stored = await readEgressBytes(egressPeriod(Date.now()))
        expect(stored).toBeGreaterThan(0)

        // Simulate a restart: state is fresh, then the restore path refills it.
        resetEgressState(Date.now())
        expect(egressSnapshot().bytes).toBe(0)

        await maintainCostControls()
        expect(egressSnapshot().bytes).toBe(stored)
    })

    it("shrinks the public surface to a minimal page once degraded", async () => {
        // Any recorded byte at all puts us over the degrade threshold.
        setEgressEnv({ degradeGb: 0.000000000001 })
        await request(app).get("/login").set("Accept", "application/json")
        expect(egressDegraded()).toBe(true)

        const anonymous = await request(app).get("/assets/app-abc123.js")
        expect(anonymous.status).toBe(503)
        expect(anonymous.text).toMatch(/bandwidth-saving mode/i)
        expect(anonymous.headers["x-egress-tier"]).toMatch(/degrade|floor/)

        // A signed-in visitor's page load keeps working (marker cookie).
        const signedIn = await request(app).get("/assets/app-abc123.js").set("Cookie", "tradeops_session=1")
        expect(signedIn.status).not.toBe(503)

        // New playground sessions stop: each one seeds thousands of rows.
        const playground = await request(app).post("/playground/session")
        expect(playground.status).toBe(503)
    })
})

