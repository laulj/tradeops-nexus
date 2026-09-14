// ── Outbound bandwidth budget ────────────────────────────────────────────────
// Outbound traffic is the one metered, billed resource this deployment has:
// Render includes a fixed allowance per workspace-month and charges per GB beyond
// it, with no hard cap and no notification of its own. The SPA is ~99% of what
// this service sends, so a scraper — or a regression that stops compressing and
// caching — is the realistic way to spend money.
//
// This module is deliberately pure: bytes in, tier out, with an injectable clock,
// so the policy is tested without a server, a database or a network.
//
// Tiers, relative to the included allowance (5 GB on Hobby):
//   warn    ≥ 3.5 GB — still free; one alert, nothing user-visible
//   degrade ≥ 5 GB   — the first paid byte: anonymous visitors get a minimal page
//   floor   ≥ 10 GB  — public surface minimal; owner paths keep working
// A burst of EGRESS_BURST_GB_PER_HOUR within a rolling hour jumps straight to
// degrade regardless of the month's position, because that is what a scraper
// looks like from here.

export type EgressTier = "normal" | "warn" | "degrade" | "floor"

const GIB = 1024 ** 3
const MINUTE_MS = 60_000

const envNumber = (name: string, fallback: number): number => {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const egressEnabled = (): boolean => process.env.EGRESS_ENABLED !== "0"

export const includedAllowanceBytes = (): number => envNumber("EGRESS_INCLUDED_GB", 5) * GIB

export const egressWarnBytes = (): number => envNumber("EGRESS_WARN_GB", 3.5) * GIB

export const egressDegradeBytes = (): number => envNumber("EGRESS_DEGRADE_GB", 5) * GIB

export const egressCeilingBytes = (): number => envNumber("EGRESS_HARD_CEILING_GB", 10) * GIB

export const egressBurstBytesPerHour = (): number => envNumber("EGRESS_BURST_GB_PER_HOUR", 2) * GIB

/**
 * Our meter counts response payload bytes; the platform bills everything that
 * leaves the machine (headers, TLS records, connection overhead). This factor
 * keeps the counter an approximation of the bill rather than of our own view of
 * it — calibrate it against the host's bandwidth graph after the first month.
 */
export const egressOverheadFactor = (): number => envNumber("EGRESS_OVERHEAD_FACTOR", 1.1)

/** `0` flushes on every request; production does not need that. */
export const egressFlushMs = (): number => {
    const parsed = Number(process.env.EGRESS_FLUSH_MS)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000
}

/** UTC month, so the period matches the billing period. */
export const egressPeriod = (now: number): string => new Date(now).toISOString().slice(0, 7)

const TIER_ORDER: EgressTier[] = ["normal", "warn", "degrade", "floor"]

const higherTier = (a: EgressTier, b: EgressTier): EgressTier =>
    TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b

/** Position of a tier in the escalation order, for callers comparing two. */
export const egressTierRank = (tier: EgressTier): number => TIER_ORDER.indexOf(tier)

export interface EgressSnapshot {
    period: string
    /** Overhead-adjusted bytes recorded in this period (≈ what gets billed). */
    bytes: number
    tier: EgressTier
    hourlyBytes: number
    includedBytes: number
    warnBytes: number
    degradeBytes: number
    ceilingBytes: number
}

const BUCKETS = 60

interface EgressState {
    period: string
    bytes: number
    pending: number
    tier: EgressTier
    buckets: number[]
    lastBucket: number
    restored: boolean
}

const freshState = (now: number): EgressState => ({
    period: egressPeriod(now),
    bytes: 0,
    pending: 0,
    tier: "normal",
    buckets: new Array<number>(BUCKETS).fill(0),
    lastBucket: Math.floor(now / MINUTE_MS),
    restored: false,
})

let state = freshState(Date.now())

/** Reported by `consumeEgressRollover` so the caller can send a monthly summary. */
let rollover: { period: string; bytes: number } | null = null

/** Test seam. */
export const resetEgressState = (now = Date.now()): void => {
    state = freshState(now)
    rollover = null
}

/**
 * Seeds the counter from the persisted total when the databases open, then marks
 * the period as restored. It *merges* rather than overwrites: the read is async,
 * so by the time it resolves the process may already have measured responses, and
 * resetting the counters here would silently discard them.
 */
export const restoreEgressBytes = (bytes: number, now = Date.now()): void => {
    if (state.restored) return
    state.restored = true
    const persisted = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
    state.bytes = Math.max(state.bytes, persisted)
    state.tier = higherTier(state.tier, tierAt(state.bytes, hourlyBytes()))
}

/** Rolling-hour accounting: 60 one-minute buckets, oldest overwritten first. */
const advanceBuckets = (now: number) => {
    const minute = Math.floor(now / MINUTE_MS)
    const elapsed = Math.min(BUCKETS, Math.max(0, minute - state.lastBucket))
    for (let i = 1; i <= elapsed; i++) state.buckets[(state.lastBucket + i) % BUCKETS] = 0
    if (elapsed > 0) state.lastBucket = minute
}

const hourlyBytes = (): number => state.buckets.reduce((sum, bucket) => sum + bucket, 0)

const tierAt = (bytes: number, hourly: number): EgressTier => {
    if (bytes >= egressCeilingBytes()) return "floor"
    if (bytes >= egressDegradeBytes()) return "degrade"
    if (egressBurstBytesPerHour() > 0 && hourly >= egressBurstBytesPerHour()) return "degrade"
    if (bytes >= egressWarnBytes()) return "warn"
    return "normal"
}

/**
 * Records what one response sent and returns the snapshot *after* recording. The
 * tier never falls back inside a period: a burst that ends must not re-open the
 * public surface mid-month, and the monthly alert should fire once.
 */
export const recordEgress = (bytes: number, now = Date.now()): EgressSnapshot => {
    if (bytes > 0 && Number.isFinite(bytes)) {
        const period = egressPeriod(now)
        if (period !== state.period) {
            rollover = { period: state.period, bytes: state.bytes }
            state = freshState(now)
            state.restored = true
        }
        advanceBuckets(now)
        const adjusted = Math.round(bytes * egressOverheadFactor())
        state.bytes += adjusted
        state.pending += adjusted
        state.buckets[state.lastBucket % BUCKETS] += adjusted
        state.tier = higherTier(state.tier, tierAt(state.bytes, hourlyBytes()))
    }
    return egressSnapshot(now)
}

export const egressSnapshot = (now = Date.now()): EgressSnapshot => {
    advanceBuckets(now)
    return {
        period: state.period,
        bytes: state.bytes,
        tier: state.tier,
        hourlyBytes: hourlyBytes(),
        includedBytes: includedAllowanceBytes(),
        warnBytes: egressWarnBytes(),
        degradeBytes: egressDegradeBytes(),
        ceilingBytes: egressCeilingBytes(),
    }
}

export const currentEgressTier = (): EgressTier => state.tier

/** True while the public surface should stay minimal. */
export const egressDegraded = (): boolean => state.tier === "degrade" || state.tier === "floor"

export const egressFloorReached = (): boolean => state.tier === "floor"

/** Takes the bytes accumulated since the last flush, for persistence. */
export const drainPendingEgress = (): number => {
    const pending = state.pending
    state.pending = 0
    return pending
}

export const egressBytesRestored = (): boolean => state.restored

/** Returns the completed period's total once, for a monthly summary alert. */
export const consumeEgressRollover = (): { period: string; bytes: number } | null => {
    const value = rollover
    rollover = null
    return value
}

/**
 * Whether a request counts as anonymous. "No bearer token and no session marker
 * cookie" — the marker is set at sign-in so that a signed-in visitor reloading
 * the page still gets the application instead of the minimal page.
 */
export const isAnonymousRequest = (headers: Record<string, unknown>): boolean => {
    const authorization = headers["authorization"]
    if (typeof authorization === "string" && authorization.startsWith("Bearer ")) return false
    const cookie = String(headers["cookie"] ?? "")
    return !/(?:^|;\s*)tradeops_session=1(?:;|$)/.test(cookie)
}

export const wantsHtmlOrAsset = (path: string, headers: Record<string, unknown>): boolean =>
    String(headers["accept"] ?? "").includes("text/html") ||
    path.startsWith("/assets/") ||
    /\.[a-z0-9]{2,5}$/i.test(path)
