import express, { Request, Response, NextFunction } from "express"
import { Database } from "sqlite"
import { convertType, database, type data, type TokenTxData, type TxsData, type TypedTxsData } from "./database"
import { authenticateMiddleware } from "./middleware"
import { requireAdmin } from "./guards"
import { spotFutureDataRouter } from "./futureDatabaseRouter"
import { balanceResponse, profitIntervalType } from "."
import { bytesToUtf8, hexToBytes, toHex } from "ethereum-cryptography/utils"
import { aggCache, generateCacheKey, getGroupByExpression, pairing, parseYearWeek } from "./utils"

const CACHE_KEY_TYPE: "spot" = "spot"
// Helper to normalize the pairings array
export const normalizePairings = (pairings: pairing[]): string => {
    return pairings
        .map((p) => `${p.baseSymbol}:${p.quoteSymbol}`) // e.g., "ETH:USDC"
        .sort() // Sort alphabetically to make order-agnostic
        .join(",") // e.g., "BTC:USDT,ETH:USDC"
}
export const dataRouter = express.Router()

// ─── HELPER: Validate symbol against existing Txs tables ───────────────────
const validateSymbol = async (db: Database, symbol: string): Promise<boolean> => {
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN ('cexTxs', 'dexTxs', 'transactions')`,
    )
    const validSymbols = validTables.map((row: any) => row.name.replace(/Txs$/, "").toLowerCase())
    return validSymbols.includes(symbol.toLowerCase())
}

// ─── HELPER: Create a symbol table on demand (safe) ─────────────────────────
// Accepts only plain alphanumeric symbols (injection-safe), then creates the
// `${symbol}Txs` and `${symbol}Bal` tables (with the username column) if they
// don't exist yet — so the external ingestion can upload brand-new symbols.
const createSymbolTableIfValid = async (db: Database, symbol: string): Promise<boolean> => {
    symbol = symbol.toLowerCase()
    if (!/^[a-z0-9]+$/.test(symbol) || symbol.length > 20) return false
    await database_createNewTables(symbol, db)
    return true
}

// ─── HELPER: Insert address safely ──────────────────────────────────────────
export const insertAddressIfNotExists = async (db: Database, address: string, username: string) => {
    try {
        // ✅ Parameterized query
        const addresses = await db.all(`SELECT * FROM accounts WHERE address = ? AND username = ?`, [address, username])
        if (addresses.length === 0) {
            await db.run(`INSERT INTO accounts (address, username) VALUES (?, ?)`, [address, username])
        }
    } catch (err: any) {
        console.log(err)
    }
}

// ─── HELPER: Create dynamic tables ──────────────────────────────────────────
export const database_createNewTables = async (symbol: string, db?: Database) => {
    symbol = symbol.toLowerCase()
    if (!db) db = database.db as Database
    const sqlStrings = [
        `CREATE TABLE IF NOT EXISTS ${symbol}Bal (
            timestamp TEXT NOT NULL,
            address TEXT NOT NULL,
            amount REAL NOT NULL,
            username TEXT NOT NULL DEFAULT 'admin',
            FOREIGN KEY (address) REFERENCES accounts (address) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS ${symbol}Txs (
            orderId TEXT UNIQUE,
            txHash TEXT UNIQUE,
            amount REAL NOT NULL,
            ratio REAL NOT NULL,
            username TEXT NOT NULL DEFAULT 'admin',
            FOREIGN KEY (orderId) REFERENCES cexTxs (orderId) ON DELETE CASCADE,
            FOREIGN KEY (txHash) REFERENCES dexTxs (txHash) ON DELETE CASCADE
        );`,
    ]
    for (let i = 0; i < sqlStrings.length; i++) {
        try {
            await db.run(sqlStrings[i])
        } catch (err: any) {
            console.error(err)
            throw err
        }
    }
}

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
dataRouter.use((req: Request, res: Response, next: NextFunction) => {
    const db = database.db
    if (!db) return res.status(500).send()
    next()
})

// ─── ROUTES ──────────────────────────────────────────────────────────────────

dataRouter.post("/update", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    const data: data[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) return res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await insertAddressIfNotExists(db, _data.address, username)

            // Build the transaction insert query with parameterized placeholders
            let sqlStrings: string[] = []
            let paramsList: any[][] = []

            if (!_data.cex && _data.dex) {
                sqlStrings.push(`INSERT INTO transactions (timestamp, address, dexId, username) VALUES (?, ?, ?, ?)`)
                paramsList.push([_data.timestamp, _data.address, _data.dex?.txHash, username])
            } else if (!_data.dex && _data.cex) {
                sqlStrings.push(`INSERT INTO transactions (timestamp, address, cexId, username) VALUES (?, ?, ?, ?)`)
                paramsList.push([_data.timestamp, _data.address, _data.cex?.id, username])
            } else if (_data.cex && _data.dex) {
                sqlStrings.push(
                    `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`,
                )
                paramsList.push([_data.timestamp, _data.address, _data.cex?.id, _data.dex?.txHash, username])
            }

            // Dex/cex token details
            if (_data.dex) {
                sqlStrings.push(`INSERT INTO dexTxs (txHash, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`)
                paramsList.push([_data.dex?.txHash, _data.dex?.tokenIn.symbol, _data.dex?.tokenOut.symbol, username])
            }
            if (_data.cex) {
                sqlStrings.push(`INSERT INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`)
                paramsList.push([_data.cex?.id, _data.cex?.tokenIn.symbol, _data.cex?.tokenOut.symbol, username])
            }

            for (let j = 0; j < sqlStrings.length; j++) {
                try {
                    await db.run(sqlStrings[j], paramsList[j])
                } catch (err: any) {
                    console.log(`${sqlStrings[j]} Insertion Failed!`)
                    console.error(err)
                    return res.status(500).send()
                }
            }

            // Insert specific Txs
            const specificTx = Object.keys(_data!.profit)
            for await (const symbol of specificTx) {
                // ✅ Validate symbol before creating/interpolating tables
                if (!(await createSymbolTableIfValid(db, symbol))) return res.status(400).send("Invalid symbol")
                let _sqlString = ""
                let _params: any[] = []

                if (!_data.cex && _data.dex) {
                    _sqlString = `INSERT INTO ${symbol.toLowerCase()}Txs (txHash, amount, ratio, username) VALUES (?, ?, ?, ?)`
                    _params = [_data.dex?.txHash, _data?.profit[symbol].amount, _data?.profit[symbol].ratio, username]
                } else if (!_data.dex && _data.cex) {
                    _sqlString = `INSERT INTO ${symbol.toLowerCase()}Txs (orderId, amount, ratio, username) VALUES (?, ?, ?, ?)`
                    _params = [_data.cex?.id, _data?.profit[symbol].amount, _data?.profit[symbol].ratio, username]
                } else if (_data.dex && _data.cex) {
                    _sqlString = `INSERT INTO ${symbol.toLowerCase()}Txs (orderId, txHash, amount, ratio, username) VALUES (?, ?, ?, ?, ?)`
                    _params = [
                        _data.cex?.id,
                        _data.dex?.txHash,
                        _data?.profit[symbol].amount,
                        _data?.profit[symbol].ratio,
                        username,
                    ]
                }

                try {
                    await db.run(_sqlString, _params)
                } catch (err: any) {
                    console.log(`${_sqlString} Insertion Failed!`)
                    console.error(err)
                    return res.status(500).send()
                }
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

dataRouter.post("/accounts/update", async (req: Request, res: Response) => {
    const db = database.db as Database
    const addresses = req.body.address as string[]
    if (!addresses || addresses.length === 0) return res.status(400).send("Missing params")

    try {
        for (const address of addresses) {
            try {
                await insertAddressIfNotExists(db, address, req.user!)
            } catch (err: any) {
                console.log(`${address} Insertion Failed!`)
                console.error(err)
                return res.status(500).send()
            }
        }
        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

dataRouter.post("/balance/update", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    const symbol = (req.body.symbol as string).toLowerCase()
    const address = req.body.address
    const timestamp = req.body.timestamp
    const balance = req.body.balance
    if (!address || !symbol || !timestamp || !balance) return res.status(400).send("Missing params")

    // ✅ Validate symbol (creates the table on demand)
    if (!(await createSymbolTableIfValid(db, symbol))) return res.status(400).send("Invalid symbol")

    try {
        await insertAddressIfNotExists(db, address, username)

        const sqlString = `INSERT INTO ${symbol}Bal (timestamp, address, amount, username) VALUES (?, ?, ?, ?)`
        await db.run(sqlString, [timestamp, address, balance, username])

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

dataRouter.post("/balance/symbol/batch", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    const symbols = req.body.symbols as string[]

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).send("Missing symbols")
    }

    const results: { [key: string]: balanceResponse[] } = {}

    await Promise.all(
        symbols.map(async (symbol) => {
            symbol = symbol.toLowerCase()
            // (Optionally validate symbol here like you did for profits)
            await database_createNewTables(symbol) // Ensures table exists
            const data: balanceResponse[] = await db.all(
                `SELECT timestamp, address, amount FROM ${symbol}Bal WHERE username = ? ORDER BY timestamp DESC;`,
                [username],
            )
            results[symbol.toUpperCase()] = data.map((d, i) => {
                return { ...d, key: `${i}_${symbol.toUpperCase()}` }
            })
        }),
    )

    return res.status(200).json(results)
})

dataRouter.post("/tx/update", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    const data: TokenTxData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) return res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const tx = data[i]
            if (!tx) continue

            // ✅ Validate symbol (creates the table on demand)
            if (!(await createSymbolTableIfValid(db, tx.symbol))) return res.status(400).send("Invalid symbol")
            let _sqlString = ""
            let _params: any[] = []

            try {
                if (!tx.orderId && tx.txHash) {
                    _sqlString = `INSERT INTO ${tx.symbol.toLowerCase()}Txs (txHash, amount, ratio, username) VALUES (?, ?, ?, ?)`
                    _params = [tx.txHash, tx.amount, tx.ratio, username]
                } else if (!tx.txHash && tx.orderId) {
                    _sqlString = `INSERT INTO ${tx.symbol.toLowerCase()}Txs (orderId, amount, ratio, username) VALUES (?, ?, ?, ?)`
                    _params = [tx.orderId, tx.amount, tx.ratio, username]
                } else if (tx.txHash && tx.orderId) {
                    _sqlString = `INSERT INTO ${tx.symbol.toLowerCase()}Txs (orderId, txHash, amount, ratio, username) VALUES (?, ?, ?, ?, ?)`
                    _params = [tx.orderId, tx.txHash, tx.amount, tx.ratio, username]
                }

                await db.run(_sqlString, _params)
            } catch (err: any) {
                console.log(`${_sqlString} Insertion Failed!`)
                console.error(err)
                return res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

// dataRouter.post("/txs", async (req: Request, res: Response) => {
//     const db = database.db as Database

//     try {
//         const params: any[] = []
//         let whereClause = ""
//         if (req.body.timestamp_begin) {
//             whereClause = `WHERE timestamp BETWEEN ? AND ?`
//             params.push(req.body.timestamp_begin, req.body.timestamp_end || Date.now())
//         }
//         /*
// {
//     "timestamp": "1786722242769",
//     "address": "0x95D5f05840e39a5Bef1033C8311c3f406990ABFF",
//     "orderId": "1114118208698",
//     "cexTokenIn": "AKT",
//     "cexTokenOut": "USDC",
//     "txHash": "9FA8958BC1533B402D9410E3F5801E36ADE78A2FC7180AA621D213C4B31812C5",
//     "dexTokenIn": "USDC",
//     "dexTokenOut": "AKT"
// }
// */
//         const txRows = await db.all(
//             `SELECT
//                 timestamp,
//                 address,
//                 cexId AS orderId,
//                 ctx.tokenIn AS cexTokenIn,
//                 ctx.tokenOut AS cexTokenOut,
//                 dexId AS txHash, dtx.tokenIn AS dexTokenIn,
//                 dtx.tokenOut AS dexTokenOut
//             FROM transactions AS tx
//             INNER JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId
//             INNER JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId
//             ${whereClause}
//             ORDER BY timestamp DESC;`,
//             params,
//         )

//         res.status(200).json(txRows)
//     } catch (err: any) {
//         console.error(err)
//         res.status(500).send()
//     }
// })
// dataRouter.post("/txs2", async (req: Request, res: Response) => {
//     const db = database.db as Database

//     try {
//         const params: any[] = []
//         let whereClause = ""
//         if (req.body.timestamp_begin) {
//             whereClause = `WHERE timestamp BETWEEN ? AND ?`
//             params.push(req.body.timestamp_begin, req.body.timestamp_end || Date.now())
//         }
//         /*
// {
//     "timestamp": "1786722242769",
//     "address": "0x95D5f05840e39a5Bef1033C8311c3f406990ABFF",
//     "orderId": "1114118208698",
//     "cexTokenIn": "AKT",
//     "cexTokenOut": "USDC",
//     "txHash": "9FA8958BC1533B402D9410E3F5801E36ADE78A2FC7180AA621D213C4B31812C5",
//     "dexTokenIn": "USDC",
//     "dexTokenOut": "AKT"
// }
// */
//         const txRows = await db.all(
//             `SELECT
//                 timestamp,
//                 address,
//                 cexId AS orderId,
//                 ctx.tokenIn AS cexTokenIn,
//                 ctx.tokenOut AS cexTokenOut,
//                 dexId AS txHash, dtx.tokenIn AS dexTokenIn,
//                 dtx.tokenOut AS dexTokenOut,
//                 usdcTxs.amount AS amount,
//                 usdcTxs.ratio AS ratio
//             FROM transactions AS tx
//             INNER JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId
//             INNER JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId
//             INNER JOIN usdcTxs ON usdcTxs.orderId = tx.cexId AND usdcTxs.txHash = tx.dexId
//             ${whereClause}
//             ORDER BY timestamp DESC;`,
//             params,
//         )

//         res.status(200).json(txRows)
//     } catch (err: any) {
//         console.error(err)
//         res.status(500).send()
//     }
// })

dataRouter.post("/txs/update", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    const data: TxsData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) return res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await insertAddressIfNotExists(db, _data.address, username)

            let sqlString: string = ""
            let params: any[] = []

            if (_data.cexId === null && _data.dexId !== null) {
                sqlString = `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`
                params = [_data.timestamp, _data.address, null, _data.dexId, username]
            } else if (_data.cexId !== null && _data.dexId === null) {
                sqlString = `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`
                params = [_data.timestamp, _data.address, _data.cexId, null, username]
            } else if (_data.cexId !== null && _data.dexId !== null) {
                sqlString = `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`
                params = [_data.timestamp, _data.address, _data.cexId, _data.dexId, username]
            } else {
                throw new Error(`Missing on both cexId and dexId: ${JSON.stringify(_data, null, "  ")}`)
            }

            try {
                await db.run(sqlString, params)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                return res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

dataRouter.post("/typedTxs/update", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    const data: TypedTxsData[] = req.body.data
    const type: string = req.body.type
    if (!Array.isArray(data) || data.length === 0) return res.status(400).send("Missing data")

    // ✅ Whitelist 'type' to prevent injection into cexTxs / dexTxs
    const validTypes = ["cex", "dex"]
    if (!validTypes.includes(type)) return res.status(400).send("Invalid type")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlStrings: string[] = []
            let paramsList: any[][] = []

            if (_data.txHash && convertType(_data.txHash) !== null) {
                sqlStrings.push(`INSERT INTO ${type}Txs (txHash, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`)
                paramsList.push([_data.txHash, _data.tokenIn, _data.tokenOut, username])
            }
            if (_data.orderId && convertType(_data.orderId) !== null) {
                sqlStrings.push(`INSERT INTO ${type}Txs (orderId, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`)
                paramsList.push([_data.orderId, _data.tokenIn, _data.tokenOut, username])
            }

            for (let j = 0; j < sqlStrings.length; j++) {
                try {
                    await db.run(sqlStrings[j], paramsList[j])
                } catch (err: any) {
                    console.log(`${sqlStrings[j]} Insertion Failed!`)
                    console.error(err)
                    return res.status(500).send()
                }
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

dataRouter.post("/profits/pairing/aggregated/batch", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    // console.log("/profits/pairing/aggregated/batch", req.body.pairings)
    let pairings = req.body.pairings as pairing[] | undefined
    const interval = req.body.interval
    const address = req.body.address

    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }

    // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN ('cexTxs', 'dexTxs', 'transactions')`,
    )
    const validSymbols = validTables.map((row: any) => row.name.replace(/Txs$/, "").toLowerCase())

    const filteredPairings = Array.from(pairings)
        .filter((data, i) => {
            const { baseSymbol, quoteSymbol } = data
            if (!validSymbols.includes(baseSymbol.toLowerCase()) || !validSymbols.includes(quoteSymbol.toLowerCase())) {
                return undefined
            }
            return data
        })
        .filter((s) => s !== undefined)
    if (filteredPairings.length === 0) {
        return res.status(400).send("No valid pairings provided")
    }

    const cacheKey = generateCacheKey({
        endpoint: `${CACHE_KEY_TYPE}:profits:pairing:aggregated:batch`,
        type: CACHE_KEY_TYPE,
        username,
        address,
        interval,
        pairings,
    })

    const cached = aggCache.get(cacheKey)
    if (cached) return res.status(200).json(cached)

    // ─── 2. Build the date format string ──────────────────────────────────────
    let dateFormat = ""
    if (interval === "daily") dateFormat = "%Y-%m-%d"
    else if (interval === "weekly") dateFormat = "%Y-%W"
    else if (interval === "monthly") dateFormat = "%Y-%m"
    else return res.status(400).send("Invalid interval")

    // ─── 3. Prepare the common parameters ─────────────────────────────────────
    // (dateFormat, user, and address if provided)
    const paramsBase: any[] = [dateFormat, username]
    if (address) paramsBase.push(address)

    // ─── 4. Run ALL aggregations in parallel ──────────────────────────────────
    const results: { [key: string]: profitIntervalType[] } = {}
    // const stableSymbol = "USDC"
    await Promise.all(
        pairings.map(async ({ baseSymbol, quoteSymbol }) => {
            baseSymbol = baseSymbol.toUpperCase()
            quoteSymbol = quoteSymbol.toLowerCase()
            let sql = `
                    SELECT 
                        strftime(?, datetime(tx.timestamp / 1000, 'unixepoch')) AS timestamp,
                        tx.address, ${quoteSymbol}Txs.orderId, ${quoteSymbol}Txs.txHash,
                        SUM(${quoteSymbol}Txs.amount) AS amount,
                        COALESCE(
                            SUM(${quoteSymbol}Txs.amount * ${quoteSymbol}Txs.ratio) / NULLIF(SUM(${quoteSymbol}Txs.amount), 0),
                            0
                        ) AS ratio,
                        ctx.tokenIn AS cexTokenIn, ctx.tokenOut AS cexTokenOut,
                        dtx.tokenIn AS dexTokenIn, dtx.tokenOut AS dexTokenOut
                    FROM ${quoteSymbol}Txs
                    LEFT JOIN transactions AS tx ON tx.dexId = ${quoteSymbol}Txs.txHash OR tx.cexId = ${quoteSymbol}Txs.orderId
                    LEFT JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId  
                    LEFT JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId 
                    WHERE tx.timestamp IS NOT NULL AND tx.username = ? AND (ctx.tokenIn = "${baseSymbol}" OR ctx.tokenOut = "${baseSymbol}") AND (dtx.tokenIn = "${baseSymbol}" OR dtx.tokenOut = "${baseSymbol}")

                `
            // Clone the base params so each query has its own array
            const params = [...paramsBase]

            if (address) {
                sql += ` AND tx.address = ?`
            }
            sql += ` GROUP BY 1 ORDER BY timestamp ASC;`

            const data = await db.all(sql, params)
            // console.log("data", baseSymbol, interval, address, data)

            results[baseSymbol] = data
                .map((row: any, index: number) => {
                    if (row.timestamp)
                        return {
                            key: `${baseSymbol}_${quoteSymbol.toUpperCase()}_${index}`,
                            address: row.address,
                            baseSymbol,
                            quoteSymbol: quoteSymbol.toUpperCase(),
                            timestamp: row.timestamp,
                            amount: Number(row.amount.toFixed(4)),
                            ratio: Number(row.ratio.toFixed(4)) || 0,
                        }
                })
                .filter((item) => item != undefined)
        }),
    )

    aggCache.set(cacheKey, results)

    res.status(200).json(results)
})

dataRouter.post("/profits-details/pairing/batch", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    // console.log("dataRouter -- req.body.pairings", req.body.pairings)
    const pairings = req.body.pairings as pairing[] | undefined
    const address = req.body.address

    // ── Pagination parameters ──────────────────────────────────────────────
    const page = Math.max(1, parseInt(req.body.page) || 1)
    const limit = Math.min(500, parseInt(req.body.limit) || 50)
    const offset = (page - 1) * limit
    // Callers that only need the size of the result set (the dashboard's
    // "Total tx." tile) can skip the row query entirely: the total comes from a
    // standalone COUNT(*), so the join plus the ORDER BY never have to run.
    const countOnly = req.body.countOnly === true

    // ── Timestamp filters (optional) ──────────────────────────────────────
    const timestampBegin = req.body.timestamp_begin // e.g., "2025-01-01 00:00:00" or ISO string
    const timestampEnd = req.body.timestamp_end // e.g., "2025-12-31 23:59:59"

    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }

    // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN ('cexTxs', 'dexTxs', 'transactions')`,
    )
    const validSymbols = validTables.map((row: any) => row.name.replace(/Txs$/, "").toLowerCase())
    const filteredPairings = Array.from(pairings)
        .filter((data, i) => {
            const { baseSymbol, quoteSymbol } = data
            if (
                (baseSymbol && !validSymbols.includes(baseSymbol.toLowerCase())) ||
                !validSymbols.includes(quoteSymbol.toLowerCase()) ||
                baseSymbol === quoteSymbol
            ) {
                return undefined
            }
            return data
        })
        .filter((s) => s !== undefined)
    if (filteredPairings.length === 0) {
        return res.status(400).send("No valid pairings provided")
    }
    const params = {
        endpoint: `${CACHE_KEY_TYPE}:profits-details:pairing:batch`,
        type: CACHE_KEY_TYPE,
        username,
        address,
        interval: "raw",
        pairings: filteredPairings,
        page: page.toString(),
        limit: limit.toString(),
        timestampBegin,
        timestampEnd,
    }
    // console.log("params: ", params)
    const cacheKey = generateCacheKey(params) + (countOnly ? ":count" : "")
    const cached = aggCache.get(cacheKey)
    if (cached) return res.status(200).json(cached)

    // ── 3. Run queries for each pairing in parallel ──────────────────────
    const results: { [key: string]: profitIntervalType[] } = {}
    let totalCount = 0

    await Promise.all(
        filteredPairings.map(async ({ baseSymbol, quoteSymbol }) => {
            const base = baseSymbol ? baseSymbol.toUpperCase() : "ALL"
            const quote = quoteSymbol.toLowerCase()
            // ----- Build base WHERE conditions (shared by data & count) -----
            let whereConditions: string[] = ["tx.timestamp IS NOT NULL", "tx.username = ?"]
            let whereParams: any[] = [username]
            // console.log("base quote", base, quote)
            if (base !== "ALL") {
                whereConditions.push(...["(ctx.tokenIn = ? OR ctx.tokenOut = ?)", "(dtx.tokenIn = ? OR dtx.tokenOut = ?)"])
                whereParams.push(...[base, base, base, base])
            }
            if (address) {
                whereConditions.push("tx.address = ?")
                whereParams.push(address)
            }
            if (timestampBegin) {
                whereConditions.push("tx.timestamp >= ?")
                whereParams.push(timestampBegin)
            }
            if (timestampEnd) {
                whereConditions.push("tx.timestamp <= ?")
                whereParams.push(timestampEnd)
            }

            const whereClause = "WHERE " + whereConditions.join(" AND ")

            let dataSql = `
                SELECT 
                    timestamp, 
                    address, 
                    cexId AS orderId, 
                    ctx.tokenIn AS cexTokenIn, 
                    ctx.tokenOut AS cexTokenOut, 
                    dexId AS txHash, dtx.tokenIn AS dexTokenIn, 
                    dtx.tokenOut AS dexTokenOut,
                    ${quote}Txs.amount AS amount,
                    ${quote}Txs.ratio AS ratio
                FROM transactions AS tx
                INNER JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId
                INNER JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId
                INNER JOIN ${quote}Txs ON ${quote}Txs.orderId = tx.cexId AND ${quote}Txs.txHash = tx.dexId
                ${whereClause}
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ? ;
            `
            // console.log("dataSQL", dataSql)
            const dataParams = [...whereParams, limit, offset]

            const dataRows = countOnly ? [] : await db.all(dataSql, dataParams)
            // console.log("data", baseSymbol, dataRows, address)

            // ----- Count query (no pagination) -----
            let countSql = `
                SELECT COUNT(*) AS total
                FROM transactions AS tx
                INNER JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId
                INNER JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId
                INNER JOIN ${quote}Txs ON ${quote}Txs.orderId = tx.cexId AND ${quote}Txs.txHash = tx.dexId
                ${whereClause};
            `
            const countResult = await db.get(countSql, whereParams)
            const count = countResult?.total || 0
            totalCount += count

            // ----- Map rows to output format -----
            results[base] = dataRows
                .map((row: any, index: number) => {
                    if (!row.timestamp) return undefined
                    const _quote = quote.toUpperCase()
                    const _base: string = (
                        (row.cexTokenIn === _quote ? row.cexTokenOut : row.cexTokenIn) ??
                        (row.dexTokenIn === _quote ? row.dexTokenOut : row.dexTokenIn)
                    ).toUpperCase()
                    return {
                        key: `${_base}_${_quote}_${index}`,
                        address: row.address,
                        timestamp: row.timestamp,
                        orderId: row.orderId,
                        txHash: row.txHash,
                        baseSymbol: _base,
                        quoteSymbol: _quote,
                        amount: Number(row.amount?.toFixed(4)) || 0,
                        ratio: Number(row.ratio?.toFixed(4)) || 0,
                    }
                })
                .filter((item) => item !== undefined)
        }),
    )

    // ── 4. Cache and respond ──────────────────────────────────────────────
    const response = {
        // Count-only callers get the totals without the rows they would discard.
        data: countOnly ? {} : results,
        pagination: {
            current: page,
            pageSize: limit,
            total: totalCount,
        },
    }
    // console.log("response", response)
    aggCache.set(cacheKey, response)
    res.status(200).json(response)
})

dataRouter.post("/profits-details/pairing/aggregated/batch", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!
    console.log("/profits-details/pairing/aggregated/batch", req.body.pairings)
    const pairings = req.body.pairings as pairing[] | undefined
    const interval = req.body.interval
    const address = req.body.address
    const usePagination = req.body.page && req.body.page != undefined ? true : false
    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }

    // ─── 2. Build the date format string ──────────────────────────────────────
    let groupExpr: { expr: string; format: string | null }
    try {
        groupExpr = getGroupByExpression(interval, "tx")
    } catch {
        return res.status(400).send("Invalid interval")
    }

    // ── Pagination parameters ──────────────────────────────────────────────
    const page = Math.max(1, parseInt(usePagination ? req.body.page : 1) || 1)
    const limit = Math.min(500, parseInt(usePagination ? req.body.limit : 50) || 50)
    const offset = (page - 1) * limit

    // ── Timestamp filters (optional) ──────────────────────────────────────
    const timestampBegin = req.body.timestamp_begin // e.g., "2025-01-01 00:00:00" or ISO string
    const timestampEnd = req.body.timestamp_end // e.g., "2025-12-31 23:59:59"

    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }

    // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN ('cexTxs', 'dexTxs', 'transactions')`,
    )
    const validSymbols = validTables.map((row: any) => row.name.replace(/Txs$/, "").toLowerCase())
    const filteredPairings = Array.from(pairings)
        .filter((data, i) => {
            const { baseSymbol, quoteSymbol } = data
            if (
                (baseSymbol && !validSymbols.includes(baseSymbol.toLowerCase())) ||
                !validSymbols.includes(quoteSymbol.toLowerCase())
                // ||baseSymbol === quoteSymbol
            ) {
                return undefined
            }
            return data
        })
        .filter((s) => s !== undefined)
    if (filteredPairings.length === 0) {
        return res.status(400).send("No valid pairings provided")
    }
    const params = {
        endpoint: `${CACHE_KEY_TYPE}:profits-details:pairing:aggregated:batch`,
        type: CACHE_KEY_TYPE,
        username,
        address,
        interval,
        pairings: filteredPairings,
        page: page.toString(),
        limit: limit.toString(),
        timestampBegin,
        timestampEnd,
    }
    // console.log("params: ", params)
    const cacheKey = generateCacheKey(params)
    const cached = aggCache.get(cacheKey)
    if (cached) return res.status(200).json(cached)

    // ── 3. Run queries for each pairing in parallel ──────────────────────
    const results: { [key: string]: profitIntervalType[] } = {}
    let totalCount = 0

    await Promise.all(
        filteredPairings.map(async ({ baseSymbol, quoteSymbol }) => {
            const base = baseSymbol ? baseSymbol.toUpperCase() : "ALL"
            const quote = quoteSymbol.toLowerCase()
            // ----- Build base WHERE conditions (shared by data & count) -----
            let whereConditions: string[] = ["tx.timestamp IS NOT NULL", "tx.username = ?"],
                whereParams: any[] = [username]
            let endConditions: string[] = [],
                endParams: any[] = []

            if (base !== "ALL") {
                whereConditions.push(...["(ctx.tokenIn = ? OR ctx.tokenOut = ?)", "(dtx.tokenIn = ? OR dtx.tokenOut = ?)"])
                whereParams.push(...[base, base, base, base])
            }
            if (address) {
                whereConditions.push("tx.address = ?")
                whereParams.push(address)
            }

            if (timestampBegin) {
                whereConditions.push("tx.timestamp >= ?")
                whereParams.push(timestampBegin)
            }
            if (timestampEnd) {
                whereConditions.push("tx.timestamp <= ?")
                whereParams.push(timestampEnd)
            }
            if (usePagination) {
                endConditions.push("LIMIT ? OFFSET ?")
                endParams.push(...[limit, offset])
            }
            const whereClause = "WHERE " + whereConditions.join(" AND ")

            let dataSql = `
                SELECT 
                    ${groupExpr.expr} AS timestamp,
                    SUM(${quote}Txs.amount) AS amount,
                    COALESCE(
                        SUM(${quote}Txs.amount * ${quote}Txs.ratio) / NULLIF(SUM(${quote}Txs.amount), 0),
                        0
                    ) AS ratio
                FROM ${quote}Txs
                INNER JOIN transactions AS tx ON tx.dexId = ${quote}Txs.txHash OR tx.cexId = ${quote}Txs.orderId
                LEFT JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId
                LEFT JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId
                ${whereClause}
                GROUP BY 1
                ORDER BY timestamp DESC
                ${endConditions}
            `

            const dataParams = [...whereParams, ...endParams]
            // console.log("dataSql", dataSql, dataParams)
            const dataRows = await db.all(dataSql + ";", dataParams)
            // console.log("data", baseSymbol, interval, address)
            // console.log("dataRows:", base + "_" + quoteSymbol, dataRows.length)
            // ----- Count query (no pagination) -----
            let countSql = `
                SELECT COUNT(DISTINCT ${groupExpr.expr}) AS total
                FROM transactions AS tx
                INNER JOIN cexTxs AS ctx ON ctx.orderId = tx.cexId
                INNER JOIN dexTxs AS dtx ON dtx.txHash = tx.dexId
                INNER JOIN ${quote}Txs ON ${quote}Txs.orderId = tx.cexId AND ${quote}Txs.txHash = tx.dexId
                ${whereClause};
            `
            const countResult = await db.get(countSql, whereParams)
            // console.log("countResult", countResult)
            const count = countResult?.total || 0
            totalCount += count

            // ----- Map rows to output format -----
            results[base] = dataRows
                .map((row: any, index: number) => {
                    let timestamp = row.timestamp
                    if (!timestamp) return undefined

                    // with the sv-SE (Sweden) locale, it natively outputs the YYYY-MM-DD format
                    if (interval === "Weekly") timestamp = parseYearWeek(timestamp).toLocaleDateString("sv-SE")
                    // formatYearWeekToISO(parseYearWeek(timestamp))
                    const _quote = quote.toUpperCase()
                    const _base: string = base.toUpperCase()
                    return {
                        key: `${_base}_${_quote}_${index}`,
                        address: address,
                        timestamp: timestamp,
                        baseSymbol: _base,
                        quoteSymbol: _quote,
                        amount: Number(row.amount?.toFixed(4)) || 0,
                        ratio: Number(row.ratio?.toFixed(4)) || 0,
                    }
                })
                .filter((item) => item !== undefined)
        }),
    )

    // ── 4. Cache and respond ──────────────────────────────────────────────
    const response = {
        data: results,
        pagination: {
            current: page,
            pageSize: limit,
            total: totalCount,
        },
    }
    // console.log("response", response)
    aggCache.set(cacheKey, response)
    res.status(200).json(response)
})

dataRouter.get("/symbols", async (req: Request, res: Response) => {
    const db = database.db as Database
    const username = req.user!

    try {
        const rows = await db.all(
            `SELECT DISTINCT 
                substr(name, 1, length(name) - 3) AS symbol
             FROM sqlite_master 
             WHERE type='table' 
               AND name LIKE '%Txs'
               AND name NOT IN ('cexTxs', 'dexTxs', 'transactions')
             ORDER BY symbol;`,
        )
        // Only expose tables that contain data rows owned by this user
        const userRows: any[] = []
        for (const row of rows) {
            const owned = await db.get(`SELECT 1 FROM "${row.symbol}Txs" WHERE username = ? LIMIT 1`, [username])
            if (owned) userRows.push(row)
        }
        const symbols = userRows.map((row: any) => row.symbol.toUpperCase())

        const sorted = symbols.sort((a, b) => {
            if (a === "USDC") return -1
            if (b === "USDC") return 1
            return a.localeCompare(b)
        })
        return res.status(200).json({ symbols: sorted })
    } catch (err: any) {
        console.error(err)
        return res.status(500).send("Failed to fetch symbols")
    }
})

dataRouter.get("/addresses", async (req: Request, res: Response) => {
    const db = database.db as Database
    try {
        // const rows = await db.all(`SELECT DISTINCT address FROM transactions WHERE address IS NOT NULL ORDER BY address;`)
        const addresses = await database.getAllUniqueAddresses(req.user!)
        if (!addresses) return res.status(500).send("Failed to fetch addresses")
        // rows.map((row: any) => row.address)
        return res.status(200).json({ addresses })
    } catch (err: any) {
        console.error(err)
        return res.status(500).send("Failed to fetch addresses")
    }
})

dataRouter.post("/export", requireAdmin, function (req: Request, res: Response) {
    // Mirror middleware.ts resolution so the export follows a custom TX_DB_PATH
    // (e.g. a persistent volume) instead of always reading <backend>/db/tx.db.
    const dbPath = process.env.TX_DB_PATH || "./db/tx.db"
    try {
        res.status(201).download(dbPath, function (err) {
            if (err) {
                console.error("Error sending file:", err)
                if (!res.headersSent) res.status(404).json({ error: "Database file not found" })
            } else {
                console.log("Sent:", dbPath)
            }
        })
    } catch (err: any) {
        console.log(`caught error at data/export:`, err)
        res.status(500).send()
    }
})
