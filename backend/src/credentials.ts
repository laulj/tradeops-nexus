// ── Bootstrap credentials ────────────────────────────────────────────────────
// `admin` is the owner's account: the only one that may list or delete users and
// download the raw databases. A convenience default is fine locally, but on a
// public deployment the password must not be the value that ships in this
// repository — so production refuses to start without an explicit one.
//
// `userDemo` is a shared, deliberately public sample account: it is advertised so
// a visitor can look around without registering, holds no privileges, and owns
// nothing but generated rows.
//
// Deliberately a leaf module (it imports nothing) so database.ts, guards.ts and
// index.ts can share one definition without creating an import cycle.
export const ADMIN_USERNAME = "admin"
export const DEMO_USERNAME = "userDemo"

/** Usernames only the server may create; /register rejects them. */
export const RESERVED_USERNAMES: readonly string[] = [ADMIN_USERNAME, DEMO_USERNAME]

/** Development-only convenience passwords. Public knowledge. */
const DEV_ADMIN_PASSWORD = "demo123"
const DEV_DEMO_PASSWORD = "demo123"

/** True when the process is expected to serve real traffic. */
export const isProduction = (): boolean => process.env.NODE_ENV === "production"

const configured = (name: string): string | undefined => {
    const value = process.env[name]?.trim()
    return value ? value : undefined
}

/**
 * Password stored (as a keccak-256 hash) for the bootstrap admin account.
 * Throws in production when unset: this account can export every database.
 */
export const adminPassword = (): string => {
    const value = configured("ADMIN_PASSWORD")
    if (value) return value
    if (isProduction()) {
        throw new Error(
            "ADMIN_PASSWORD is required when NODE_ENV=production — the built-in demo123 default would let anyone sign in as admin and download the databases.",
        )
    }
    return DEV_ADMIN_PASSWORD
}

/**
 * Password for the shared sample account. The default is intentional and safe
 * to publish: the account owns only generated rows and can do nothing an
 * anonymous visitor could not do anyway.
 */
export const demoPassword = (): string => configured("DEMO_PASSWORD") ?? DEV_DEMO_PASSWORD

/** Fail fast at boot rather than on the first request that touches `users`. */
export const assertCredentialsConfigured = (): void => {
    adminPassword()
}

/** Case-insensitive check used by /register so nobody can claim a bootstrap account. */
export const isReservedUsername = (username: string): boolean =>
    RESERVED_USERNAMES.some((reserved) => reserved.toLowerCase() === username.trim().toLowerCase())

