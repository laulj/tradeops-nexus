import { randomBytes } from "crypto"
import { ADMIN_USERNAME, DEMO_USERNAME } from "./credentials"
import { countLivePlaygroundUsers, createPlaygroundUser, listExpiredUsernames } from "./database"
import { ensureDemoPopulated, removeUserData } from "./demoData"

// ── Ephemeral playground sessions ───────────────────────────────────────────
// A visitor who wants to see real data without creating an account gets a
// generated identity that expires on its own. That bounds the expensive part —
// a few thousand seeded rows — by concurrency × time-to-live instead of letting
// it accumulate, and nothing depends on a timer, which a deploy would kill.

const PLAYGROUND_PREFIX = "guest_"

const positiveNumberFromEnv = (name: string, fallback: number): number => {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const playgroundEnabled = (): boolean => process.env.PLAYGROUND_ENABLED !== "0"

export const playgroundTtlMs = (): number => positiveNumberFromEnv("PLAYGROUND_TTL_MS", 10 * 60 * 1000)

export const maxPlaygroundAccounts = (): number => positiveNumberFromEnv("MAX_PLAYGROUND_ACCOUNTS", 20)

/** A shorter history than a registered account's: a session is short-lived. */
export const playgroundWindowDays = (): number => positiveNumberFromEnv("PLAYGROUND_WINDOW_DAYS", 365)

/** `0` sweeps on every request (used by tests); production does not need that. */
export const playgroundSweepMs = (): number => {
    const parsed = Number(process.env.PLAYGROUND_SWEEP_MS)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000
}

/** A generated identity: nothing to squat, nothing to guess. */
export const generatePlaygroundUsername = (): string => `${PLAYGROUND_PREFIX}${randomBytes(5).toString("hex")}`

export const isPlaygroundUsername = (username: string): boolean => username.startsWith(PLAYGROUND_PREFIX)

/**
 * The session's stored credential is 32 random bytes that are never disclosed, so
 * the account has no usable password — access comes from the token created for it.
 */
export const createPlaygroundSession = async (): Promise<{ username: string; expiresAt: number }> => {
    const expiresAt = Date.now() + playgroundTtlMs()
    const username = generatePlaygroundUsername()
    await createPlaygroundUser(username, randomBytes(32), expiresAt)
    try {
        await ensureDemoPopulated(username, playgroundWindowDays())
    } catch (err) {
        // Never leave a half-seeded shell behind if the generator throws.
        await removeUserData(username)
        throw err
    }
    return { username, expiresAt }
}

/**
 * Deletes accounts whose deadline has passed, oldest first, and reports which
 * ones went so the caller can evict its in-memory sessions and cached
 * aggregates. The bootstrap accounts carry no deadline, so they cannot be swept.
 */
export const expirePlaygroundSessions = async (limit = 2): Promise<string[]> => {
    const expired = await listExpiredUsernames(Date.now(), limit)
    const removed: string[] = []
    for (const username of expired) {
        if (username === ADMIN_USERNAME || username === DEMO_USERNAME) continue
        await removeUserData(username)
        removed.push(username)
    }
    return removed
}

/** Live sessions, i.e. the ones occupying the concurrency budget. */
export const livePlaygroundSessionCount = (): Promise<number> => countLivePlaygroundUsers(Date.now())

/**
 * Sliding expiry, as a pure function so its boundaries are testable without
 * waiting on a clock. Returns the new deadline, or `null` when nothing should
 * change: permanent accounts never renew, a lapsed session is left to the sweep
 * (renewing it would resurrect an expired account), and a session with most of
 * its time left does not need another write.
 */
export const nextPlaygroundExpiry = (expiresAt: number | null, now: number, ttlMs: number): number | null => {
    if (expiresAt === null) return null
    if (expiresAt <= now) return null
    if (expiresAt - now > ttlMs / 2) return null
    return now + ttlMs
}
