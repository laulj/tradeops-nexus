import path from "path"
import cors from "cors"
import { readFile, writeFile } from "fs/promises"
import express, { Express, Request, Response, NextFunction } from "express"
import { bytesToHex, equalsBytes } from "ethereum-cryptography/utils"
import { authenticateMiddleware, initMiddleware } from "./middleware"
import { requireAdmin } from "./guards"
import { ADMIN_USERNAME, DEMO_USERNAME, isReservedUsername } from "./credentials"
import { getUser, createUser, listUsers } from "./database"
import { populateDemoData, removeUserData, demoAddress, DEMO_SYMBOLS, ensureDemoPopulated } from "./demoData"
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
export const port = process.env.PORT || 8080

// Built SPA. Vite emits to frontend/dist, and the compiled backend runs from
// backend/dist, so this resolves to <repo>/frontend/dist at runtime.
const SPA_DIR = path.join(__dirname, "../../frontend/dist")
const SPA_INDEX = path.join(SPA_DIR, "index.html")

// Serve the SPA for browser navigations. Mirrors the Vite dev proxy's
// Accept: text/html fallback so deep links and refreshes on a client route render
// the app instead of hitting an API handler (GET /login answers XHR with 401 JSON).
const isHtmlNavigation = (req: Request) => String(req.headers.accept ?? "").includes("text/html")

app.use(cors())
// Compress before anything else: `compression()` wraps res.write/res.end for the
// handlers registered *after* it, so mounting it below express.static() left
// every asset (including the ~1.5 MB app chunk) uncompressed on the wire.
app.use(compression())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true })) // For parsing application/x-www-form-urlencoded
app.use(initMiddleware)
// Hashed chunks cache immutably; named files (index.html, favicon, og-image)
// revalidate so a deploy is picked up on the next request.
app.use("/assets", serveHashedAssets(SPA_DIR))
app.use(serveSpaFiles(SPA_DIR))

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
        return username
    } catch {
        return undefined
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
    next()
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
            user.JWT.push(JWTToken)

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
                return res.status(500).json({ error: "Failed to prepare demo data" })
            }
        }

        const user = await ensureUserSession(username)
        if (!user) return res.status(500).json({ error: "Failed to create session" })

        const JWTToken = await generateAccessToken("1d", username)
        user.JWT.push(JWTToken)
        return res.status(201).json({ accessToken: JWTToken, username, demoPopulated: Boolean(wantsDemoData) })
    } catch (err: any) {
        if (err && err.code === "SQLITE_CONSTRAINT") return res.status(409).json({ error: "Username already exists" })
        console.error(err)
        return res.status(500).json({ error: "Failed to register user" })
    }
})

// ─── ADMIN: user management ─────────────────────────────────────────────────
// `requireAdmin` lives in ./guards so the data routers can reuse it.

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
    if (target === ADMIN_USERNAME) return res.status(400).json({ error: "The admin account cannot be deleted" })

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
    return res.status(201).send("Logged out")
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
