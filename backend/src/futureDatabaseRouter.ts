const path = require("path")
import express, { Request, Response, NextFunction } from "express"
import { Database } from "sqlite"
import {
    convertType,
    database,
    type arbSpotFuturePositionData,
    type data,
    type spotFutureCoinProfitData,
    type spotFutureDB_typed,
    type spotFutureTxsData,
    type spotFutureTypedTxsData,
    type TokenTxData,
    type TxsData,
    type TypedTxsData,
} from "./database"
import { insertAddressIfNotExists } from "./databaseRouter"
import {
    aggCache,
    determineSpotFutureExchanges,
    EXCHANGE_NAME,
    generateCacheKey,
    getGroupByExpression,
    pairing,
    parseYearWeek,
} from "./utils"
import { randomUUID } from "crypto"
import { profitIntervalType } from "."
// import { authenticateMiddleware } from "./middleware"
const CACHE_KEY_TYPE: "spotFuture" = "spotFuture"
export const spotFutureDataRouter = express.Router()

export const spotFutureDatabase_createTablesIfNotExists = async (
    symbol?: string,
    typedTxs?: { symbol: EXCHANGE_NAME },
    db?: Database,
) => {
    if (!db) db = database.spotFutureDB as Database
    let sqlStrings: string[] = []

    if (symbol) {
        symbol = symbol.toLowerCase()
        sqlStrings.push(
            `
            CREATE TABLE IF NOT EXISTS ${symbol}Txs (
            positionId INTEGER UNIQUE,
            amount REAL NOT NULL,
            ratio REAL NOT NULL,
            username TEXT NOT NULL DEFAULT 'admin',

            FOREIGN KEY (positionId) REFERENCES closedPositions (id) ON DELETE CASCADE
        );`,
        )
    }

    if (typedTxs)
        sqlStrings.push(`CREATE TABLE IF NOT EXISTS ${typedTxs.symbol}Txs (
                                id TEXT UNIQUE,
                                tokenIn TEXT NOT NULL,
                                tokenOut TEXT NOT NULL,
                                username TEXT NOT NULL DEFAULT 'admin',

                                FOREIGN KEY (id) REFERENCES transactions (${typedTxs.symbol}Id) ON DELETE CASCADE
                            );`)

    for (let i = 0; i < sqlStrings.length; i++) {
        try {
            await db.run(sqlStrings[i])
        } catch (err: any) {
            console.error(err)
            throw err
        }
    }
}

// 1. Generate the SELECT fields dynamically
const exchangeSelectFields = EXCHANGE_NAME.map(
    (ex) =>
        `
                optx.${ex.toLowerCase()}Id AS OP${ex}Id, 
                OP${ex}.tokenIn AS OP${ex}TokenIn, 
                OP${ex}.tokenOut AS OP${ex}TokenOut,
                cptx.${ex.toLowerCase()}Id AS CP${ex}Id, 
                CP${ex}.tokenIn AS CP${ex}TokenIn, 
                CP${ex}.tokenOut AS CP${ex}TokenOut,
            `,
).join("\n")

// 2. Generate the LEFT JOIN clauses dynamically
const exchangeJoins = EXCHANGE_NAME.map(
    (ex) => `LEFT JOIN ${ex.toLowerCase()}Txs AS OP${ex} ON OP${ex}.id = optx.${ex.toLowerCase()}Id\n
                 LEFT JOIN ${ex.toLowerCase()}Txs AS CP${ex} ON CP${ex}.id = cptx.${ex.toLowerCase()}Id`,
).join("\n")

// a middleware function with no mount path. This code is executed for every request to the router
spotFutureDataRouter.use((req: Request, res: Response, next: NextFunction) => {
    const db = database.spotFutureDB
    if (!db) res.status(500).send()

    next()
})

spotFutureDataRouter.post("/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!
    const data: arbSpotFuturePositionData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await insertAddressIfNotExists(db, _data.address, username)

            let openingId = ""
            let closingId = ""

            let closingTimestamp = 0
            let error = new Error()

            const promises = _data.txs.map(
                async ({ timestamp, type, qty, spotPrice, futurePrice, orderFee, fundingFee, typedTxs }) => {
                    let sqlStrings: string[] = []

                    if (type === "CLOSE") {
                        closingTimestamp = timestamp
                        closingId = randomUUID()
                    } else {
                        openingId = randomUUID()
                    }

                    await spotFutureDatabase_createTablesIfNotExists(undefined, { symbol: typedTxs[0].typedSymbol })
                    await spotFutureDatabase_createTablesIfNotExists(undefined, { symbol: typedTxs[1].typedSymbol })

                    const txs = await db.all(
                        `SELECT * FROM transactions AS tx WHERE tx.${typedTxs[0].typedSymbol}Id = "${typedTxs[0].id}" AND tx.${typedTxs[1].typedSymbol}Id = "${typedTxs[1].id}" AND tx.username = "${username}";`,
                    )
                    if (txs.length === 0) {
                        // Tx not exists, insert it
                        sqlStrings.push(
                            `INSERT INTO transactions (uuid, timestamp, address, ${typedTxs[0].typedSymbol}Id, ${
                                typedTxs[1].typedSymbol
                            }Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES ("${
                                type === "CLOSE" ? closingId : openingId
                            }", ${timestamp}, "${_data.address}", "${typedTxs[0].id}", "${
                                typedTxs[1].id
                            }", ${qty}, ${futurePrice}, ${spotPrice}, ${orderFee}, ${fundingFee}, "${username}");`,
                        )

                        // Exchange Txs
                        for (let j = 0; j < typedTxs.length; j++) {
                            const typedTx = typedTxs[j]
                            sqlStrings.push(
                                `INSERT INTO ${typedTx.typedSymbol}Txs (id, tokenIn, tokenOut, username) VALUES ("${typedTx.id}", "${typedTx.tokenIn.symbol}", "${typedTx.tokenOut.symbol}", "${username}");`,
                            )
                        }

                        for (let i = 0; i < sqlStrings.length; i++) {
                            try {
                                await db.run(sqlStrings[i])
                                console.log(`Inserted! ${sqlStrings[i]}`)
                            } catch (err: any) {
                                console.error(err)
                            }
                        }
                    } else {
                        console.log(`skipping... tx exists, tx type: ${type} --`, JSON.stringify(_data.txs, null, "  "))

                        if (type === "CLOSE") {
                            // closingTimestamp = txs[0].timestamp
                            // closingId = txs[0].uuid

                            // Closing tx should not exists on the database before insertion
                            error.name = "FAILED TO INSERT CLOSED TX"
                            error.message = `Skipping close tx, which should not have occur. pos.tx:${JSON.stringify(
                                _data.txs,
                                null,
                                "  ",
                            )}`
                            throw error
                        } else {
                            openingId = txs[0].uuid
                        }
                    }
                },
            )
            await Promise.all(promises)

            if (closingTimestamp === 0) throw new Error(`Missing closingTimestamp: ${closingTimestamp}`)
            console.log("openingId:", openingId)
            console.log("closingId:", closingId)

            await db.run(
                `INSERT INTO closedPositions (timestamp, openingId, closingId, username) VALUES (${closingTimestamp}, '${openingId}', '${closingId}', '${username}');`,
            )

            const closedPositions = await db.all(
                `SELECT * FROM closedPositions AS pos WHERE pos.openingId = "${openingId}" AND pos.closingId = "${closingId}" AND pos.username = '${username}';`,
            )
            console.log("closedPositions:", closedPositions)
            if (closedPositions.length === 0 || closedPositions.length > 1)
                throw new Error(
                    `failed to extract closedPosition id: \nopeningId:${JSON.stringify(
                        openingId,
                        null,
                        "  ",
                    )},\nclosingId:${JSON.stringify(closingId, null, "  ")}`,
                )

            // Insert specific Coin Txs
            const specificTx = Object.keys(_data.profit)
            for await (const symbol of specificTx) {
                await spotFutureDatabase_createTablesIfNotExists(symbol)

                const _sqlString = `INSERT INTO ${symbol.toLowerCase()}Txs (positionId, amount, ratio, username) VALUES (${
                    closedPositions[0].id
                }, ${_data.profit[symbol].amount}, ${_data.profit[symbol].ratio}, '${username}');`

                await db.run(_sqlString)
            }

            // Removing the corresponding openedPosition
            console.log(`Removing openedPosition with openingId: ${openingId}`)
            await database.removedOpenedPosition(openingId, username, database.spotFutureDB!)
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/accounts/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database

    const addresses = req.body.address as string[]

    if (!addresses || addresses.length === 0) res.status(400).send("Missing params")

    try {
        for (const address of addresses) {
            try {
                await insertAddressIfNotExists(db, address, req.user!)
            } catch (err: any) {
                console.log(`${address} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/tx/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!
    const data: spotFutureCoinProfitData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const tx = data[i]
            if (!tx) continue

            // Insert specific Txs
            await spotFutureDatabase_createTablesIfNotExists(tx.symbol)
            let _sqlString = `INSERT INTO ${tx.symbol}Txs (positionId, amount, ratio, username) VALUES (${tx.positionId}, ${tx.amount}, ${tx.ratio}, '${username}');`

            try {
                await db.run(_sqlString)
            } catch (err: any) {
                console.log(`${_sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/txs", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!

    try {
        const txRows = await db.all(
            `SELECT uuid, timestamp, address, qty, futurePrice, spotPrice, orderFee, fundingFee,
                    bybitId, bybit.tokenIn AS bybitTokenIn, bybit.tokenOut AS bybitTokenOut, 
                    gateId, gate.tokenIn AS gateTokenIn, gate.tokenOut AS gateTokenOut,
                    binanceId, binance.tokenIn AS binanceTokenIn, binance.tokenOut AS binanceTokenOut,
                    hlId, hl.tokenIn AS hlTokenIn, hl.tokenOut AS hlTokenOut, 
                    osmId, osm.tokenIn AS osmTokenIn, osm.tokenOut AS osmTokenOut, 
                    injId, inj.tokenIn AS injTokenIn, inj.tokenOut AS injTokenOut, 
                    dydxId, dydx.tokenIn AS dydxTokenIn, dydx.tokenOut AS dydxTokenOut, 
                    boltId, bolt.tokenIn AS boltTokenIn, bolt.tokenOut AS boltTokenOut,
                    suilId, suil.tokenIn AS suilTokenIn, suil.tokenOut AS suilTokenOut  
                    FROM transactions AS tx

                    LEFT JOIN bybitTxs AS bybit ON bybit.id = tx.bybitId
                    LEFT JOIN gateTxs AS gate ON gate.id = tx.gateId
                    LEFT JOIN binanceTxs AS binance ON binance.id = tx.binanceId

                    LEFT JOIN hlTxs AS hl ON hl.id = tx.hlId
                    LEFT JOIN osmTxs AS osm ON osm.id = tx.osmId
                    LEFT JOIN injTxs AS inj ON gate.id = tx.injId
                    LEFT JOIN dydxTxs AS dydx ON dydx.id = tx.dydxId
                    LEFT JOIN boltTxs AS bolt ON bolt.id = tx.boltId
                    LEFT JOIN suilTxs AS suil ON suil.id = tx.suilId
            WHERE tx.username = "${username}"
            ${
                req.body.timestamp_begin
                    ? `AND timestamp BETWEEN ${req.body.timestamp_begin} AND ${req.body.timestamp_end || Date.now()}`
                    : ""
            }
            ORDER BY timestamp DESC
            ;`,
        )

        res.status(200).json(txRows)
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/txs/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!
    const data: spotFutureTxsData[] = req.body.data
    // console.log("txs/update data:", data)
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        let isError = false
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await insertAddressIfNotExists(db, _data.address, username)

            let sqlString: string = `INSERT INTO transactions (uuid, timestamp, address, ${_data.cex.name}Id, ${_data.dex.name}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES ("${_data.uuid}", ${_data.timestamp}, "${_data.address}", "${_data.cex.id}", "${_data.dex.id}", ${_data.qty}, ${_data.futurePrice}, ${_data.spotPrice}, ${_data.orderFee}, ${_data.fundingFee}, "${username}");`

            try {
                await db.run(sqlString)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
                isError = true
            }
        }

        if (!isError) res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})
spotFutureDataRouter.post("/txs/updateFR", async (req: Request, res: Response) => {
    // const db = database.spotFutureDB as Database
    const data: { openingId: string; fundingFee: number }[] = req.body.data
    // console.log("txs/update data:", data)
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        let isError = false
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue
            try {
                await database.updateTransactionFR(_data.openingId, _data.fundingFee, req.user!, database.spotFutureDB!)

                // await insertAddressIfNotExists(db, _data.address)

                // let sqlString: string = `INSERT INTO transactions (uuid, timestamp, address, ${_data.cex.name}Id, ${_data.dex.name}Id, qty, futurePrice, spotPrice, orderFee, fundingFee) VALUES ("${_data.uuid}", ${_data.timestamp}, "${_data.address}", "${_data.cex.id}", "${_data.dex.id}", ${_data.qty}, ${_data.futurePrice}, ${_data.spotPrice}, ${_data.orderFee}, ${_data.fundingFee});`
            } catch (err: any) {
                // console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
                isError = true
            }
        }

        if (!isError) res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})
spotFutureDataRouter.post("/closedPositions/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!
    const data: spotFutureDB_typed["closedPositions"][] = req.body.data
    // console.log("txs/update data:", data)
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlString: string = `INSERT INTO closedPositions (timestamp, openingId, closingId, username) VALUES (${_data.timestamp}, '${_data.openingId}', '${_data.closingId}', '${username}');`

            try {
                await db.run(sqlString)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/openedPositions", async (req: Request, res: Response) => {
    try {
        const db = database.spotFutureDB as Database
        const username = req.user!

        const openedPositions: spotFutureDB_typed["transactions"][] = await db.all(
            `
                SELECT tx.uuid, tx.timestamp, tx.address, 
                    tx.qty, tx.orderFee, tx.fundingFee,
                    tx.futurePrice, tx.spotPrice, 
                    bybitId, bybit.tokenIn AS bybitTokenIn, bybit.tokenOut AS bybitTokenOut, 
                    gateId, gate.tokenIn AS gateTokenIn, gate.tokenOut AS gateTokenOut,
                    binanceId, binance.tokenIn AS binanceTokenIn, binance.tokenOut AS binanceTokenOut,
                    hlId, hl.tokenIn AS hlTokenIn, hl.tokenOut AS hlTokenOut, 
                    osmId, osm.tokenIn AS osmTokenIn, osm.tokenOut AS osmTokenOut, 
                    injId, inj.tokenIn AS injTokenIn, inj.tokenOut AS injTokenOut, 
                    dydxId, dydx.tokenIn AS dydxTokenIn, dydx.tokenOut AS dydxTokenOut,
                    boltId, bolt.tokenIn AS boltTokenIn, bolt.tokenOut AS boltTokenOut,
                    suilId, suil.tokenIn AS suilTokenIn, suil.tokenOut AS suilTokenOut  
                    FROM openedPositions as OP

                    LEFT JOIN transactions AS tx ON tx.uuid = OP.openingId
                    LEFT JOIN bybitTxs AS bybit ON bybit.id = tx.bybitId
                    LEFT JOIN gateTxs AS gate ON gate.id = tx.gateId
                    LEFT JOIN binanceTxs AS binance ON binance.id = tx.binanceId

                    LEFT JOIN hlTxs AS hl ON hl.id = tx.hlId
                    LEFT JOIN osmTxs AS osm ON osm.id = tx.osmId
                    LEFT JOIN injTxs AS inj ON gate.id = tx.injId
                    LEFT JOIN dydxTxs AS dydx ON dydx.id = tx.dydxId
                    LEFT JOIN boltTxs AS bolt ON bolt.id = tx.boltId
                    LEFT JOIN suilTxs AS suil ON suil.id = tx.suilId
            WHERE tx.username = "${username}"
            ${
                req.body.timestamp_begin
                    ? `AND tx.timestamp BETWEEN ${req.body.timestamp_begin} AND ${req.body.timestamp_end || Date.now()}`
                    : ""
            }
            ORDER BY tx.timestamp DESC
            ;`,
        )

        // as spotFutureDB_typed["openedPositions"][]

        res.status(200).json(openedPositions)
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/openedPositions/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!

    const data: spotFutureDB_typed["openedPositions"][] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlString: string = `INSERT INTO openedPositions (timestamp, openingId, username) VALUES (${_data.timestamp}, '${_data.openingId}', '${username}');`
            try {
                await db.run(sqlString)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})
spotFutureDataRouter.put("/openedPositions/update", async (req: Request, res: Response) => {
    // const db = database.spotFutureDB as Database
    console.log("openedPositions/update data:", req.method, req.body)

    const data: spotFutureDB_typed["openedPositions"][] = req.body
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await database.removedOpenedPosition(_data.openingId, req.user!, database.spotFutureDB!)
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})
spotFutureDataRouter.post("/typedTxs/update", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!
    const data: spotFutureTypedTxsData[] = req.body.data

    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlStrings: string[] = []

            await spotFutureDatabase_createTablesIfNotExists(undefined, {
                symbol: _data.typed as EXCHANGE_NAME,
            })
            sqlStrings.push(
                `INSERT INTO ${_data.typed}Txs (id, tokenIn, tokenOut, username) VALUES ('${_data.id}', '${_data.tokenIn}', '${_data.tokenOut}', '${username}');`,
            )

            for (let i = 0; i < sqlStrings.length; i++) {
                try {
                    await db.run(sqlStrings[i])
                } catch (err: any) {
                    console.log(`${sqlStrings[i]} Insertion Failed!`)
                    console.error(err)
                    res.status(500).send()
                }
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

spotFutureDataRouter.post("/profits-details/pairing/batch", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!

    // console.log("spotFutureDataRouter -- req.body.pairings", req.body.pairings)
    const pairings = req.body.pairings as pairing[] | undefined
    const address = req.body.address

    // ── Pagination parameters ──────────────────────────────────────────────
    const page = Math.max(1, parseInt(req.body.page) || 1)
    const limit = Math.min(500, parseInt(req.body.limit) || 50) 
    const offset = (page - 1) * limit

    // ── Timestamp filters (optional) ──────────────────────────────────────
    const timestampBegin = req.body.timestamp_begin // e.g., "2025-01-01 00:00:00" or ISO string
    const timestampEnd = req.body.timestamp_end // e.g., "2025-12-31 23:59:59"

    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }
    // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
    const exchangeNames = EXCHANGE_NAME.map((e) => `'${e}Txs'`).join(", ")
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN (${exchangeNames}, 'transactions')`,
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
        username: username,
        address: address,
        interval: "raw",
        pairings: filteredPairings,
        page: page.toString(),
        limit: limit.toString(),
        timestampBegin,
        timestampEnd,
    }
    // console.log("params: ", params)
    const cacheKey = generateCacheKey(params)
    const cached = aggCache.get(cacheKey)
    if (cached) console.log("spotFutureDataRouter -- returning cache", cached)
    if (cached) return res.status(200).json(cached)

    // ── 3. Run queries for each pairing in parallel ──────────────────────
    const results: { [key: string]: profitIntervalType[] } = {}
    let totalCount = 0

    await Promise.all(
        filteredPairings.map(async ({ baseSymbol, quoteSymbol }) => {
            const base = baseSymbol ? baseSymbol.toUpperCase() : "ALL"
            const quote = quoteSymbol.toLowerCase()
            try {
                // await spotFutureDatabase_createTablesIfNotExists(symbol)
                // ----- Build base WHERE conditions (shared by data & count) -----
                let whereConditions: string[] = ["cp.timestamp IS NOT NULL", "cp.username = ?"]
                let whereParams: any[] = [username]
                // console.log("base quote", base, quote)

                if (base !== "ALL") {
                    let tokenInConditions: string[] = []
                    for (const ex of EXCHANGE_NAME) {
                        tokenInConditions.push(`OP${ex}.tokenIn = ? OR OP${ex}.tokenOut = ?`)

                        whereParams.push(...[base, base])
                    }
                    const tokenInSql = "(" + tokenInConditions.join(" OR ") + ")"

                    let tokenOutConditions: string[] = []
                    for (const ex of EXCHANGE_NAME) {
                        tokenOutConditions.push(`CP${ex}.tokenIn = ? OR CP${ex}.tokenOut = ?`)

                        whereParams.push(...[base, base])
                    }
                    const tokenOutSql = "(" + tokenOutConditions.join(" OR ") + ")"

                    whereConditions.push(tokenInSql + " AND " + tokenOutSql)
                }
                if (address) {
                    whereConditions.push("optx.address = ?")
                    whereParams.push(address)
                }
                if (timestampBegin) {
                    whereConditions.push("cp.timestamp >= ?")
                    whereParams.push(timestampBegin)
                }
                if (timestampEnd) {
                    whereConditions.push("cp.timestamp <= ?")
                    whereParams.push(timestampEnd)
                }

                const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : ""
                let dataSql = `
                SELECT cp.closingId AS closingUUID, cp.openingId AS openingUUID, cp.timestamp, optx.address, optx.qty,
                        optx.futurePrice AS openingFP, optx.spotPrice AS openingSP,
                        optx.orderFee AS openingOrderFee,
                        cptx.orderFee AS closingOrderFee, cptx.fundingFee AS closingFundingFee,
                        cptx.futurePrice AS closingFP, cptx.spotPrice AS closingSP, 
                    
                        ${exchangeSelectFields}

                        ${quote}.amount, ${quote}.ratio

                        FROM closedPositions AS cp
                        LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                        LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                        ${exchangeJoins}
                        
                        INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                        
                        ${whereClause}
                        ORDER BY cp.timestamp DESC
                        LIMIT ? OFFSET ? ;
                    `
                const dataParams = [...whereParams, limit, offset]
                // console.log("data sql", dataSql, dataParams.length, dataParams)
                const dataRows = await db.all(dataSql, dataParams)

                // console.log(
                //     "spotfuture Raw dataRows:",
                //     pairings,
                //     address,
                //     dataRows.length,
                //     // dataRows[0],
                //     // dataRows[dataRows.length - 1],
                // )

                // always return array in random order (asc/ desc) since javascript doesn't care, i.e. 'ORDER BY' becomes meaningless
                // res.status(200).json(symbol_profits)

                // ----- Count query (no pagination) -----
                let countSql = `
                SELECT COUNT(*) AS total
                    FROM closedPositions AS cp
                    LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                    LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                   ${exchangeJoins}
                    
                    INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                    ${whereClause};
                `
                const countResult = await db.get(countSql, whereParams)
                // console.log("spotFuture -- countResult: ", countResult)
                const count = countResult?.total || 0
                totalCount += count

                // ----- Map rows to output format -----
                results[base] = dataRows
                    .map((row: any, index: number) => {
                        if (!row.timestamp) return undefined
                        const _quote = quote.toUpperCase()

                        const exchanges = determineSpotFutureExchanges(
                            row,
                            EXCHANGE_NAME.map((e) => e),
                        )

                        if (
                            !exchanges.OPExchangeName.ex1 ||
                            !exchanges.OPExchangeName.ex2 ||
                            !exchanges.CPExchangeName.ex1 ||
                            !exchanges.CPExchangeName.ex2
                        ) {
                            // console.error(`Corrupted data, missing exchanges:`, row, "detected exs:", exchanges)
                            return undefined
                        }
                        const _base: string = (
                            (exchanges.OPExchangeName.ex1.tokenIn === _quote
                                ? exchanges.OPExchangeName.ex1.tokenOut
                                : exchanges.OPExchangeName.ex1.tokenIn) ??
                            (exchanges.OPExchangeName.ex2.tokenIn === _quote
                                ? exchanges.OPExchangeName.ex2.tokenOut
                                : exchanges.OPExchangeName.ex2.tokenIn)
                        )?.toUpperCase()
                        if (!_base) {
                            // console.error(`Corrupted data, missing base symbol:`, row, "detected exs:", exchanges)
                            return undefined
                        }
                        return {
                            ...row,
                            key: `${_base}_${_quote}_${index}`,
                            OPex1Id: exchanges.OPExchangeName.ex1.id,
                            OPex1Name: exchanges.OPExchangeName.ex1.name,

                            OPex2Id: exchanges.OPExchangeName.ex2.id,
                            OPex2Name: exchanges.OPExchangeName.ex2.name,

                            CPex1Id: exchanges.CPExchangeName.ex1.id,
                            CPex1Name: exchanges.CPExchangeName.ex1.name,

                            CPex2Id: exchanges.CPExchangeName.ex2.id,
                            CPex2Name: exchanges.CPExchangeName.ex2.name,

                            baseSymbol: _base,
                            quoteSymbol: _quote,
                            // amount: Number(row.amount?.toFixed(4)) || 0,
                            // ratio: Number(row.ratio?.toFixed(4)) || 0,
                        }
                    })
                    .filter((item) => item !== undefined)
            } catch (err: any) {
                console.error(err)

                throw new Error("Invalid symbol or database query failed")
            }
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
    // console.log("spotFuture -- response", response)
    aggCache.set(cacheKey, response)
    res.status(200).json(response)
})

spotFutureDataRouter.post("/profits-details/pairing/aggregated/batch", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!

    // console.log("spotFutureDataRouter -- req.body.pairings", req.body.pairings)
    const pairings = req.body.pairings as pairing[] | undefined
    const interval = req.body.interval
    const address = req.body.address
    const usePagination = req.body.page && req.body.page != undefined ? true : false
    // ── Pagination parameters ──────────────────────────────────────────────
    const page = Math.max(1, parseInt(usePagination ? req.body.page : 1) || 1)
    const limit = Math.min(500, parseInt(usePagination ? req.body.limit : 50) || 50) 
    const offset = (page - 1) * limit

    // ── Timestamp filters (optional) ──────────────────────────────────────
    const timestampBegin = req.body.timestamp_begin
    const timestampEnd = req.body.timestamp_end

    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }
    // ─── Build the date format string ──────────────────────────────────────
    let groupExpr: { expr: string; format: string | null }
    try {
        groupExpr = getGroupByExpression(interval, "cp")
    } catch {
        return res.status(400).send("Invalid interval")
    }

    // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
    const exchangeNames = EXCHANGE_NAME.map((e) => `'${e}Txs'`).join(", ")
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN (${exchangeNames}, 'transactions')`,
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
    try {
        await Promise.all(
            filteredPairings.map(async ({ baseSymbol, quoteSymbol }) => {
                const base = baseSymbol ? baseSymbol.toUpperCase() : "ALL"
                const quote = quoteSymbol.toLowerCase()

                // await spotFutureDatabase_createTablesIfNotExists(symbol)
                // ----- Build base WHERE conditions (shared by data & count) -----
                let whereConditions: string[] = ["cp.timestamp IS NOT NULL", "cp.username = ?"],
                    whereParams: any[] = [username]
                let endConditions: string[] = [],
                    endParams: any[] = []
                // console.log("base quote", base, quote)

                /* Filter by base token, i.e. TokenA/ Quote */
                if (base !== "ALL") {
                    let tokenInConditions: string[] = []
                    for (const ex of EXCHANGE_NAME) {
                        tokenInConditions.push(`OP${ex}.tokenIn = ? OR OP${ex}.tokenOut = ?`)

                        whereParams.push(...[base, base])
                    }
                    const tokenInSql = "(" + tokenInConditions.join(" OR ") + ")"

                    let tokenOutConditions: string[] = []
                    for (const ex of EXCHANGE_NAME) {
                        tokenOutConditions.push(`CP${ex}.tokenIn = ? OR CP${ex}.tokenOut = ?`)

                        whereParams.push(...[base, base])
                    }
                    const tokenOutSql = "(" + tokenInConditions.join(" OR ") + ")"

                    whereConditions.push(tokenInSql + " AND " + tokenOutSql)
                }
                if (address) {
                    whereConditions.push("cptx.address = ?")
                    whereParams.push(address)
                }
                if (timestampBegin) {
                    whereConditions.push("cp.timestamp >= ?")
                    whereParams.push(timestampBegin)
                }
                if (timestampEnd) {
                    whereConditions.push("cp.timestamp <= ?")
                    whereParams.push(timestampEnd)
                }
                if (usePagination) {
                    endConditions.push("LIMIT ? OFFSET ?")
                    endParams.push(...[limit, offset])
                }

                const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : ""
                let dataSql = `
                        SELECT 
                        ${groupExpr.expr} AS timestamp,
                        SUM(optx.orderFee) AS openingOrderFee,
                        SUM(cptx.orderFee) AS closingOrderFee,
                        SUM(cptx.fundingFee) AS closingFundingFee,
                        SUM(${quote}.amount) AS amount,
                        COALESCE(
                            SUM(${quote}.amount * ${quote}.ratio) / NULLIF(SUM(${quote}.amount), 0),
                            0
                        ) AS ratio

                        FROM closedPositions AS cp
                        LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                        LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                        ${exchangeJoins}
                        
                        INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                        ${whereClause}
                        GROUP BY 1
                        ORDER BY cp.timestamp DESC
                       ${endConditions}
                    `
                const dataParams = [...whereParams, ...endParams]
                // console.log("data sql", dataSql, whereParams)
                const dataRows = await db.all(dataSql + ";", dataParams)

                // console.log("dataRows:", dataRows.length, dataRows[0], dataRows[dataRows.length - 1])

                // always return array in random order (asc/ desc) since javascript doesn't care, i.e. 'ORDER BY' becomes meaningless
                // res.status(200).json(symbol_profits)

                // ----- Count query (no pagination) -----
                let countSql = `
                SELECT COUNT(DISTINCT ${groupExpr.expr}) AS total
                    FROM closedPositions AS cp
                    LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                    LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                    ${exchangeJoins}
                    
                    INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                    ${whereClause};
                `
                const countResult = await db.get(countSql, whereParams)
                // console.log("spotFuture -- countResult: ", countResult)
                const count = countResult?.total || 0
                totalCount += count

                // ----- Map rows to output format -----
                results[base] = dataRows
                    .map((row: any, index: number) => {
                        let timestamp = row.timestamp
                        if (!timestamp) return undefined
                        const _quote = quote.toUpperCase()

                        const _base: string = base.toUpperCase()

                        // with the sv-SE (Sweden) locale, it natively outputs the YYYY-MM-DD format
                        if (interval === "Weekly") timestamp = parseYearWeek(timestamp).toLocaleDateString("sv-SE")
                        return {
                            ...row,
                            key: `${_base}_${_quote}_${index}`,
                            timestamp,
                            baseSymbol: _base,
                            quoteSymbol: _quote,
                            address: address,
                        }
                    })
                    .filter((item) => item !== undefined)
            }),
        )
    } catch (err: any) {
        console.error(err)

        return res.status(400).send("Invalid symbol or database query failed")
    }
    // ── 4. Cache and respond ──────────────────────────────────────────────
    const response = {
        data: results,
        pagination: {
            current: page,
            pageSize: limit,
            total: totalCount,
        },
    }
    // console.log("spotFuture -- response", response)
    aggCache.set(cacheKey, response)
    res.status(200).json(response)
})

spotFutureDataRouter.get("/symbols", async (req: Request, res: Response) => {
    const db = database.spotFutureDB as Database
    const username = req.user!
    const exchangeNames = EXCHANGE_NAME.map((e) => `'${e}Txs'`).join(", ")
    try {
        const rows = await db.all(
            `SELECT DISTINCT 
                substr(name, 1, length(name) - 3) AS symbol
             FROM sqlite_master 
             WHERE type='table' 
               AND name LIKE '%Txs'
               AND name NOT IN (${exchangeNames}, 'transactions')
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
spotFutureDataRouter.post("/export", function (req: Request, res: Response) {
    const options = {
        root: path.join(path.dirname(__dirname) + "/db"),
    }

    const fileName = "spotFuture.db"

    try {
        res.status(201).download(options.root + "/" + fileName, function (err) {
            if (err) {
                console.error("Error sending file:", err)
            } else {
                console.log("Sent:", options, fileName)
            }
        })
    } catch (err: any) {
        console.log(`caught error at data/export:`, err)
    }
})
