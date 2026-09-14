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

export const initMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // A staged database restore is applied once per process, before any file is
    // opened: swapping a database the app already holds open is how SQLite files
    // get corrupted, and the host restarts the service on every deploy anyway.
    if (!restoresApplied) {
        restoresApplied = true
        await applyPendingRestores().catch((err) => console.error("Failed to apply staged restores:", err))
    }

    // DB paths are overridable via env vars so tests / deployments can isolate
    // the SQLite files (never touch ./db/*.db).
    await database.updateDB(process.env.TX_DB_PATH || "./db/tx.db")
    if (!database.db) throw new Error(`Failed to initialize spot database!`)

    await database.updateSpotFutureDB(process.env.SPOT_FUTURE_DB_PATH || "./db/spotFuture.db")
    if (!database.spotFutureDB) throw new Error(`Failed to initialize spot future database!`)
    // spotFutureDatabase_createTablesIfNotExists(undefined, { symbol: "hl" })

    await database.updateFundingRateDB(process.env.FUNDING_RATE_DB_PATH || "./db/fRate.db")
    if (!database.fundingRateDB) throw new Error(`Failed to initialize funding rate database!`)
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
