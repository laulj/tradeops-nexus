// ── Bootstrap credentials ────────────────────────────────────────────────────
// `admin` is the owner's account: it is the only one that may list or delete
// users and download the raw databases. A convenience default is fine locally,
// but on a public deployment the password must not be the value that ships in
// this repository — so production refuses to start without an explicit one.
//
// Deliberately a leaf module (it imports nothing) so database.ts, guards.ts and
// index.ts can share one definition without creating an import cycle.
export const ADMIN_USERNAME = "admin"

/** Development-only convenience password. Public knowledge; never for prod. */
const DEV_ADMIN_PASSWORD = "demo123"

/** True when the process is expected to serve real traffic. */
export const isProduction = (): boolean => process.env.NODE_ENV === "production"

const configuredAdminPassword = (): string | undefined => {
    const value = process.env.ADMIN_PASSWORD?.trim()
    return value ? value : undefined
}

/**
 * Password stored (as a keccak-256 hash) for the bootstrap admin account.
 * Throws in production when unset: this account can export every database.
 */
export const adminPassword = (): string => {
    const configured = configuredAdminPassword()
    if (configured) return configured
    if (isProduction()) {
        throw new Error(
            "ADMIN_PASSWORD is required when NODE_ENV=production — the built-in demo123 default would let anyone sign in as admin and download the databases.",
        )
    }
    return DEV_ADMIN_PASSWORD
}

/** Fail fast at boot rather than on the first request that touches `users`. */
export const assertCredentialsConfigured = (): void => {
    adminPassword()
}
