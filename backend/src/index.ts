import path from "path"
import cors from "cors"
import { readFile, writeFile } from "fs/promises"
import express, { Express, Request, RequestHandler, Response, NextFunction } from "express"
import { bytesToHex, equalsBytes } from "ethereum-cryptography/utils"
import { authenticateMiddleware, initMiddleware } from "./middleware"
import { requireAdmin } from "./guards"
import { ADMIN_USERNAME, DEMO_USERNAME, isProduction, isReservedUsername } from "./credentials"
import { database, countUsers, getUser, createUser, isStorageFullError, listUsers, setUserExpiry, promoteUser } from "./database"
import { addEgressBytes, getAlertState, readEgressBytes, setAlertState } from "./database"
import { populateDemoData, removeUserData, demoAddress, DEMO_SYMBOLS, ensureDemoPopulated } from "./demoData"
import {
    createPlaygroundSession,
    expirePlaygroundSessions,
    livePlaygroundSessionCount,
    maxPlaygroundAccounts,
    nextPlaygroundExpiry,
    playgroundEnabled,
    playgroundSweepMs,
    playgroundTtlMs,
} from "./playground"
import { apiRateLimiter, authRateLimiter, createRateLimiter, playgroundRateLimiter } from "./rateLimit"
import {
    consumeEgressRollover,
    currentEgressTier,
    drainPendingEgress,
    egressBytesRestored,
    egressDegraded,
    egressFloorReached,
    egressFlushMs,
    egressPeriod,
    egressSnapshot,
    egressTierRank,
    includedAllowanceBytes,
    isAnonymousRequest,
    recordEgress,
    restoreEgressBytes,
    wantsHtmlOrAsset,
} from "./egress"
import { alertBootTestMode, alertChannelConfigured, sendAlert, sendAlertChannelTest } from "./alerts"
import { dataBodyLimit, maxAccounts, maxSessionsPerUser, restoreRateLimitMax, smallBodyLimit } from "./limits"
import {
    RESTORE_TARGETS,
    ensureBackupDir,
    inspectSqliteFile,
    isRestoreTarget,
    maxRestoreBytes,
    missingRequiredTables,
    pendingPathFor,
    removeFile,
    sha256File,
    snapshotPathFor,
    stageUpload,
    type RestoreTarget,
} from "./backup"
import type { EgressTier } from "./egress"
import { invalidateUserCache } from "./utils"
import { dataRouter } from "./databaseRouter"
import { Secret, sign, SignOptions, verify } from "jsonwebtoken"
import type { StringValue } from "ms"
import { randomBytes } from "crypto"
import { promisify } from "util"
import { spotFutureDataRouter } from "./futureDatabaseRouter"
import { fundingRateDataRouter } from "./fundingRateDatabaseRouter"
import compression from "compression"
import { serveHashedAssets, serveSpaFiles } from "./staticAssets"

const signAsync = promisify(
    sign as (payload: string | object | Buffer, secretOrPrivateKey: Secret, options: SignOptions) => void,
) as (payload: string | object | Buffer, secret: Secret, options: SignOptions) => Promise<string>

// Simple user database
type Address = string
type Symbol = string
type Statuses = "Good" | "Halted" | "Stopped"
export type Status = { [key: Address]: { [key: Symbol]: Statuses } }
export type UpTime = { [key: Address]: { [key: Symbol]: { start: string; end: string } } }
interface User {
    name: string
    pass: Uint8Array
    JWT: string[]
    status: Status
    upTime: UpTime
    /** Playground sessions expire; `null` marks a permanent account. */
    expiresAt: number | null
}
export interface profitIntervalType {
    key: string
    address: string
    baseSymbol: string
    quoteSymbol: string
    timestamp: string
    amount: number
    ratio: number
}
export interface balanceResponse {
    key: string
    address: string
    timestamp: string
    amount: number
}
// Seed status/upTime for the bootstrap admin account (existing behaviour kept).
const adminStatus: Status = {
    "0x21b412d9A4368E6ff5b6d301e4Aa64ff8b8aA7db": {
        AKT: "Good",
        OSMO: "Good",
        FET: "Good",
        testingCustomLongName: "Good",
    },
    "0x24a11145044a453C39B028F6A3C8d80fB9e48885": { OSMO: "Good", testingCustomLongName: "Good" },
}
const adminUpTime: UpTime = {
    "0x21b412d9A4368E6ff5b6d301e4Aa64ff8b8aA7db": {
        AKT: { start: (Date.now() - 1 * 24 * 60 * 60 * 1000).toString(), end: Date.now().toString() },
        OSMO: { start: (Date.now() - 100 * 24 * 60 * 60 * 1000).toString(), end: Date.now().toString() },
        FET: { start: (Date.now() - 1000 * 24 * 60 * 60 * 1000).toString(), end: Date.now().toString() },
        testingCustomLongName: {
            start: (Date.now() - 1000 * 24 * 60 * 60 * 1000).toString(),
            end: Date.now().toString(),
        },
    },
    "0x24a11145044a453C39B028F6A3C8d80fB9e48885": {
        OSMO: { start: (Date.now() - 100 * 24 * 60 * 60 * 1000).toString(), end: Date.now().toString() },
        testingCustomLongName: { start: (Date.now() - 1000 * 24 * 60 * 60 * 1000).toString(), end: Date.now().toString() },
    },
}

// Seed status/upTime for demo-populated accounts (derived deterministically from
// the username, mirroring the admin bootstrap above so Settings pages render).
const demoStatusFor = (username: string): Status => {
    const status: Status = {}
    for (let i = 0; i < 2; i++) {
        status[demoAddress(username, i)] = Object.fromEntries(DEMO_SYMBOLS.map((s) => [s, "Good" as Statuses]))
    }
    return status
}
const demoUpTimeFor = (username: string): UpTime => {
    const upTime: UpTime = {}
    for (let i = 0; i < 2; i++) {
        upTime[demoAddress(username, i)] = Object.fromEntries(
            DEMO_SYMBOLS.map((s) => [
                s,
                { start: (Date.now() - 30 * 24 * 60 * 60 * 1000).toString(), end: Date.now().toString() },
            ]),
        )
    }
    return upTime
}

// In-memory sessions (JWT lists + status/upTime) keyed by username. Credentials
// live in the SQLite `users` table (tx.db); sessions are created lazily.
export var users: { [key: string]: User } = {}

// Load (or lazily create) the in-memory session for a username.
const ensureUserSession = async (username: string): Promise<User | undefined> => {
    if (users[username]) return users[username]
    const record = await getUser(username)
    if (!record) return undefined
    const demo = Boolean(record.demo_populated)
    users[username] = {
        name: username,
        pass: Uint8Array.from(record.password_hash),
        JWT: [],
        status: username === ADMIN_USERNAME ? adminStatus : demo ? demoStatusFor(username) : {},
        upTime: username === ADMIN_USERNAME ? adminUpTime : demo ? demoUpTimeFor(username) : {},
        expiresAt: record.expires_at ?? null,
    }
    return users[username]
}
let cachedSecret: string | null = null

const statusUpdate = (interval: number = 20 * 60 * 1000) => {
    const usernames = Object.keys(users)
    for (const username of usernames) {
        const user = users[username]
        const { status, upTime } = user

        const addresses = Object.keys(upTime)
        for (const address of addresses) {
            const coinSymbols = Object.keys(upTime[address])

            for (const coinSymbol of coinSymbols) {
                const { end } = upTime[address][coinSymbol]

                // Set to offline
                if (Date.now() - Number(end) >= interval) status[address][coinSymbol] = "Stopped"
            }
        }
    }
}
export var invalidatedJWTokens: string[] = []

export const app: Express = express()
// Render terminates TLS in front of the service and forwards the client address,
// so without this every request would appear to come from the proxy and a single
// rate-limit bucket would throttle all visitors at once.
app.set("trust proxy", 1)
export const port = process.env.PORT || 8080

// Built SPA. Vite emits to frontend/dist, and the compiled backend runs from
// backend/dist, so this resolves to <repo>/frontend/dist at runtime.
const SPA_DIR = path.join(__dirname, "../../frontend/dist")
const SPA_INDEX = path.join(SPA_DIR, "index.html")

// Serve the SPA for browser navigations. Mirrors the Vite dev proxy's
// Accept: text/html fallback so deep links and refreshes on a client route render
// the app instead of hitting an API handler (GET /login answers XHR with 401 JSON).
const isHtmlNavigation = (req: Request) => String(req.headers.accept ?? "").includes("text/html")

// A marker cookie (never the token) lets the bandwidth gate distinguish a
// signed-in visitor's page load — which carries no Authorization header — from an
// anonymous one, so degraded mode does not punish the owner's own refresh.
const SESSION_MARKER = "tradeops_session"

const setSessionMarker = (res: Response) => {
    res.cookie(SESSION_MARKER, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction(),
        maxAge: 30 * 24 * 60 * 60 * 1000,
    })
}

// Every sign-in appends a token and nothing ever removed them, so a scripted login
// loop grew this array without bound. Keep only the newest few per account.
const rememberToken = (user: User, token: string) => {
    user.JWT.push(token)
    const max = maxSessionsPerUser()
    if (user.JWT.length > max) user.JWT.splice(0, user.JWT.length - max)
}

app.use(cors())
// ── Outbound bandwidth accounting ───────────────────────────────────────────
// Bytes are attributed per response from the socket's write-counter delta, which
// stays correct on keep-alive connections and for gzip/chunked responses where
// Content-Length is absent. Registered this early so no response escapes the
// meter. The tier is exposed on every response so `curl -I` shows the state.
app.use((req: Request, res: Response, next: NextFunction) => {
    const startBytes = res.socket?.bytesWritten ?? 0

    // `res.write`/`res.end` are wrapped as well, because the socket can already be
    // gone by the time `finish` fires (short-lived connections), which would leave
    // the delta at zero. compression() wraps these methods *after* us, so the
    // wrapper still sees the compressed bytes that actually go on the wire.
    let written = 0
    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
        if (chunk) written += Buffer.byteLength(chunk as Buffer)
        return originalWrite(chunk as never, ...(rest as never[]))
    }) as typeof res.write

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
        if (chunk) written += Buffer.byteLength(chunk as Buffer)
        return originalEnd(chunk as never, ...(rest as never[]))
    }) as typeof res.end

    res.setHeader("X-Egress-Tier", currentEgressTier())
    res.on("finish", () => {
        const socketDelta = (res.socket?.bytesWritten ?? startBytes) - startBytes
        const sent = socketDelta > 0 ? socketDelta : written
        if (Number.isFinite(sent) && sent > 0) recordEgress(sent)
    })
    next()
})
// Compress before anything else: `compression()` wraps res.write/res.end for the
// handlers registered *after* it, so mounting it below express.static() left
// every asset (including the ~1.5 MB app chunk) uncompressed on the wire.
app.use(compression())
// Bodies are parsed with two limits: a small one protects every route including
// the unauthenticated ones, while the ingestion workers — which post batched rows
// to /data — keep the large one. Previously every route accepted 50 MB, which is
// a cheap way to make a 512 MB instance work hard.
const smallJson = express.json({ limit: smallBodyLimit() })
const smallForm = express.urlencoded({ limit: smallBodyLimit(), extended: true })
const largeJson = express.json({ limit: dataBodyLimit() })
const largeForm = express.urlencoded({ limit: dataBodyLimit(), extended: true })
const unlessData = (parser: RequestHandler): RequestHandler => (req, res, next) =>
    req.path.startsWith("/data") ? next() : parser(req, res, next)

app.use(unlessData(smallJson))
app.use(unlessData(smallForm)) // For parsing application/x-www-form-urlencoded
app.use("/data", largeJson)
app.use("/data", largeForm)

// ── Bandwidth tier gate ─────────────────────────────────────────────────────
// Once the budget is spent the public surface shrinks to a ~2 KB page while
// signed-in visitors keep the application — a breaker must never lock the owner
// out of their own deployment. Registered before initMiddleware so a blocked
// request costs no database work either.
const LIGHT_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeOps Nexus — bandwidth budget reached</title></head>
<body style="font-family:system-ui,sans-serif;margin:3rem auto;max-width:34rem;line-height:1.6;padding:0 1.5rem">
<h1 style="font-size:1.25rem">TradeOps Nexus is in bandwidth-saving mode</h1>
<p>This deployment has reached the monthly outbound-bandwidth budget, so visitors without a session are being served this page instead of the application (~2 KB instead of ~1 MB).</p>
<p><a href="/login">Sign in</a> to keep using it, or come back next month.</p>
</body></html>`

app.use((req: Request, res: Response, next: NextFunction) => {
    if (!egressDegraded()) return next()

    // Aggregates accept a `limit`: 50 rows instead of 500 is roughly a tenth of
    // the bytes for the same query.
    const clamp = (value: unknown) => (Number(value) > 50 ? 50 : value)
    if (typeof req.query?.limit !== "undefined") req.query.limit = String(clamp(req.query.limit))
    if (req.body && typeof req.body === "object" && "limit" in req.body) {
        ;(req.body as Record<string, unknown>).limit = clamp((req.body as Record<string, unknown>).limit)
    }

    // Every playground session seeds thousands of rows, so it stops first.
    if (req.path.startsWith("/playground/")) {
        return res
            .status(503)
            .json({ error: "The playground is paused while this deployment is over its bandwidth budget" })
    }

    if (!isAnonymousRequest(req.headers)) return next()
    if (req.method === "POST") return next() // sign-in and registration keep working
    if (egressFloorReached() || wantsHtmlOrAsset(req.path, req.headers)) {
        res.setHeader("Cache-Control", "no-store")
        return res.status(503).type("html").send(LIGHT_PAGE)
    }
    return next()
})

app.use(initMiddleware)
// Hashed chunks cache immutably; named files (index.html, favicon, og-image)
// revalidate so a deploy is picked up on the next request.
app.use("/assets", serveHashedAssets(SPA_DIR))
app.use(serveSpaFiles(SPA_DIR))

// ── Rate limiting ───────────────────────────────────────────────────────────
// Only the API prefixes: static assets are immutably cached and a first page load
// legitimately fetches a dozen of them, so limiting them would break browsing
// without protecting anything. `/register` and `/playground` are the expensive
// paths — each seeds thousands of rows — so they get their own tighter buckets.
app.use(["/login", "/register", "/logout", "/status", "/users", "/data"], apiRateLimiter())
app.use(["/login", "/register"], authRateLimiter())
app.use("/playground", playgroundRateLimiter())
// A restore is destructive and rare, so it gets the tightest budget of all.
app.use(
    "/admin",
    createRateLimiter({ name: "admin-restore", windowMs: () => 60 * 60 * 1000, max: restoreRateLimitMax }),
)

export async function authenticate(name: string, pass: object) {
    if (!name || !pass) return false
    try {
        // Load the session from the SQLite users table (lazily) and compare the
        // keccak-hashed password bytes.
        const user = await ensureUserSession(name)
        if (!user) return false
        // Safe conversion of incoming hashed password object values to Uint8Array
        const passBytes = Uint8Array.from(Object.values(pass))
        return equalsBytes(user.pass, passBytes)
    } catch {
        return false
    }
}

export const getSecret = async () => {
    // An explicit secret is what keeps sessions valid across restarts: the file
    // fallback below lives outside the persistent disk, so a deploy regenerates it
    // and signs everyone out.
    const configured = process.env.JWT_SECRET?.trim()
    if (configured) return configured

    if (cachedSecret) return cachedSecret
    try {
        cachedSecret = (await readFile("./secret.key")).toString().trim()
        return cachedSecret
    } catch (err: any) {
        if (err.code === "ENOENT") {
            const newKey = bytesToHex(randomBytes(64))
            await writeFile("./secret.key", newKey)
            cachedSecret = newKey
            return cachedSecret
        }
        throw err
    }
}

export const generateAccessToken = async (expiresIn: StringValue, username: string = "admin") => {
    const secret = await getSecret()
    const token = await signAsync({ sub: username }, secret, { expiresIn })
    if (!token) throw new Error("JWT generation runtime anomaly")

    return token
}

export const getUsernameByJWT = async (token: string): Promise<string | undefined> => {
    try {
        const secret = await getSecret()
        const payload = verify(token, secret) as { sub?: string }
        const username = payload?.sub
        if (!username || !users[username]) return undefined
        // Only accept tokens that were issued to this user and not logged out
        if (!users[username].JWT.includes(token)) return undefined

        // Sliding expiry for playground sessions: an active visitor should not be
        // cut off mid-session, but this stays cheap because the decision is made
        // from the in-memory deadline and only writes at most once per half-TTL.
        const session = users[username]
        const nextExpiry = nextPlaygroundExpiry(session.expiresAt, Date.now(), playgroundTtlMs())
        if (nextExpiry !== null) {
            session.expiresAt = nextExpiry
            void setUserExpiry(username, nextExpiry).catch(() => {})
        }
        return username
    } catch {
        return undefined
    }
}

// ── Playground maintenance ──────────────────────────────────────────────────
// Sweeping is opportunistic rather than scheduled: the process restarts on every
// deploy (so a timer would be lost) and the work is trivial when there is nothing
// to do. One sweep at a time, at most once per PLAYGROUND_SWEEP_MS.
export const sweepPlaygroundSessions = async (): Promise<number> => {
    const expired = await expirePlaygroundSessions()
    for (const username of expired) {
        delete users[username] // in-memory session
        invalidateUserCache(username) // cached aggregates for that account
    }
    if (expired.length > 0) console.log(`INFO -- expired ${expired.length} playground session(s)`)
    return expired.length
}

let lastPlaygroundSweep = 0
let playgroundSweepInFlight = false

const maybeSweepPlaygroundSessions = () => {
    const now = Date.now()
    if (playgroundSweepInFlight || now - lastPlaygroundSweep < playgroundSweepMs()) return
    lastPlaygroundSweep = now
    playgroundSweepInFlight = true
    void sweepPlaygroundSessions()
        .catch((err) => console.error("Playground sweep failed:", err))
        .finally(() => {
            playgroundSweepInFlight = false
        })
}

// ── Cost-control maintenance ────────────────────────────────────────────────
// Backs the byte counter with SQLite (so a deploy cannot reset the month), fires
// the tier alerts and sends the alert-channel smoke test on the first request
// after startup. Throttled and single-flight, because it runs inside the request
// path and must never be able to slow a response down.
const EGRESS_BOOT_TEST_KEY = "alert-boot-test-sent"

const gigabytes = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(2)} GB`

const describeEgress = (now = Date.now()): string => {
    const snapshot = egressSnapshot(now)
    return [
        `period ${snapshot.period}`,
        `${gigabytes(snapshot.bytes)} recorded against ${gigabytes(snapshot.includedBytes)} included`,
        `last hour: ${gigabytes(snapshot.hourlyBytes)}`,
        `tier ${snapshot.tier} — warn ${gigabytes(snapshot.warnBytes)}, degrade ${gigabytes(snapshot.degradeBytes)}, floor ${gigabytes(snapshot.ceilingBytes)}`,
    ].join("\n")
}

let lastAlertedEgressTier: EgressTier = "normal"
let egressMaintenanceRun: Promise<void> | null = null
let lastEgressFlushAt = 0
let alertBootTestChecked = false

/**
 * Joins an in-flight run rather than skipping it, so a caller can rely on a run
 * having completed by the time this resolves — the request path fires this
 * without awaiting, and a test (or a future admin action) may need the guarantee.
 */
export const maintainCostControls = async (): Promise<void> => {
    if (!database.db) return
    if (egressMaintenanceRun) return egressMaintenanceRun
    egressMaintenanceRun = runCostControlMaintenance().finally(() => {
        egressMaintenanceRun = null
    })
    return egressMaintenanceRun
}

const runCostControlMaintenance = async (): Promise<void> => {
    try {
        const now = Date.now()
        const period = egressPeriod(now)

        // Restore once per process: the month's total has to survive deploys.
        if (!egressBytesRestored()) restoreEgressBytes(await readEgressBytes(period), now)

        if (now - lastEgressFlushAt >= egressFlushMs()) {
            lastEgressFlushAt = now
            const pending = drainPendingEgress()
            if (pending > 0) await addEgressBytes(period, pending)
        }

        const snapshot = egressSnapshot(now)
        if (snapshot.tier !== lastAlertedEgressTier) {
            const escalated = egressTierRank(snapshot.tier) > egressTierRank(lastAlertedEgressTier)
            lastAlertedEgressTier = snapshot.tier
            if (escalated && alertChannelConfigured()) {
                void sendAlert({
                    subject: `[tradeops-nexus] bandwidth tier: ${snapshot.tier}`,
                    body: describeEgress(now),
                })
            }
        }

        const rolled = consumeEgressRollover()
        if (rolled && alertChannelConfigured()) {
            void sendAlert({
                subject: `[tradeops-nexus] bandwidth ${rolled.period} closed at ${gigabytes(rolled.bytes)}`,
                body: `Period ${rolled.period} ended with ${gigabytes(rolled.bytes)} of outbound traffic recorded (included allowance ${gigabytes(includedAllowanceBytes())}).\n\nCompare this with the host's bandwidth graph to calibrate EGRESS_OVERHEAD_FACTOR.`,
            })
        }

        // Prove the alert channel works on the first request after startup, while
        // a bad key or an unverified sender is still cheap to notice.
        if (!alertBootTestChecked && alertChannelConfigured() && alertBootTestMode() !== "off") {
            alertBootTestChecked = true
            const alreadySent = (await getAlertState(EGRESS_BOOT_TEST_KEY)) === "1"
            if (alertBootTestMode() === "always" || !alreadySent) {
                const result = await sendAlertChannelTest()
                if (result.delivered > 0) await setAlertState(EGRESS_BOOT_TEST_KEY, "1")
            }
        }
    } catch (err) {
        console.error("Cost-control maintenance failed:", err)
    }
}

// a middleware function with no mount path. This code is executed for every request to the router
app.use((req: Request, res: Response, next: NextFunction) => {
    // Capture start time in nanoseconds
    const start = process.hrtime.bigint()
    // console.log(`Request URL: ${req.method} -- ${req.originalUrl} ip: ${req.ip}`)

    // Listen for the response to finish sending
    res.on("finish", () => {
        const end = process.hrtime.bigint()
        // Convert nanoseconds to milliseconds
        const duration = Number(end - start) / 1e6

        console.log(`DEBUG -- ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`)
    })

    // Expired playground sessions are cleaned up from traffic rather than a timer.
    maybeSweepPlaygroundSessions()
    // Same for the bandwidth counter: persisted, alerted and smoke-tested from
    // traffic, because nothing else survives a deploy.
    void maintainCostControls()
    next()
})

// ── The specification ───────────────────────────────────────────────────────
// Served straight from the repository copy — the same file
// `src/__tests__/openapi.test.ts` validates against the route table, so what an
// integrator downloads cannot drift from what the code does. Public on purpose:
// the document is already in a public repository, and it is only useful before
// anyone has an account. ETag + a short max-age turn repeat fetches into 304s
// that cost nothing to send, and the bandwidth gate replaces it with the light
// page for anonymous visitors once the tier degrades, like any other public
// asset.
const OPENAPI_SPEC = path.join(__dirname, "../../docs/openapi.json")

app.get("/openapi.json", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=300")
    res.sendFile(OPENAPI_SPEC, (error) => {
        if (!error || res.headersSent) return
        // The document ships with the repository, so this is a broken deploy:
        // answer 503 instead of an HTML stack trace.
        res.status(503).json({ error: "The API specification is unavailable on this deployment" })
    })
})

// The rendered reference at /docs. A separate HTML entry (frontend/docs.html)
// rather than a route into the SPA: the renderer it loads on demand is larger
// than the whole dashboard, and keeping it outside the app's chunk graph is what
// `frontend/scripts/check-bundle-size.mjs` enforces.
const DOCS_PAGE = path.join(SPA_DIR, "docs.html")

app.get("/docs", (_req: Request, res: Response) => {
    res.sendFile(DOCS_PAGE, (error) => {
        if (!error || res.headersSent) return
        // A checkout without a frontend build (CI's backend job, for one) has no
        // docs page. Say so plainly.
        res.status(404).type("text").send("The API reference page is not part of this build.")
    })
})

app.get("/", (req: Request, res: Response) => {
    res.sendFile(SPA_INDEX)

    // Change coin status to OFFLINE if it hasn't been updated for (default to 20 mins)
    statusUpdate()
})

// Browser navigation (refresh / deep link) on the login screen: serve the SPA.
// XHR callers fall through to the API handler below.
app.get("/login", (req: Request, res: Response, next: NextFunction) => {
    if (!isHtmlNavigation(req)) return next()
    res.sendFile(SPA_INDEX)
})

app.all("/login", async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") {
        if (req.method === "GET") {
            return authenticateMiddleware(req, res, () => res.status(200).json({}))
        }
        return res.status(400).send("Invalid method")
    }

    const { username, password } = req.body
    if (username && password) {
        if (await authenticate(username, password)) {
            // The shared sample account exists on a fresh deployment but has no
            // rows yet, so generate them on the first sign-in — idempotent, and
            // never on the boot path. A failed seed must not block the sign-in.
            if (username === DEMO_USERNAME) {
                try {
                    await ensureDemoPopulated(username)
                    // authenticate() cached a session while the account still
                    // looked empty; drop it so the Settings status and up-time
                    // derive from the seeded data.
                    delete users[username]
                } catch (err) {
                    console.error("Demo data seeding failed:", err)
                }
            }
            // To user Login
            const user = await ensureUserSession(username)
            if (!user) return res.status(400).json({ error: "Failed to create a session" })
            const JWTToken = await generateAccessToken("1d", username)
            rememberToken(user, JWTToken)
            setSessionMarker(res)

            return res.status(200).json({ accessToken: JWTToken, username })
        }

        // Distinguish an unknown account from a wrong password so the UI can
        // guide the user (create an account / reset the password / try the demo).
        const accountExists = Boolean(await getUser(username))
        if (!accountExists) {
            return res.status(401).json({ error: "No account found for this username" })
        }
        console.log("failed to login: wrong password")
        return res.status(400).json({ error: "Incorrect password" })
    }

    // Guard against potential undefined property runtime failures
    if (username && (await ensureUserSession(username))) {
        users[username].JWT = []
    }
    return res.status(400).json({ error: "Username and password are required" })
})

// ─── REGISTER (multi-user) ───────────────────────────────────────────────────
app.post("/register", async (req: Request, res: Response) => {
    const { username, password, populateDemoData: wantsDemoData } = req.body
    if (!username || !password) return res.status(400).json({ error: "Username and password are required" })

    if (typeof username !== "string" || username.length < 3 || username.length > 32)
        return res.status(400).json({ error: "Username must be 3-32 characters long" })
    if (!/^[a-zA-Z0-9_.-]+$/.test(username))
        return res.status(400).json({ error: "Username may only contain letters, numbers, '_', '.' and '-'" })
    // The bootstrap accounts belong to the server: `admin` operates this
    // deployment and `userDemo` is the advertised sample account.
    if (isReservedUsername(username)) return res.status(400).json({ error: "That username is reserved" })

    // Registering seeds thousands of rows, so stop before the disk ceiling is what
    // refuses the write.
    if ((await countUsers()) >= maxAccounts())
        return res.status(503).json({ error: "This deployment has reached its account limit" })

    try {
        // password arrives already keccak-hashed by the client (same as /login)
        const passBytes = Uint8Array.from(Object.values(password))
        if (passBytes.length === 0) return res.status(400).json({ error: "Invalid password" })

        await createUser(username, passBytes)

        // Optional demo-data pre-population (opt-in by the user at registration).
        if (wantsDemoData) {
            try {
                await populateDemoData(username)
            } catch (seedErr) {
                console.error("Demo data seeding failed, rolling back user:", seedErr)
                await removeUserData(username)
                if (isStorageFullError(seedErr)) {
                    return res.status(503).json({ error: "This deployment is out of storage space" })
                }
                return res.status(500).json({ error: "Failed to prepare demo data" })
            }
        }

        const user = await ensureUserSession(username)
        if (!user) return res.status(500).json({ error: "Failed to create session" })

        const JWTToken = await generateAccessToken("1d", username)
        rememberToken(user, JWTToken)
        setSessionMarker(res)
        return res.status(201).json({ accessToken: JWTToken, username, demoPopulated: Boolean(wantsDemoData) })
    } catch (err: any) {
        if (err && err.code === "SQLITE_CONSTRAINT") return res.status(409).json({ error: "Username already exists" })
        if (isStorageFullError(err)) return res.status(503).json({ error: "This deployment is out of storage space" })
        console.error(err)
        return res.status(500).json({ error: "Failed to register user" })
    }
})

// ─── ADMIN: user management ─────────────────────────────────────────────────
// `requireAdmin` lives in ./guards so the data routers can reuse it.

// Current outbound-bandwidth state: the cost dashboard behind the admin banner.
app.get("/usage", authenticateMiddleware, requireAdmin, (_req: Request, res: Response) => {
    return res.status(200).json(egressSnapshot())
})

const databaseForRestoreTarget = (target: RestoreTarget) => {
    if (target === "tx") return database.db
    if (target === "spotFuture") return database.spotFutureDB
    return database.fundingRateDB
}

/**
 * Copies the current file into `backups/` before a restore is staged. VACUUM INTO
 * needs no write lock on the source and produces a compact, consistent single
 * file with no `-wal`/`-shm` sidecars to keep in step — a plain copy of a live
 * database would not be safe.
 */
const snapshotCurrentDatabase = async (target: RestoreTarget): Promise<string | null> => {
    const handle = databaseForRestoreTarget(target)
    if (!handle) return null
    await ensureBackupDir(target)
    const destination = snapshotPathFor(target)
    await handle.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`)
    return destination
}

// Stage a database file for restore. The upload is streamed to `<db>.pending`,
// verified with SQLite's own integrity check, and swapped in at the next start —
// which the host performs on every deploy, so nothing has to be locked here.
app.post(
    "/admin/restore/:target",
    authenticateMiddleware,
    requireAdmin,
    async (req: Request, res: Response) => {
        const target = String(req.params.target ?? "")
        if (!isRestoreTarget(target)) {
            return res
                .status(400)
                .json({ error: `Unknown restore target. Expected one of: ${RESTORE_TARGETS.join(", ")}` })
        }

        const pending = pendingPathFor(target)

        try {
            const { bytes } = await stageUpload(req, pending, maxRestoreBytes())
            if (bytes === 0) {
                await removeFile(pending)
                return res.status(400).json({ error: "The upload was empty" })
            }

            // Verify before anything is swapped, so a bad upload can only ever
            // cost a staged file. A file that is not SQLite at all throws here
            // rather than reporting a status.
            let inspection
            try {
                inspection = await inspectSqliteFile(pending)
            } catch (inspectionError) {
                console.error("Rejected a restore: not a SQLite file:", inspectionError)
                await removeFile(pending)
                return res.status(422).json({ error: "That file is not a usable SQLite database" })
            }
            if (inspection.integrity !== "ok" || inspection.tables.length === 0) {
                await removeFile(pending)
                return res.status(422).json({
                    error: `That file is not a usable SQLite database (integrity: ${inspection.integrity})`,
                })
            }
            // Integrity only proves it is *a* SQLite database. Requiring the tables
            // this target actually has stops an unrelated file (a browser profile,
            // another app's export) from being staged over a live database.
            const missingTables = missingRequiredTables(target, inspection.tables)
            if (missingTables.length > 0) {
                await removeFile(pending)
                return res.status(422).json({
                    error: `That file is not a ${target} database (missing: ${missingTables.join(", ")})`,
                })
            }

            const digest = await sha256File(pending)
            const expected = String(req.headers["x-content-sha256"] ?? "")
                .trim()
                .toLowerCase()
            if (expected && expected !== digest) {
                await removeFile(pending)
                return res.status(422).json({ error: "The upload did not match the checksum the client sent" })
            }

            const snapshot = await snapshotCurrentDatabase(target)
            console.log(
                `INFO -- staged a ${target} restore (${bytes} bytes, sha256 ${digest.slice(0, 12)}…, snapshot ${snapshot ? snapshot.split("/").pop() : "none"})`,
            )
            return res.status(202).json({
                ok: true,
                target,
                bytes,
                sha256: digest,
                staged: pending.split("/").pop(),
                snapshot: snapshot ? snapshot.split("/").pop() : null,
                restartRequired: true,
            })
        } catch (err) {
            await removeFile(pending)
            if ((err as { code?: string } | undefined)?.code === "RESTORE_TOO_LARGE") {
                return res.status(413).json({ error: "That file is larger than this deployment accepts for a restore" })
            }
            console.error("Failed to stage a database restore:", err)
            return res.status(500).json({ error: "Failed to stage the restore" })
        }
    },
)

// List all registered users (username, created_at, demo_populated).
app.get("/users", authenticateMiddleware, requireAdmin, async (_req: Request, res: Response) => {
    try {
        const usersList = await listUsers()
        return res.status(200).json({ users: usersList })
    } catch (err: any) {
        console.error(err)
        return res.status(500).json({ error: "Failed to list users" })
    }
})

// Delete a user and every row they own across all three databases.
app.delete("/users/:username", authenticateMiddleware, requireAdmin, async (req: Request, res: Response) => {
    const target = req.params.username
    if (!target) return res.status(400).json({ error: "Missing username" })
    // Reserved accounts belong to the deployment: `admin` operates it and
    // `userDemo` is the advertised sample every new visitor is pointed at. The
    // playground sweep already refuses both, so this API has to match rather than
    // letting a single request delete the account the login page advertises.
    if (isReservedUsername(target)) return res.status(400).json({ error: "Reserved accounts cannot be deleted" })

    try {
        await removeUserData(target)
        // Drop the in-memory session so any live JWTs for this user stop working.
        delete users[target]
        console.log(`admin deleted user: ${target}`)
        return res.status(200).json({ deleted: target })
    } catch (err: any) {
        console.error(err)
        return res.status(500).json({ error: "Failed to delete user" })
    }
})

app.get("/logout", authenticateMiddleware, async (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"]
    // console.log("authHeader:", authHeader)
    if (!authHeader) res.status(401).json({ error: "Missing token" })

    const token = authHeader!.replace(/^Bearer\s+/, "")
    if (!token) return res.status(401).json({ error: "Empty token slot" })

    const username = await getUsernameByJWT(token)
    if (!username) return res.status(401).json({ error: "User does not exist" })

    users[username].JWT = users[username].JWT.filter((_token) => _token !== token)
    // invalidatedJWTokens.push(token)
    res.clearCookie(SESSION_MARKER)
    return res.status(201).send("Logged out")
})

// ─── PLAYGROUND: ephemeral sessions ─────────────────────────────────────────
// The visitor gets data without an account, and the account disappears on its
// own. The expensive part (a few thousand seeded rows) is therefore bounded by
// concurrency × TTL instead of accumulating. Rate limiting this endpoint is
// deliberately left to the shared limiter (see rateLimit.ts); today the
// concurrency cap below is what protects the database.
app.post("/playground/session", async (_req: Request, res: Response) => {
    if (!playgroundEnabled()) return res.status(503).json({ error: "The playground is disabled" })

    try {
        if ((await livePlaygroundSessionCount()) >= maxPlaygroundAccounts()) {
            return res
                .status(503)
                .json({ error: "The playground is at capacity right now — sign in with userDemo instead" })
        }

        const { username, expiresAt } = await createPlaygroundSession()
        const user = await ensureUserSession(username)
        if (!user) return res.status(500).json({ error: "Failed to create a session" })

        const JWTToken = await generateAccessToken("1d", username)
        rememberToken(user, JWTToken)
        setSessionMarker(res)
        return res.status(201).json({ accessToken: JWTToken, username, expiresAt, demoPopulated: true })
    } catch (err) {
        console.error("Failed to start a playground session:", err)
        if (isStorageFullError(err)) return res.status(503).json({ error: "This deployment is out of storage space" })
        return res.status(500).json({ error: "Failed to start a playground session" })
    }
})

// Keep a playground session by giving it a real password; the account then
// behaves like any other and stops expiring.
app.post("/playground/keep", authenticateMiddleware, async (req: Request, res: Response) => {
    const username = req.user
    if (!username) return res.status(401).json({ error: "Missing token" })

    const record = await getUser(username)
    if (!record) return res.status(401).json({ error: "User does not exist" })
    if (record.expires_at === null) return res.status(400).json({ error: "This account is already permanent" })

    // password arrives already keccak-hashed by the client (same as /login).
    const passwordBytes = Uint8Array.from(Object.values(req.body?.password ?? {}))
    if (passwordBytes.length === 0) return res.status(400).json({ error: "Password is required" })

    await promoteUser(username, passwordBytes)
    const session = users[username]
    if (session) session.expiresAt = null
    return res.status(200).json({ username, expiresAt: null })
})
const createIfNotExists = (username: string, address: Address, symbol?: Symbol) => {
    const user = users[username]
    if (!user.status[address]) user.status[address] = {}
    if (symbol && !user.status[address][symbol]) user.status[address][symbol] = "Stopped"
    if (!user.upTime[address]) user.upTime[address] = {}
    if (symbol && !user.upTime[address][symbol]) user.upTime[address][symbol] = { start: "0", end: "0" }
}
app.all("/status", authenticateMiddleware, async (req: Request, res: Response) => {
    // console.log("/status req body:", req.body)
    // console.log("/status users:", JSON.stringify(users, null, "  "))
    try {
        const token = req.headers["authorization"]!.replace(/^Bearer\s+/, "")
        const username = await getUsernameByJWT(token)

        if (!username) return res.status(401).json({ error: "User does not exist" })

        if (req.method === "POST") {
            const data: string[] = req.body.data || []
            let statuses: { [key: Address]: { [key: Symbol]: Statuses } } = {}

            data.forEach((address) => {
                createIfNotExists(username, address)
                if (users[username].status[address]) statuses[address] = users[username].status[address]
            })
            return res.status(200).json(statuses)
        } else if (req.method === "PUT") {
            const data: { address: Address; symbol: Symbol; status: Statuses }[] = req.body.data || []

            for (const { address, symbol, status } of data) {
                createIfNotExists(username, address, symbol)

                if (status === "Good" || status === "Halted" || status === "Stopped") {
                    users[username].status[address][symbol] = status
                    if (status !== "Good") {
                        users[username].upTime[address][symbol] = { start: "0", end: "0" }
                    }
                } else {
                    return res.status(400).send("Invalid status")
                }
            }
            return res.status(201).send("status updated!")
        }

        return res.status(400).send("Method not allowed")
    } catch (err: any) {
        console.error(err)
        return res.status(500).send(`Failed to query status.`)
    }
})

app.all("/status/uptime", authenticateMiddleware, async (req: Request, res: Response) => {
    // console.log("req body:", req.body)
    // console.log("/status/uptime users:", JSON.stringify(users, null, "  "))
    try {
        const token = req.headers["authorization"]!.replace(/^Bearer\s+/, "")
        const username = await getUsernameByJWT(token)
        if (!username) return res.status(401).json({ error: "User does not exist" })

        const address: Address = req.body.address
        const symbol: Symbol = req.body.symbol
        const _upTime: { start: string; end: string } = req.body.upTime
        // console.log("req.body.upTime", _upTime)
        createIfNotExists(username, address, symbol)

        if (req.method === "POST") {
            // console.log("upTime:", users[username].upTime[address][symbol])

            if (users[username].upTime[address][symbol]) {
                if (
                    users[username].status[address][symbol] === "Good" &&
                    Number(users[username].upTime[address][symbol].start) !== 0
                )
                    //     users[username].upTime = {
                    //         ...users[username].upTime,
                    //         [address]: {
                    //             ...users[username].upTime[address],
                    //             [symbol]: {
                    //                 ...users[username].upTime[address][symbol],
                    //                 end: Date.now().toString(),
                    //             },
                    //         },
                    //     }
                    return res.status(200).json(users[username].upTime[address])
            } else return res.status(400).send(`Invalid address: ${address}`)
        } else if (req.method === "PUT") {
            if (_upTime) {
                if (_upTime.start)
                    users[username].upTime = {
                        ...users[username].upTime,
                        [address]: {
                            ...users[username].upTime[address],
                            [symbol]: {
                                ...users[username].upTime[address][symbol],
                                start: _upTime.start,
                            },
                        },
                    }
                if (_upTime.end)
                    users[username].upTime = {
                        ...users[username].upTime,
                        [address]: {
                            ...users[username].upTime[address],
                            [symbol]: {
                                ...users[username].upTime[address][symbol],
                                end: _upTime.end,
                            },
                        },
                    }
                return res.status(201).send("upTime updated!")
            } else return res.status(400).send("Invalid status")
        }
    } catch (err: any) {
        console.log(err)
        return res.status(500).send(`Failed to query up-time.`)
    }
})

// Ingestion writes (POST .../update) must not leave the dashboard reading a stale
// aggregate for the rest of the TTL, so drop that account's entries once the write
// succeeds. Registered before the routers on purpose: the `finish` handler runs
// after authenticateMiddleware has populated req.user.
app.use("/data", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST" && req.path.includes("update")) {
        res.on("finish", () => {
            if (res.statusCode < 400) invalidateUserCache(req.user)
        })
    }
    next()
})

// Correct Middleware Chaining Order: Middleware runs Left-to-Right
app.use("/data/spotFuture", authenticateMiddleware, spotFutureDataRouter)
app.use("/data/fRate", authenticateMiddleware, fundingRateDataRouter)
app.use("/data", authenticateMiddleware, dataRouter)

export * from "."
export * from "./middleware"
