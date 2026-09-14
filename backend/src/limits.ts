// ── Resource ceilings ───────────────────────────────────────────────────────
// Every cap in one place, because they only make sense together: a single
// instance, a fixed-size persistent disk and a 512 MB memory limit. Each is
// env-overridable so a bigger host can raise them without a code change.

const positive = (name: string, fallback: number): number => {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Registered accounts, playground sessions included. Registration seeds
 * thousands of rows per account, so this is the friendly version of the disk
 * ceiling below: a clear "no room" instead of SQLITE_FULL.
 */
export const maxAccounts = (): number => positive("MAX_ACCOUNTS", 200)

/** Tokens kept per account. Every sign-in appends one, so an unbounded array is
 * a slow memory leak that a scripted login loop can drive. */
export const maxSessionsPerUser = (): number => positive("MAX_SESSIONS_PER_USER", 5)

/**
 * Per-file size ceiling in MB. The sum of the three databases plus their WAL
 * files has to stay well inside the disk, which also holds snapshots.
 */
export const maxDbMegabytes = (type: "spot" | "spotFuture" | "fundingRate"): number =>
    type === "spot" ? positive("MAX_DB_MB", 256) : positive("MAX_DB_MB_AUX", 128)

/** Request bodies outside `/data`: auth and playground payloads are tiny. */
export const smallBodyLimit = (): string => process.env.BODY_LIMIT?.trim() || "256kb"

/** Request bodies under `/data`: the ingestion workers post batched rows. */
export const dataBodyLimit = (): string => process.env.DATA_BODY_LIMIT?.trim() || "50mb"

/** Largest database file an admin may stage for restore. */
export const maxRestoreMegabytes = (): number => positive("MAX_RESTORE_MB", 320)

/** Restores are destructive and rare, so the allowance is deliberately tiny. */
export const restoreRateLimitMax = (): number => positive("RESTORE_RATE_MAX", 2)
