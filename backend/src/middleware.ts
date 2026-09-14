import path from "path"
import { Request, Response, NextFunction } from "express"
import { getUsernameByJWT, invalidatedJWTokens } from "."
import { database } from "./database"
import { spotFutureDatabase_createTablesIfNotExists } from "./futureDatabaseRouter"
import { applyPendingRestores } from "./backup"

declare global {
    namespace Express {
        interface Request {
            /** Username attached by authenticateMiddleware (from the JWT `sub`). */
            user?: string
        }
    }
}

// const errorHandlerMiddleware = (err: Error, req: Request, res: Response, next: NextFunction) => {
//     console.error(err.stack)
//     res.status(500).send("Oops! Something went wrong.")
// }
// Initialization middleware
let restoresApplied = false

// The three databases are opened once per process, not once per request.
//
// Re-opening them per request is what made the duplicate-column race reachable:
// `migrateAddUsernameColumn` reads the schema and then alters it, so two requests
// arriving together — a first page load fires several at once — both decided the
// column was missing and one of them failed with
// `SQLITE_ERROR: duplicate column name: username`. It also leaked a connection per
// request, because updateDB replaces the handle without closing the one it held.
//
// The promise is memoized per resolved path set rather than once per process, so a
// test (or a deployment) that points the *_DB_PATH variables at different files
// still gets those files initialized.
let readiness: { key: string; promise: Promise<void> } | undefined

const resolveDbPaths = () => ({
    tx: path.resolve(process.env.TX_DB_PATH || "./db/tx.db"),
    spotFuture: path.resolve(process.env.SPOT_FUTURE_DB_PATH || "./db/spotFuture.db"),
    fRate: path.resolve(process.env.FUNDING_RATE_DB_PATH || "./db/fRate.db"),
})

const openDatabases = async (paths: { tx: string; spotFuture: string; fRate: string }) => {
    // A staged database restore is applied once per process, before any file is
    // opened: swapping a database the app already holds open is how SQLite files
    // get corrupted, and the host restarts the service on every deploy anyway.
    if (!restoresApplied) {
        restoresApplied = true
        await applyPendingRestores().catch((err) => console.error("Failed to apply staged restores:", err))
    }

    // DB paths are overridable via env vars so tests / deployments can isolate
    // the SQLite files (never touch ./db/*.db).
    await database.updateDB(paths.tx)
    if (!database.db) throw new Error(`Failed to initialize spot database!`)

    await database.updateSpotFutureDB(paths.spotFuture)
    if (!database.spotFutureDB) throw new Error(`Failed to initialize spot future database!`)
    // spotFutureDatabase_createTablesIfNotExists(undefined, { symbol: "hl" })

    await database.updateFundingRateDB(paths.fRate)
    if (!database.fundingRateDB) throw new Error(`Failed to initialize funding rate database!`)
}

export const initMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const paths = resolveDbPaths()
    const key = `${paths.tx}\n${paths.spotFuture}\n${paths.fRate}`

    if (readiness?.key !== key) {
        const previous = readiness?.promise
        // The memo is published before the first await on purpose: requests that
        // arrive together must all see this promise rather than each starting an
        // initialization of the same file.
        const promise = (async () => {
            await previous?.catch(() => {}) // the previous set, if any, settled first
            // Pointing somewhere else than the files we hold open: let go of the
            // old handles rather than leaking them.
            if (previous) {
                await database
                    .closeDB()
                    .catch((err) => console.error("Failed to close the previous databases:", err))
            }
            await openDatabases(paths)
        })()
        readiness = { key, promise }
        // A failed initialization must not be cached, or every later request would
        // replay the same error: drop the memo so the next request tries again,
        // exactly as it did when each request opened the files itself.
        promise.catch(() => {
            if (readiness?.key === key) readiness = undefined
        })
    }

    await readiness.promise
    next()
}

// Authentication middleware — verifies the Bearer JWT and attaches the verified
// username to the request for downstream user-scoped queries.
export const authenticateMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"]

    if (typeof authHeader === "string") {
        const token = authHeader.replace(/^Bearer\s+/, "")
        if (!token) return res.status(401).json({ error: "Missing token" })
        if (invalidatedJWTokens.includes(token)) return res.status(401).json({ error: "Blocked token" })

        try {
            const username = await getUsernameByJWT(token)
            if (!username) return res.status(401).json({ error: "Invalid token" })
            req.user = username
            return next()
        } catch (err: any) {
            return res.status(403).json({ error: err?.message || String(err) })
        }
    }
    return res.status(401).json({ error: "Missing token" })
}
// export const authenticateMiddleware = (req: Request, res: Response, next: NextFunction) => {
//     // ... authentication logic ...
//     if (
//         await authenticateToken(req, res)

//     ) {
//         next()
//     } else {
//         res.status(401).send("Unauthorized")
//     }
// }
