// ── Playground session deadline ─────────────────────────────────────────────
// A playground session is temporary, so the client needs to know when it lapses:
// the banner counts down and offers to convert the session into a real account.
// Stored alongside the token (localStorage) because nothing else on the client
// knows the account's expiry, and cleared on logout.

export const SESSION_EXPIRY_KEY = "tradeopsNexus.sessionExpiresAt"

/** Records the deadline, or removes it for a permanent account. */
export const rememberSessionExpiry = (expiresAt: number | null | undefined) => {
    if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0) {
        localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt))
        return
    }
    localStorage.removeItem(SESSION_EXPIRY_KEY)
}

/** The deadline in epoch ms, or null for a permanent account (or an old session). */
export const readSessionExpiry = (): number | null => {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? value : null
}

export const clearSessionExpiry = () => localStorage.removeItem(SESSION_EXPIRY_KEY)

/**
 * "9:42" under an hour, "1 h 05 m" above it, empty once the deadline has passed —
 * the caller decides what an expired session means.
 */
export const formatRemaining = (expiresAt: number, now = Date.now()): string => {
    const remainingMs = expiresAt - now
    if (remainingMs <= 0) return ""

    const totalSeconds = Math.floor(remainingMs / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} m`
    return `${minutes}:${String(seconds).padStart(2, "0")}`
}
