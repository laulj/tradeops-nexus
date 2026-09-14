import { Request, RequestHandler, Response } from "express"
import NodeCache from "node-cache"

// ── Request rate limiting ───────────────────────────────────────────────────
// Runs in-process. That is exact here because a persistent disk forces a single
// instance (Render cannot scale a disk-backed service out), so there is no
// cross-worker counter to reconcile. Buckets are keyed by client address, which
// is why `trust proxy` matters — behind Render's proxy every request would
// otherwise look like it came from the same address.

export interface RateLimiterOptions {
    /** Bucket name, so independent prefixes never share a counter. */
    name: string
    /** Window length in milliseconds (read per request, so it stays tunable). */
    windowMs: () => number
    /** Requests allowed per window (read per request). */
    max: () => number
    /** Defaults to the client address. Authenticated prefixes can key by account. */
    keyOf?: (req: Request) => string
    /** Injectable clock, used by tests. */
    now?: () => number
    /** Defaults to the RATE_LIMIT_DISABLED switch; lets tests opt out of it. */
    enabled?: () => boolean
}

type Counter = { count: number; resetAt: number }

// NodeCache gives us TTL eviction for free, so a bucket disappears once its
// window has passed even if nobody touches that key again.
const counters = new NodeCache({ stdTTL: 0, checkperiod: 30, useClones: false })

export const clientKey = (req: Request): string => req.ip ?? req.socket?.remoteAddress ?? "unknown"

/** Escape hatch for tests and for a deployment that front-ends its own limiter. */
export const rateLimitDisabled = (): boolean => process.env.RATE_LIMIT_DISABLED === "1"

const numberFromEnv = (name: string, fallback: number): number => {
    const parsed = Number(process.env[name])
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const apiRateLimitMax = (): number => numberFromEnv("RATE_LIMIT_MAX", 300)

export const authRateLimitMax = (): number => numberFromEnv("RATE_LIMIT_AUTH_MAX", 30)

export const playgroundRateLimitMax = (): number => numberFromEnv("RATE_LIMIT_PLAYGROUND_MAX", 10)

export const rateLimitWindowMs = (): number => numberFromEnv("RATE_LIMIT_WINDOW_MS", 60_000)

/**
 * Fixed-window limiter. A fixed window (rather than a rolling one) keeps the
 * bookkeeping to a single counter per key and is easy to reason about from the
 * `RateLimit-*` headers we send back.
 */
export const createRateLimiter = (options: RateLimiterOptions): RequestHandler => {
    const now = options.now ?? (() => Date.now())
    const keyOf = options.keyOf ?? clientKey
    const enabled = options.enabled ?? (() => !rateLimitDisabled())

    return (req: Request, res: Response, next) => {
        if (!enabled()) return next()

        const max = options.max()
        const windowMs = options.windowMs()
        const at = now()
        const key = `${options.name}:${keyOf(req)}`

        const existing = counters.get<Counter>(key)
        const counter: Counter = existing && existing.resetAt > at ? existing : { count: 0, resetAt: at + windowMs }

        if (max <= 0 || counter.count >= max) {
            const retryAfter = Math.max(1, Math.ceil((counter.resetAt - at) / 1000))
            res.setHeader("Retry-After", String(retryAfter))
            res.setHeader("RateLimit-Limit", String(max))
            res.setHeader("RateLimit-Remaining", "0")
            return res.status(429).json({ error: "Too many requests — please slow down", retryAfter })
        }

        counter.count += 1
        // TTL follows the window's remaining time so an abandoned bucket is
        // collected and the window stays fixed rather than sliding.
        counters.set(key, counter, Math.max(1, Math.ceil((counter.resetAt - at) / 1000)))
        res.setHeader("RateLimit-Limit", String(max))
        res.setHeader("RateLimit-Remaining", String(max - counter.count))
        return next()
    }
}

/** The limiters the API mounts; each reads its env configuration per request. */
export const apiRateLimiter = (): RequestHandler =>
    createRateLimiter({ name: "api", windowMs: rateLimitWindowMs, max: apiRateLimitMax })

export const authRateLimiter = (): RequestHandler =>
    createRateLimiter({ name: "auth", windowMs: rateLimitWindowMs, max: authRateLimitMax })

export const playgroundRateLimiter = (): RequestHandler =>
    createRateLimiter({ name: "playground", windowMs: rateLimitWindowMs, max: playgroundRateLimitMax })

/** Number of live buckets — surfaced for local debugging. */
export const trackedRateLimitKeys = (): number => counters.keys().length
