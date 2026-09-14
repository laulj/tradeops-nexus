import sqlite3, { OPEN_CREATE } from "sqlite3"
import sqlite, { open, Database } from "sqlite"
import { database_createNewTables } from "./databaseRouter"
import { spotFutureDatabase_createTablesIfNotExists } from "./futureDatabaseRouter"
import { fundingRateDatabase_createTablesIfNotExists } from "./fundingRateDatabaseRouter"
import { EXCHANGE_NAME } from "./utils"
import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import {
    migrateSpotDB as migrateSpotDBImpl,
    spotFuture_migrateFrom_oldDB as spotFutureMigrateImpl,
    FR_migrateFrom_oldDB as FRMigrateImpl,
} from "./dbMigrations"
import { ADMIN_USERNAME, adminPassword, DEMO_USERNAME, demoPassword } from "./credentials"
sqlite3.verbose()

export interface data {
    timestamp: number
    address: string
    profit: {
        [key: string]: {
            amount: number
            ratio: number
        }
    }
    cex?: {
        id: string
        tokenIn: {
            symbol: string
            denom: string
            amount: number
        }
        tokenOut: {
            symbol: string
            denom: string
            amount: number
        }
    }
    dex?: {
        txHash: string
        tokenIn: {
            symbol: string
            denom: string
            amount: number
        }
        tokenOut: {
            symbol: string
            denom: string
            amount: number
        }
    }
}
export interface TxsData {
    timestamp: number
    address: string
    cexId: string | null
    dexId: string | null
}

export interface TypedTxsData {
    orderId?: string
    txHash?: string
    tokenIn: string
    tokenOut: string
}
export interface TokenTxData {
    symbol: string
    orderId: string | null
    txHash: string | null
    amount: number
    ratio: number
}

export interface spotFutureTxsData {
    uuid: string
    timestamp: string
    address: string
    cex: { id: string | null; name: string | null }
    dex: { id: string | null; name: string | null }

    qty: number
    spotPrice: number
    futurePrice: number
    orderFee: number
    fundingFee: number
}
export interface spotFutureTypedTxsData {
    typed: EXCHANGE_NAME
    id: string
    tokenIn: string
    tokenOut: string
}
export interface spotFutureCoinProfitData {
    symbol: string
    positionId: number
    amount: number
    ratio: number
}
export interface arbSpotFuturePositionData {
    address: string
    profit: {
        [key: string]: {
            amount: number
            ratio: number
        }
    }
    txs: {
        timestamp: number
        type: "OPEN" | "CLOSE"
        qty: number
        spotPrice: number
        futurePrice: number
        orderFee: number
        fundingFee: number

        typedTxs: {
            typedSymbol: EXCHANGE_NAME
            type: "CEX" | "DEX"
            id: string
            tokenIn: {
                symbol: string
                denom: string
                amount: number
            }
            tokenOut: {
                symbol: string
                denom: string
                amount: number
            }
        }[]
    }[]
}

export interface spotFutureDB_typed {
    schema: { name: string }[]
    openedPositions: {
        id: number
        timestamp: number
        openingId: string
        username?: string
    }
    closedPositions: {
        id: number
        timestamp: number
        openingId: string
        closingId: string
    }
    transactions: {
        uuid: string
        timestamp: string
        address: string
        bybitId: string | undefined
        gateId: string | undefined
        binanceId: string | undefined
        hlId: string | undefined
        osmId: string | undefined
        injId: string | undefined
        dydxId: string | undefined
        boltId: string | undefined
        suilId: string | undefined

        qty: number
        spotPrice: number
        futurePrice: number
        orderFee: number
        fundingFee: number
    }
    symbolTx: {
        positionId: number
        amount: number
        ratio: number
    }
    typedTx: {
        id: string
        tokenIn: string
        tokenOut: string
    }
    accounts: {
        address: string
    }
}

export interface FRdb_typed {
    schema: { name: string }[]
    openedPositions: {
        id: number
        timestamp: number
        openingId: string
        username?: string
    }
    closedPositions: {
        id: number
        timestamp: number
        openingId: string
        closingId: string
    }
    transactions: {
        uuid: string
        timestamp: string
        address: string
        bybitId: string | undefined
        gateId: string | undefined
        binanceId: string | undefined
        hlId: string | undefined
        osmId: string | undefined
        injId: string | undefined
        dydxId: string | undefined
        boltId: string | undefined
        suilId: string | undefined

        qty: number
    }
    symbolTx: {
        positionId: number
        amount: number
        ratio: number
    }
    typedTx: {
        id: string

        price: number
        orderFee: number
        fundingFee: number

        tokenIn: string
        tokenOut: string
    }
    accounts: {
        address: string
    }
    openedPosFromCloud: {
        timestamp: string
        uuid: string
        address: string

        binanceId: string | null
        binanceTokenIn: string | null
        binanceTokenOut: string | null
        binancePrice: number | null
        binanceOrderFee: number | null
        binanceFundingFee: number | null

        bybitId: string | null
        bybitTokenIn: string | null
        bybitTokenOut: string | null
        bybitPrice: number | null
        bybitOrderFee: number | null
        bybitFundingFee: number | null

        dydxId: string | null
        dydxTokenIn: string | null
        dydxTokenOut: string | null
        dydxPrice: number | null
        dydxOrderFee: number | null
        dydxFundingFee: number | null

        hlId: string | null
        hlTokenIn: string | null
        hlTokenOut: string | null
        hlPrice: number | null
        hlOrderFee: number | null
        hlFundingFee: number | null

        gateId: string | null
        gateTokenIn: string | null
        gateTokenOut: null
        gatePrice: number | null
        gateOrderFee: number | null
        gateFundingFee: number | null

        injId: string | null
        injTokenIn: string | null
        injTokenOut: string | null
        injPrice: number | null
        injOrderFee: number | null
        injFundingFee: number | null

        osmId: string | null
        osmTokenIn: string | null
        osmTokenOut: string | null
        osmPrice: number | null
        osmOrderFee: number | null
        osmFundingFee: number | null

        boltId: string | null
        boltTokenIn: string | null
        boltTokenOut: string | null
        boltPrice: number | null
        boltOrderFee: number | null
        boltFundingFee: number | null

        suilId: string | null
        suilTokenIn: string | null
        suilTokenOut: string | null
        suilPrice: number | null
        suilOrderFee: number | null
        suilFundingFee: number | null

        qty: number
    }
}
export interface fRTxsData {
    uuid: string
    timestamp: string
    address: string
    EX1: { id: string | null; name: string | null }
    EX2: { id: string | null; name: string | null }

    qty: number
}
export interface fRTypedTxsData {
    typed: EXCHANGE_NAME
    id: string
    price: number
    orderFee: number
    fundingFee: number
    tokenIn: string
    tokenOut: string
}

export interface arbFRPositionData {
    address: string
    profit: {
        [key: string]: {
            amount: number
            ratio: number
        }
    }
    txs: {
        timestamp: number
        type: "OPEN" | "CLOSE"
        qty: number

        typedTxs: {
            typedSymbol: EXCHANGE_NAME
            type: "CEX" | "DEX"

            id: string
            symbol: string
            price: number
            orderFee: number
            fundingFee: number

            tokenIn: {
                symbol: string
                denom: string
                amount: number
            }
            tokenOut: {
                symbol: string
                denom: string
                amount: number
            }
        }[]
    }[]
}

type ExcludeSame<T extends string> = T extends `${infer A}-${infer B}` ? (A extends B ? never : T) : never
export type FR_EXCHANGE_PAIR = ExcludeSame<`${CEX_EXCHANGE_TYPE}-${CEX_EXCHANGE_TYPE}`>
export enum EXCHANGE_TYPE {
    HL = "HYPERLIQUID",
    BB = "BYBIT",
    BIN = "BINANCE",
    GT = "GATE",
    OSM = "OSMOSIS",
    BOLT = "BOLT",
    SUIL = "SUILEND",
}
export enum CEX_EXCHANGE_TYPE {
    HL = "HYPERLIQUID",
    BB = "BYBIT",
    BIN = "BINANCE",
    GT = "GATE",
    BOLT = "BOLT",
}
export enum DEX_EXCHANGE_TYPE {
    HL = "HYPERLIQUID",
    OSM = "OSMOSIS",
    BOLT = "BOLT",
    SUIL = "SUILEND",
}
export interface FRComparisonTableData {
    pair: FR_EXCHANGE_PAIR
    symbol: string
    direction: "same" | "opposite"
    difference: number
    hourly: number

    nextFundingIntervalMs: number
    estimatedFR: number
    costRate: number
    estimatedProfitRatio: number
    minRunningHrAssumed: number

    fundingInfo: {
        name: string
        funding: number
        nextFundingTime: number
        intervalHr: number
    }[]

    TimeToNextFunding: number
}

export var database = {
    db: undefined as undefined | Database,
    db2: undefined as undefined | Database,
    spotFutureDB: undefined as undefined | Database,
    fundingRateDB: undefined as undefined | Database,
    updateDB: async (path?: string) => {
        database.db = await initDatabase(path ? path : "./db/tx.db", "spot")
    },
    updateSpotFutureDB: async (path?: string) => {
        database.spotFutureDB = await initDatabase(path ? path : "./db/spotFuture.db", "spotFuture")
    },
    updateFundingRateDB: async (path?: string) => {
        database.fundingRateDB = await initDatabase(path ? path : "./db/fRate.db", "fundingRate")
    },
    /** Return all unique addresses across all database **/
    getAllUniqueAddresses: async (username: string): Promise<string[] | undefined> => {
        try {
            const spotRows = await database.db!.all(
                `SELECT DISTINCT address FROM transactions WHERE username = ? AND address IS NOT NULL ORDER BY address;`,
                [username],
            )
            const spotFRows = await database.spotFutureDB!.all(
                `SELECT DISTINCT address FROM transactions WHERE username = ? AND address IS NOT NULL ORDER BY address;`,
                [username],
            )
            const fundingRRows = await database.fundingRateDB!.all(
                `SELECT DISTINCT address FROM transactions WHERE username = ? AND address IS NOT NULL ORDER BY address;`,
                [username],
            )
            return Array.from(
                new Set([
                    ...spotRows.map((row: any) => row.address),
                    ...spotFRows.map((row: any) => row.address),
                    ...fundingRRows.map((row: any) => row.address),
                ]),
            )
        } catch (err: any) {
            console.error(err)
            return undefined
        }
    },
    getAllOpenedPositions: async (db: Database): Promise<spotFutureDB_typed["openedPositions"][]> => {
        // const db = database.spotFutureDB as Database

        try {
            const openedPositions = (await db.all(
                `SELECT * FROM openedPositions;`,
            )) as spotFutureDB_typed["openedPositions"][]
            return openedPositions
        } catch (err: any) {
            throw err
        }
    },
    updateTransactionFR: async (_openingId: string, fundingFee: number, username: string, db: Database) => {
        // const db = database.spotFutureDB as Database

        try {
            const openedPositions = (await db.all(
                `SELECT * FROM transactions WHERE username = '${username}';`,
            )) as spotFutureDB_typed["transactions"][]
            const posToUpdate = openedPositions.find((pos) => pos.uuid === _openingId)
            if (!posToUpdate)
                throw new Error(
                    `Missing openedpositions with openingId: ${_openingId},\nopenedPositions: ${JSON.stringify(
                        openedPositions,
                        null,
                        "  ",
                    )}`,
                )

            await db.run(
                `UPDATE transactions SET fundingFee = ${fundingFee} WHERE uuid = '${_openingId}' AND username = '${username}'`,
            )

            return true
        } catch (err: any) {
            throw err
            // return false
        }
    },
    FRupdateTransactionFR: async (
        typedSymbol: EXCHANGE_NAME,
        _openingId: string,
        fundingFee: number,
        username: string,
        db: Database,
    ) => {
        // const db = database.spotFutureDB as Database

        try {
            const openedPositions = (await db.all(
                `SELECT * FROM transactions WHERE username = '${username}';`,
            )) as FRdb_typed["transactions"][]
            const posToUpdate = openedPositions.find((pos) => pos.uuid === _openingId)
            if (!posToUpdate)
                throw new Error(
                    `Missing openedpositions with openingId: ${_openingId},\nopenedPositions: ${JSON.stringify(
                        openedPositions,
                        null,
                        "  ",
                    )}`,
                )
            const cexId = posToUpdate[(typedSymbol + "Id") as keyof FRdb_typed["transactions"]]
            const exchangeTxs = (await db.all(
                `SELECT * FROM ${typedSymbol}Txs WHERE username = '${username}';`,
            )) as FRdb_typed["typedTx"][]
            const exchangeTxToUpdate = exchangeTxs.find((tx) => tx.id === cexId)

            if (exchangeTxToUpdate)
                await db.run(
                    `UPDATE ${typedSymbol}Txs SET fundingFee = ${fundingFee} WHERE id = '${cexId}' AND username = '${username}'`,
                )

            return true
        } catch (err: any) {
            throw err
            // return false
        }
    },
    removedOpenedPosition: async (_openingId: string, username: string, db: Database) => {
        // const db = database.spotFutureDB as Database

        try {
            const openedPositions = await database.getAllOpenedPositions(db)
            const posToRemove = openedPositions.find((pos) => pos.openingId === _openingId && pos.username === username)
            if (!posToRemove)
                throw new Error(
                    `Missing openedpositions with openingId: ${_openingId},\nopenedPositions: ${JSON.stringify(
                        openedPositions,
                        null,
                        "  ",
                    )}`,
                )

            await db.run(`DELETE FROM openedPositions WHERE openingId = '${_openingId}' AND username = '${username}'`)

            return true
        } catch (err: any) {
            throw err
            return false
        }
    },
    closeDB: async () => {
        if (database.db) await database.db.close()
        if (database.db2) await database.db2.close()
        if (database.spotFutureDB) await database.spotFutureDB.close()
        if (database.fundingRateDB) await database.fundingRateDB.close()
    },
}
export const convertType = function (value: string) {
    if (value === "undefined") return undefined
    if (value === "null") return null
    if (value === "true") return true
    if (value === "false") return false
    var v = Number(value)
    return isNaN(v) ? value : v
}
async function createTables(newdb: Database) {
    const sqlStrings = [
        `CREATE TABLE IF NOT EXISTS cexTxs (
            orderId TEXT UNIQUE,
            tokenIn TEXT NOT NULL,
            tokenOut TEXT NOT NULL,
            FOREIGN KEY (orderId) REFERENCES transactions (cexId) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS dexTxs (
            txHash TEXT UNIQUE,
            tokenIn TEXT NOT NULL,
            tokenOut TEXT NOT NULL,
            FOREIGN KEY (txHash) REFERENCES transactions (dexId) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS transactions (
            timestamp TEXT NOT NULL,
            address TEXT NOT NULL,
            cexId TEXT UNIQUE,
            dexId TEXT UNIQUE,
            FOREIGN KEY (address) REFERENCES accounts (address) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS accounts (
            address TEXT UNIQUE
        );`,
    ]
    for (let i = 0; i < sqlStrings.length; i++) {
        await newdb.exec(sqlStrings[i])
        console.log(`Created Table ${i}!`)
    }

    await newdb.run(`INSERT INTO accounts (address)
        VALUES ("0x21b412d9A4368E6ff5b6d301e4Aa64ff8b8aA7db");`)
}
async function createSpotFutureTables(newdb: Database) {
    let sqlStrings = [
        `CREATE TABLE IF NOT EXISTS openedPositions (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            openingId TEXT UNIQUE NOT NULL,
           
            FOREIGN KEY (openingId) REFERENCES transactions (uuid) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS closedPositions (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            openingId TEXT UNIQUE NOT NULL,
            closingId TEXT UNIQUE NOT NULL,

            FOREIGN KEY (openingId) REFERENCES transactions (uuid) ON DELETE CASCADE,
            FOREIGN KEY (closingId) REFERENCES transactions (uuid) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS transactions (
            uuid TEXT UNIQUE NOT NULL,
            timestamp TEXT NOT NULL,
            address TEXT NOT NULL,

            bybitId TEXT UNIQUE,
            gateId TEXT UNIQUE,
            binanceId TEXT UNIQUE,
            hlId TEXT UNIQUE,
            osmId TEXT UNIQUE,
            injId TEXT UNIQUE,
            dydxId TEXT UNIQUE,
            boltId TEXT UNIQUE,
            suilId TEXT UNIQUE,

            qty REAL NOT NULL,
            futurePrice REAL NOT NULL,
            spotPrice REAL NOT NULL,
            orderFee REAL NOT NULL,
            fundingFee REAL NOT NULL,

            FOREIGN KEY (address) REFERENCES accounts (address) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS accounts (
            address TEXT UNIQUE
        );`,
    ]

    const typedTx = ["bybit", "gate", "binance", "osm", "inj", "dydx", "hl", "bolt", "suil"]
    typedTx.map((type) => {
        sqlStrings.push(`CREATE TABLE IF NOT EXISTS ${type}Txs (
                                id TEXT UNIQUE,
                                tokenIn TEXT NOT NULL,
                                tokenOut TEXT NOT NULL,
                                FOREIGN KEY (id) REFERENCES transactions (${type}Id) ON DELETE CASCADE
                            );`)
    })

    for (let i = 0; i < sqlStrings.length; i++) {
        await newdb.exec(sqlStrings[i])
        console.log(`Created Table ${i}!`)
    }
}
async function createFRTables(newdb: Database) {
    let sqlStrings = [
        `CREATE TABLE IF NOT EXISTS openedPositions (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            openingId TEXT UNIQUE NOT NULL,
            
            FOREIGN KEY (openingId) REFERENCES transactions (uuid) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS closedPositions (
            id INTEGER PRIMARY KEY,
            timestamp TEXT NOT NULL,
            openingId TEXT UNIQUE NOT NULL,
            closingId TEXT UNIQUE NOT NULL,

            FOREIGN KEY (openingId) REFERENCES transactions (uuid) ON DELETE CASCADE,
            FOREIGN KEY (closingId) REFERENCES transactions (uuid) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS transactions (
            uuid TEXT UNIQUE NOT NULL,
            timestamp TEXT NOT NULL,
            address TEXT NOT NULL,

            hlId TEXT UNIQUE,
            bybitId TEXT UNIQUE,
            gateId TEXT UNIQUE,
            binanceId TEXT UNIQUE,
            osmId TEXT UNIQUE,
            injId TEXT UNIQUE,
            dydxId TEXT UNIQUE,
            boltId TEXT UNIQUE,
            suilId TEXT UNIQUE,

            qty REAL NOT NULL,

            FOREIGN KEY (address) REFERENCES accounts (address) ON DELETE CASCADE
        );`,
        `CREATE TABLE IF NOT EXISTS accounts (
            address TEXT UNIQUE
        );`,
    ]

    const typedTx = ["bybit", "gate", "binance", "osm", "inj", "dydx", "hl", "bolt", "suil"]
    typedTx.map((type) => {
        sqlStrings.push(`CREATE TABLE IF NOT EXISTS ${type}Txs (
                                id TEXT UNIQUE,

                                price REAL NOT NULL,
                                orderFee REAL NOT NULL,
                                fundingFee REAL NOT NULL,

                                tokenIn TEXT NOT NULL,
                                tokenOut TEXT NOT NULL,
                                FOREIGN KEY (id) REFERENCES transactions (${type}Id) ON DELETE CASCADE
                            );`)
    })

    for (let i = 0; i < sqlStrings.length; i++) {
        await newdb.exec(sqlStrings[i])
        console.log(`Created Table ${i}!`)
    }
}
// ── Multi-user auth store (tx.db) ───────────────────────────────────────────
// The bootstrap usernames and passwords come from ./credentials: the admin
// password is a deployment secret, not a constant in this file.

/**
 * Idempotently makes sure `username` exists with `password`. INSERT OR IGNORE
 * leaves an existing row alone, so when the operator supplies the value through
 * the environment we also UPDATE the hash — otherwise rotating it in the host's
 * environment would never take effect on a database that already has the row.
 */
const ensureBootstrapAccount = async (db: Database, username: string, password: string, envVar: string) => {
    const hash = keccak256(utf8ToBytes(password))
    await db.run(`INSERT OR IGNORE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`, [
        username,
        Buffer.from(hash),
        Date.now(),
    ])
    if (process.env[envVar]?.trim()) {
        await db.run(`UPDATE users SET password_hash = ? WHERE username = ?`, [Buffer.from(hash), username])
    }
}

export const ensureUsersTable = async (db: Database) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        demo_populated INTEGER NOT NULL DEFAULT 0
    );`)
    // Idempotent migration for databases created before the demo flag existed.
    const cols = (await db.all(`PRAGMA table_info("users")`)) as { name: string }[]
    if (!cols.some((c) => c.name === "demo_populated")) {
        await db.exec(`ALTER TABLE users ADD COLUMN demo_populated INTEGER NOT NULL DEFAULT 0`)
    }
    // Playground sessions expire; NULL means a permanent account. The deadline
    // lives in the database rather than in a timer because the process restarts
    // on every deploy — an in-memory timer would silently leak accounts.
    if (!cols.some((c) => c.name === "expires_at")) {
        await db.exec(`ALTER TABLE users ADD COLUMN expires_at INTEGER`)
    }
    await ensureBootstrapAccount(db, ADMIN_USERNAME, adminPassword(), "ADMIN_PASSWORD")
    // The shared sample account is created here but left empty: its rows are
    // generated on first sign-in (see ensureDemoPopulated) so a fresh deployment
    // does not pay for them until somebody asks.
    await ensureBootstrapAccount(db, DEMO_USERNAME, demoPassword(), "DEMO_PASSWORD")
    // Bandwidth accounting and alert flags live in the same file (tx.db).
    await ensureOperationalTables(db)
}

export const getUser = async (
    username: string,
): Promise<
    | { username: string; password_hash: Uint8Array; demo_populated: number; expires_at: number | null }
    | undefined
> => {
    if (!database.db) return undefined
    return (await database.db.get(
        `SELECT username, password_hash, demo_populated, expires_at FROM users WHERE username = ?`,
        [username],
    )) as
        | { username: string; password_hash: Uint8Array; demo_populated: number; expires_at: number | null }
        | undefined
}

export const createUser = async (username: string, passwordHash: Uint8Array) => {
    if (!database.db) throw new Error("Database not initialized")
    await database.db.run(`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`, [
        username,
        Buffer.from(passwordHash),
        Date.now(),
    ])
}

export const listUsers = async (): Promise<
    { username: string; created_at: number; demo_populated: number; expires_at: number | null }[]
> => {
    if (!database.db) return []
    return (await database.db.all(
        `SELECT username, created_at, demo_populated, expires_at FROM users ORDER BY username`,
    )) as { username: string; created_at: number; demo_populated: number; expires_at: number | null }[]
}

// ── Playground sessions (accounts with an expiry) ───────────────────────────
/** Creates an account that is expected to disappear at `expiresAt`. */
export const createPlaygroundUser = async (username: string, passwordHash: Uint8Array, expiresAt: number) => {
    if (!database.db) throw new Error("Database not initialized")
    await database.db.run(`INSERT INTO users (username, password_hash, created_at, expires_at) VALUES (?, ?, ?, ?)`, [
        username,
        Buffer.from(passwordHash),
        Date.now(),
        expiresAt,
    ])
}

/** Oldest expiries first, so a steady drip of sessions is swept even under load. */
export const listExpiredUsernames = async (now: number, limit: number): Promise<string[]> => {
    if (!database.db) return []
    const rows = (await database.db.all(
        `SELECT username FROM users WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at LIMIT ?`,
        [now, limit],
    )) as { username: string }[]
    return rows.map((row) => row.username)
}

/** Live playground sessions, i.e. the ones that occupy the concurrency budget. */
export const countLivePlaygroundUsers = async (now: number): Promise<number> => {
    if (!database.db) return 0
    const row = (await database.db.get(`SELECT COUNT(*) AS c FROM users WHERE expires_at IS NOT NULL AND expires_at > ?`, [
        now,
    ])) as { c: number } | undefined
    return Number(row?.c ?? 0)
}

export const setUserExpiry = async (username: string, expiresAt: number | null) => {
    if (!database.db) return
    await database.db.run(`UPDATE users SET expires_at = ? WHERE username = ?`, [expiresAt, username])
}

/** Turns a playground session into an ordinary permanent account. */
export const promoteUser = async (username: string, passwordHash: Uint8Array) => {
    if (!database.db) throw new Error("Database not initialized")
    await database.db.run(`UPDATE users SET password_hash = ?, expires_at = NULL WHERE username = ?`, [
        Buffer.from(passwordHash),
        username,
    ])
}

// ── Operational bookkeeping (tx.db) ─────────────────────────────────────────
// Two tiny tables: the month's outbound-byte total (so a deploy cannot reset it)
// and small key/value flags (the alert-channel smoke test). Both are written on a
// throttle — one UPDATE per flush interval — so they cost nothing to keep.

export const ensureOperationalTables = async (db: Database) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS egress_usage (
        period TEXT PRIMARY KEY,
        bytes INTEGER NOT NULL DEFAULT 0
    );`)
    await db.exec(`CREATE TABLE IF NOT EXISTS alert_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );`)
}

export const addEgressBytes = async (period: string, bytes: number) => {
    if (!database.db || !Number.isFinite(bytes) || bytes <= 0) return
    await database.db.run(
        `INSERT INTO egress_usage (period, bytes) VALUES (?, ?)
         ON CONFLICT(period) DO UPDATE SET bytes = bytes + excluded.bytes`,
        [period, Math.round(bytes)],
    )
}

export const readEgressBytes = async (period: string): Promise<number> => {
    if (!database.db) return 0
    const row = (await database.db.get(`SELECT bytes FROM egress_usage WHERE period = ?`, [period])) as
        | { bytes: number }
        | undefined
    return Number(row?.bytes ?? 0)
}

export const getAlertState = async (key: string): Promise<string | undefined> => {
    if (!database.db) return undefined
    const row = (await database.db.get(`SELECT value FROM alert_state WHERE key = ?`, [key])) as
        | { value: string }
        | undefined
    return row?.value
}

export const setAlertState = async (key: string, value: string) => {
    if (!database.db) return
    await database.db.run(
        `INSERT INTO alert_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
    )
}

// Idempotently add the per-user owner column to every data table. Existing rows
// inherit DEFAULT 'admin', so all pre-existing data stays owned by admin.
export const migrateAddUsernameColumn = async (db: Database) => {
    const tables = (await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'users'`,
    )) as { name: string }[]
    for (const { name } of tables) {
        const cols = (await db.all(`PRAGMA table_info("${name}")`)) as { name: string }[]
        if (!cols.some((c) => c.name === "username")) {
            await db.exec(`ALTER TABLE "${name}" ADD COLUMN username TEXT NOT NULL DEFAULT 'admin'`)
        }
    }
}

const ensureUserScopedSchema = async (db: Database, type: "spot" | "spotFuture" | "fundingRate") => {
    if (type === "spot") await ensureUsersTable(db)
    await migrateAddUsernameColumn(db)
}

// Columns the profit/aggregation queries filter, join or sort on. The data tables
// are created dynamically (one per symbol and per exchange), so each rule is only
// applied to tables that actually have those columns — and `IF NOT EXISTS` keeps
// the whole thing idempotent, which makes it safe to run on every boot.
const INDEX_RULES: { suffix: string; columns: string[] }[] = [
    { suffix: "user_ts", columns: ["username", "timestamp"] },
    { suffix: "user_address", columns: ["username", "address"] },
    { suffix: "user", columns: ["username"] },
    { suffix: "cex", columns: ["cexId"] },
    { suffix: "dex", columns: ["dexId"] },
    { suffix: "opening", columns: ["openingId"] },
    { suffix: "closing", columns: ["closingId"] },
    { suffix: "order", columns: ["orderId"] },
    { suffix: "txhash", columns: ["txHash"] },
    { suffix: "position", columns: ["positionId"] },
]

export const ensureIndexes = async (db: Database) => {
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)) as {
        name: string
    }[]
    for (const { name } of tables) {
        const columns = ((await db.all(`PRAGMA table_info("${name}")`)) as { name: string }[]).map((column) => column.name)
        for (const { suffix, columns: wanted } of INDEX_RULES) {
            if (!wanted.every((column) => columns.includes(column))) continue
            await db.exec(`CREATE INDEX IF NOT EXISTS idx_${name}_${suffix} ON "${name}" (${wanted.join(", ")})`)
        }
    }
}

export const initDatabase = async (filename: string, type: "spot" | "spotFuture" | "fundingRate") => {
    let db: Database | undefined = undefined
    try {
        db = await open({
            filename,
            mode: sqlite3.OPEN_READWRITE,
            driver: sqlite3.Database,
        })
    } catch (err: any) {
        console.log("err:", err)

        if (err && err.code == "SQLITE_CANTOPEN") {
            console.log("Creating...")
            db = await open({
                filename,
                mode: sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE,
                driver: sqlite3.Database,
            })
            if (type === "spot") await createTables(db)
            else if (type === "spotFuture") await createSpotFutureTables(db)
            else if (type === "fundingRate") await createFRTables(db)
            //await insertData(db)
        } else if (err) {
            console.log("Getting error " + err)
        }
    }
    if (!db) throw new Error("Missing db!")

    // Ensure the multi-user schema: users table (tx.db) + username column on
    // every data table (existing rows inherit DEFAULT 'admin').
    await ensureUserScopedSchema(db, type)

    // Those queries join and sort with a `username` filter, so hand SQLite the
    // indexes that let it do that without scanning and sorting the whole table.
    await ensureIndexes(db)

    return db
}

export const migrateSpotDB = async (db_old_filepath: string, db_new_filepath: string): Promise<boolean> => {
    // Username-aware, index-backed implementation lives in dbMigrations.ts.
    // Required lazily so this module and dbMigrations can reference each other.
    return migrateSpotDBImpl(db_old_filepath, db_new_filepath)
}

const migrateAccount = async (db: Database, oldAccs: any[], newAccs: any[]) => {
    for (const oldAcc of oldAccs) {
        let unique = true
        for (const newAcc of newAccs) {
            if (parseInt(oldAcc.address, 16) === parseInt(newAcc.address, 16)) {
                unique = false
                break
            }
        }
        if (unique) {
            await db.run(`INSERT INTO accounts (address) VALUES ('${oldAcc.address}');`)
        }
    }
}

const migrateBalance = async (db: Database, symbol: string, oldBals: any[], newBals: any[]) => {
    for (const oldBal of oldBals) {
        let unique = true
        for (const newBal of newBals) {
            if (
                BigInt(oldBal.timestamp) === BigInt(newBal.timestamp) &&
                parseInt(oldBal.address, 16) === parseInt(newBal.address, 16)
            ) {
                unique = false
                break
            }
        }
        if (unique) {
            await db.run(
                `INSERT INTO ${symbol}Bal (timestamp, address, amount) VALUES (${oldBal.timestamp}, '${oldBal.address}', ${oldBal.amount});`,
            )
        }
    }
}
const migrateTxs = async (db: Database, txRowsOld: any[], txRowsNew: any[]) => {
    for (const txRowOld of txRowsOld) {
        let unique = true

        for (const txRowNew of txRowsNew) {
            if (parseInt(txRowOld.address, 16) === parseInt(txRowNew.address, 16)) {
                if (convertType(txRowOld.cexId) && convertType(txRowNew.cexId)) {
                    if (txRowOld.cexId.includes("XRPL") || txRowNew.cexId.includes("XRPL")) {
                        if (txRowOld.cexId === txRowNew.cexId) {
                            unique = false
                            break
                        }
                    } else if (BigInt(txRowOld.cexId) === BigInt(txRowNew.cexId)) {
                        if (txRowOld.cexId === "679158299" || txRowOld.cexId === "679153716")
                            console.log("txRowOld:", txRowOld, "txRowNew:", txRowNew)
                        unique = false
                        break
                    }
                } else {
                    if (txRowOld.dexId === txRowNew.dexId) {
                        unique = false
                        break
                    }
                }
            }
        }

        if (unique) {
            try {
                let sqlString: string = ""
                if (txRowOld.cexId === null && txRowOld.dexId !== null)
                    sqlString = `INSERT INTO transactions (timestamp, address, cexId, dexId)
                            VALUES (${txRowOld.timestamp}, '${txRowOld.address}', NULL, '${txRowOld.dexId}');`
                else if (txRowOld.cexId !== null && txRowOld.dexId === null)
                    sqlString = `INSERT INTO transactions (timestamp, address, cexId, dexId)
                            VALUES (${txRowOld.timestamp}, '${txRowOld.address}', '${txRowOld.cexId}', NULL);`
                else if (txRowOld.cexId !== null && txRowOld.dexId !== null)
                    sqlString = `INSERT INTO transactions (timestamp, address, cexId, dexId)
                            VALUES (${txRowOld.timestamp}, '${txRowOld.address}', '${txRowOld.cexId}', '${txRowOld.dexId}');`
                else throw new Error(`Missing on both cexId and dexId: ${JSON.stringify(txRowOld, null, "  ")}`)

                try {
                    await db.run(sqlString as string)
                    // console.log(`Inserted! ${sqlStrings[i]}`)
                } catch (err: any) {
                    console.log("error:", err)
                    console.log("string:", sqlString)
                    console.log("txRowOld:", txRowOld)
                    throw err
                }
            } catch (err: any) {
                console.error(err)

                return false
            }
        }
    }

    return true
}

const migrateTypedTxs = async (db: Database, type: string, txRowsOld: any[], txRowsNew: any[]) => {
    for (const txRowOld of txRowsOld) {
        let unique = true

        let key = "orderId" in txRowOld ? "orderId" : "txHash" in txRowOld ? "txHash" : undefined

        for (const txRowNew of txRowsNew) {
            try {
                if (convertType(txRowOld.orderId) && convertType(txRowNew.orderId)) {
                    key = "orderId"
                    // if (typeof txRowOld.orderId === typeof txRowNew.orderId) {
                    if (txRowOld.orderId.includes("XRPL") || txRowNew.orderId.includes("XRPL")) {
                        if (txRowOld.orderId === txRowNew.orderId) {
                            unique = false
                            break
                        }
                    } else if (BigInt(txRowOld.orderId) === BigInt(txRowNew.orderId)) {
                        unique = false
                        break
                    }
                    // }
                } else if (convertType(txRowOld.txHash) && convertType(txRowNew.txHash)) {
                    key = "txHash"
                    // if (typeof txRowOld.txHash === typeof txRowNew.txHash) {
                    if (txRowOld.txHash.includes("XRPL") || txRowNew.txHash.includes("XRPL")) {
                        if (txRowOld.txHash === txRowNew.txHash) {
                            unique = false
                            break
                        }
                    } else if (txRowOld.txHash === txRowNew.txHash) {
                        unique = false
                        break
                    }
                    // }
                }
            } catch (err: any) {
                console.log("txRowOld, txRowNew", txRowOld, txRowNew)
                console.log(err)
                throw err
            }
        }

        if (unique) {
            if (!key) {
                throw new Error(`Missing key: ${key} for ${JSON.stringify(txRowOld)}`)
            }
            try {
                const sqlString: string = `INSERT INTO ${type}Txs (${key}, tokenIn, tokenOut)
                    VALUES ("${txRowOld[key]}", "${txRowOld.tokenIn}", "${txRowOld.tokenOut}");`

                try {
                    await db.run(sqlString as string)
                    // console.log(`Inserted! ${sqlStrings[i]}`)
                } catch (err: any) {
                    console.log("error:", err)
                    console.log("key:", key, "txRowOld:", txRowOld)
                    console.log("string:", sqlString)
                    throw err
                }
            } catch (err: any) {
                console.error(err)

                return false
            }
        }
    }

    return true
}

const migrateTokenTxs = async (db: Database, symbol: string, txRowsOld: any[], txRowsNew: any[]) => {
    for (const txRowOld of txRowsOld) {
        let unique = true

        for (const txRowNew of txRowsNew) {
            // if (parseInt(txRowOld.address, 16) === parseInt(txRowNew.address, 16)) {
            if (convertType(txRowOld.orderId) && convertType(txRowNew.orderId)) {
                if (txRowOld.orderId.includes("XRPL") || txRowNew.orderId.includes("XRPL")) {
                    if (txRowOld.orderId === txRowNew.orderId && txRowOld.txHash === txRowNew.txHash) {
                        unique = false
                        break
                    }
                } else if (BigInt(txRowOld.orderId) === BigInt(txRowNew.orderId) && txRowOld.txHash === txRowNew.txHash) {
                    unique = false
                    break
                }
            } else {
                if (txRowOld.txHash === txRowNew.txHash) {
                    unique = false
                    break
                }
            }
            // }
        }

        if (unique) {
            try {
                let sqlString: string = ""
                if (txRowOld.orderId === null && txRowOld.txHash === null)
                    sqlString = `INSERT INTO ${symbol}Txs (orderId, txHash, amount, ratio)
                            VALUES (NULL, NULL, ${txRowOld.amount}, ${txRowOld.ratio});`
                else if (txRowOld.orderId === null)
                    sqlString = `INSERT INTO ${symbol}Txs (orderId, txHash, amount, ratio)
                            VALUES (NULL, '${txRowOld.txHash}', ${txRowOld.amount}, ${txRowOld.ratio});`
                else if (txRowOld.txHash === null)
                    sqlString = `INSERT INTO ${symbol}Txs (orderId, txHash, amount, ratio)
                            VALUES ('${txRowOld.orderId}', NULL, ${txRowOld.amount}, ${txRowOld.ratio});`
                else
                    sqlString = `INSERT INTO ${symbol}Txs (orderId, txHash, amount, ratio)
                            VALUES ('${txRowOld.orderId}', '${txRowOld.txHash}', ${txRowOld.amount}, ${txRowOld.ratio});`
                try {
                    await db.run(sqlString as string)
                    // if (symbol === "usdt") console.log(`Inserted! ${sqlString}`)
                } catch (err: any) {
                    console.log("error:", err)
                    console.log("symbol:", symbol, "\ntxRowOld:", txRowOld, "\nstring:", sqlString)
                    throw err
                }
            } catch (err: any) {
                console.error(err)

                return false
            }
        }
    }

    return true
}

const determineDuplicateEXS = (EXS: string[]) => {
    const onlyCEXs = ["bybitId", "gateId", "binanceId"]
    const DEXs = ["osmId", "injId", "dydxId", "hlId", "boltId", "suilId"]
    const binaryEXs = ["hlId", "boltId"]

    let CEX = "",
        DEX = ""

    for (const EX of EXS) {
        if (onlyCEXs.includes(EX)) CEX = EX
    }

    if (!CEX)
        for (const EX of EXS) {
            if (binaryEXs.includes(EX)) CEX = EX
        }

    for (const EX of EXS) {
        if (CEX && EX !== CEX) {
            if (DEXs.includes(EX)) DEX = EX
        }
    }

    return { CEX, DEX }
}
export const spotFuture_migrateFrom_oldDB = async (db_old_filepath: string, db_new_filepath: string) => {
    return spotFutureMigrateImpl(db_old_filepath, db_new_filepath)
}

export const spotFuture_migrateTypeTxsFrom_oldDB = async (db_old_filepath: string, db_new_filepath: string) => {
    if (!database.spotFutureDB) await database.updateSpotFutureDB(db_new_filepath)
    // const oldDB = await initDatabase(oldDB_path)

    // Outdated Database
    const oldDB = (await initDatabase(db_old_filepath, "spotFuture")) as Database
    // Latest Database
    const newDB = (await initDatabase(db_new_filepath, "spotFuture")) as Database

    let sqlStrings: string[] = []
    // 1. ---------- Migrate account ----------
    // const oldAccs = (await oldDB.all(`SELECT * FROM accounts;`)) as spotFutureDB_typed["accounts"][]
    // const accs = (await newDB.all(`SELECT * FROM accounts;`)) as spotFutureDB_typed["accounts"][]
    let addresses: string[] = []
    // for (const oldAcc of oldAccs) {
    //     let isNewAcc = true

    //     for (const acc of accs) {
    //         if (oldAcc.address === acc.address) {
    //             isNewAcc = false
    //             break
    //         }
    //     }

    //     if (isNewAcc) {
    //         sqlStrings.push(`INSERT INTO accounts (address) VALUES ("${oldAcc.address}");`)
    //         addresses.push(oldAcc.address)
    //     }
    // }

    // for (let i = 0; i < sqlStrings.length; i++) {
    //     try {
    //         await newDB.run(sqlStrings[i])
    //         console.log(`Inserted! ${sqlStrings[i]}`)
    //     } catch (err: any) {
    //         console.error(err)
    //         throw err
    //     }
    // }

    // 2. ---------- Migrate txs ----------
    sqlStrings = []
    const CEXs = ["bybitId", "gateId", "binanceId", "hlId", "boltId"]
    const DEXs = ["osmId", "injId", "dydxId", "hlId", "boltId", "suilId"]
    // const oldTxs = (await oldDB.all(`SELECT * FROM transactions;`)) as spotFutureDB_typed["transactions"][]
    // const txs = (await newDB.all(`SELECT * FROM transactions;`)) as spotFutureDB_typed["transactions"][]

    // let cloudTxsData: spotFutureTxsData[] = []

    // for (const oldTx of oldTxs) {
    //     let isNewTx = true

    //     for (const tx of txs) {
    //         if (oldTx.uuid === tx.uuid) {
    //             isNewTx = false
    //             break
    //         }
    //     }

    //     if (isNewTx) {
    //         let EXS: string[] = []
    //         let CEX = { name: "", value: "" }
    //         let DEX = { name: "", value: "" }
    //         // const skipNames = ["uuid", "timestamp", "address", "futurePrice", "spotPrice"]

    //         for (const key of Object.keys(oldTx)) {
    //             if (CEXs.includes(key) || DEXs.includes(key))
    //                 if (convertType(oldTx[key as keyof typeof oldTx] as string)) EXS.push(key)
    //         }
    //         /* Some EX could be used as CEX or DEX */
    //         const { CEX: uniqueCEX, DEX: uniqueDEX } = determineDuplicateEXS(EXS)

    //         if (convertType(oldTx[uniqueCEX as keyof typeof oldTx] as string))
    //             CEX = {
    //                 name: uniqueCEX,
    //                 value: oldTx[uniqueCEX as keyof typeof oldTx] as string,
    //             }
    //         if (convertType(oldTx[uniqueDEX as keyof typeof oldTx] as string))
    //             DEX = {
    //                 name: uniqueDEX,
    //                 value: oldTx[uniqueDEX as keyof typeof oldTx] as string,
    //             }

    //         if (!DEX.name || !DEX.value || !CEX.name || !CEX.value) {
    //             throw new Error(
    //                 `Missing params: ${uniqueCEX} ${uniqueDEX} DEX: ${JSON.stringify(DEX)} CEX: ${JSON.stringify(
    //                     CEX,
    //                 )},\n Object.keys(oldTx): ${JSON.stringify(Object.keys(oldTx))},\n oldTx: ${JSON.stringify(oldTx)}`,
    //             )
    //         }
    //         sqlStrings.push(
    //             `INSERT INTO transactions (uuid, timestamp, address, ${CEX.name}, ${DEX.name}, qty, futurePrice, spotPrice, orderFee, fundingFee) VALUES ("${oldTx.uuid}", ${oldTx.timestamp}, "${oldTx.address}", "${CEX.value}", "${DEX.value}", ${oldTx.qty}, ${oldTx.futurePrice}, ${oldTx.spotPrice}, ${oldTx.orderFee}, ${oldTx.fundingFee});`,
    //         )

    //         cloudTxsData.push({
    //             uuid: oldTx.uuid,
    //             timestamp: oldTx.timestamp,
    //             address: oldTx.address,
    //             cex: {
    //                 id: CEX.value,
    //                 name: CEX.name,
    //             },
    //             dex: {
    //                 id: DEX.value,
    //                 name: DEX.name,
    //             },
    //             qty: oldTx.qty,
    //             spotPrice: oldTx.spotPrice as number,
    //             futurePrice: oldTx.futurePrice as number,
    //             orderFee: oldTx.orderFee,
    //             fundingFee: oldTx.fundingFee,
    //         })
    //     }
    // }

    // for (let i = 0; i < sqlStrings.length; i++) {
    //     try {
    //         await newDB.run(sqlStrings[i])
    //         console.log(`Inserted! ${sqlStrings[i]}`)
    //     } catch (err: any) {
    //         console.error(sqlStrings[i], err)
    //         throw err
    //     }
    // }

    // 3. ---------- Migrate closed positions ----------
    sqlStrings = []
    // const oldCPositions = (await oldDB.all(`SELECT * FROM closedPositions;`)) as spotFutureDB_typed["closedPositions"][]
    // const cPositions = (await newDB.all(`SELECT * FROM closedPositions;`)) as spotFutureDB_typed["closedPositions"][]
    // let cloudClosedPosData: spotFutureDB_typed["closedPositions"][] = []

    // for (const oldCPos of oldCPositions) {
    //     let isNewClosedPos = true

    //     for (const cPos of cPositions) {
    //         if (oldCPos.openingId === cPos.openingId && oldCPos.closingId === cPos.closingId) {
    //             isNewClosedPos = false
    //             break
    //         }
    //     }

    //     if (isNewClosedPos) {
    //         sqlStrings.push(
    //             `INSERT INTO closedPositions (timestamp, openingId, closingId) VALUES (${oldCPos.timestamp}, '${oldCPos.openingId}', '${oldCPos.closingId}');`,
    //         )
    //         cloudClosedPosData.push(oldCPos)
    //     }
    // }

    // for (let i = 0; i < sqlStrings.length; i++) {
    //     try {
    //         await newDB.run(sqlStrings[i])
    //         console.log(`Inserted! ${sqlStrings[i]}`)
    //     } catch (err: any) {
    //         console.error(sqlStrings[i], err)
    //         throw err
    //     }
    // }

    // 4. ---------- Migrate opened positions ----------
    sqlStrings = []
    // const oldOPositions = (await oldDB.all(`SELECT * FROM openedPositions;`)) as spotFutureDB_typed["openedPositions"][]
    // const oPositions = (await newDB.all(`SELECT * FROM openedPositions;`)) as spotFutureDB_typed["openedPositions"][]
    // let cloudOpenedPosData: spotFutureDB_typed["openedPositions"][] = []
    // for (const oldOPos of oldOPositions) {
    //     let isNewClosedPos = true

    //     for (const oPos of oPositions) {
    //         if (oldOPos.openingId === oPos.openingId) {
    //             isNewClosedPos = false
    //             break
    //         }
    //     }

    //     if (isNewClosedPos) {
    //         sqlStrings.push(
    //             `INSERT INTO openedPositions (timestamp, openingId) VALUES (${oldOPos.timestamp}, '${oldOPos.openingId}');`,
    //         )
    //         cloudOpenedPosData.push(oldOPos)
    //     }
    // }

    // for (let i = 0; i < sqlStrings.length; i++) {
    //     try {
    //         await newDB.run(sqlStrings[i])
    //         console.log(`Inserted! ${sqlStrings[i]}`)
    //     } catch (err: any) {
    //         console.error(err)
    //         throw err
    //     }
    // }

    // 5. ---------- Migrate typed transactions ----------
    sqlStrings = []
    const oldTableName = await oldDB.all('SELECT name FROM sqlite_master WHERE type="table"')
    console.log("oldTableName", oldTableName)
    /*
    tableName = [
        { name: 'openedPositions' },
        { name: 'closedPositions' },
        { name: 'accounts' },
        { name: 'bybitTxs' },
        { name: 'gateTxs' },
        { name: 'binanceTxs' }
    ]
   */
    const typedTxName = ["bybit", "gate", "binance", "osm", "inj", "dydx", "hl", "bolt", "suil"]
    // typedTxName.forEach(async (typed) => {
    for await (const typed of typedTxName) {
        const _sqlStrings = []
        // const typed = typedTxName[i]

        const oldTTxs = oldTableName.find(({ name }) => name === `${typed}Txs`)
            ? ((await oldDB.all(`SELECT * FROM ${typed}Txs;`)) as spotFutureDB_typed["typedTx"][])
            : []
        const tTxs = (await newDB.all(`SELECT * FROM ${typed}Txs;`)) as spotFutureDB_typed["typedTx"][]
        console.log("current typed: ", typed)
        console.log("oldTTxs: ", oldTTxs)
        console.log("tTxs: ", tTxs)
        let cloudTypedTxsData: spotFutureTypedTxsData[] = []

        for (const oldTTx of oldTTxs) {
            let isNewTTx = true

            for (const tTx of tTxs) {
                if (oldTTx.id === tTx.id) {
                    isNewTTx = false
                    break
                }
            }

            if (isNewTTx) {
                await spotFutureDatabase_createTablesIfNotExists(undefined, {
                    symbol: typed as unknown as EXCHANGE_NAME,
                })
                _sqlStrings.push(
                    `INSERT INTO ${typed}Txs (id, tokenIn, tokenOut) VALUES ('${oldTTx.id}', '${oldTTx.tokenIn}', '${oldTTx.tokenOut}');`,
                )
                cloudTypedTxsData.push({
                    ...oldTTx,
                    typed: typed as unknown as EXCHANGE_NAME,
                })
            }
        }

        // if (isCloud && cloudTypedTxsData.length !== 0)
        //     if (!(await this.uploadTypedTxsData(cloudTypedTxsData)))
        //         throw new Error(`Upload exchange txs failed: ${JSON.stringify(cloudTypedTxsData, null, "  ")}`)
        console.log("full sql", JSON.stringify(_sqlStrings, null, "  "))
        for await (const sqlStr of _sqlStrings) {
            try {
                console.log("INFO -- running: ", typed, sqlStr)
                await newDB.run(sqlStr)
                // console.log(`Inserted! ${sqlStrings[i]}`)
            } catch (err: any) {
                console.error(err)
                console.log("ISSUE:", typed, sqlStr)

                console.log("oldTTxs: ", JSON.stringify(oldTTxs, null, "  "))
                console.log("tTxs: ", JSON.stringify(tTxs, null, "  "))
                throw err
            }
        }
    }

    // 6. ---------- Migrate coin profits ----------
    sqlStrings = []
    // const symbols = ["BTC", "AKT", "INJ", "DYDX", "USDT", "USDC"]
    // let regex = new RegExp("Txs", "i")
    // // let regexTyped = new RegExp("typescript", "i")
    // const tables = await oldDB.all(`SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;`)
    // console.log("tables:", tables)
    // let coins: string[] = []
    // for (const table of tables) {
    //     if (regex.test(table.name)) {
    //         if (typedTxName.includes(table.name.split("T")[0])) continue

    //         coins.push(table.name.split("T")[0])
    //     }
    // }
    // console.log("coins:", coins)
    let cloudSymbolProfitData: spotFutureCoinProfitData[] = []
    // for (const coin of coins) {
    //     await spotFutureDatabase_createTablesIfNotExists(coin)

    //     const oldCoinProfits = (await oldDB.all(`SELECT * FROM ${coin}Txs;`)) as spotFutureDB_typed["symbolTx"][]
    //     // console.log("oldCoinProfits", oldCoinProfits)

    //     for (const oldCoinTx of oldCoinProfits) {
    //         let isNewCTx = false

    //         // Since coinProfits referencing Primary Index of closedPosition,
    //         // which would be a different value when the closed pos is inserted into the new DB
    //         const oldClosedPos = (
    //             (await oldDB.all(
    //                 `SELECT * FROM closedPositions WHERE closedPositions.id = "${oldCoinTx.positionId}";`,
    //             )) as spotFutureDB_typed["closedPositions"][]
    //         )[0]
    //         const newClosedPos = (await newDB.all(
    //             `SELECT * FROM closedPositions WHERE closedPositions.closingId = "${oldClosedPos.closingId}";`,
    //         )) as spotFutureDB_typed["closedPositions"][]

    //         if (newClosedPos.length !== 0) {
    //             const profit = await newDB.all(
    //                 `SELECT * FROM ${coin}Txs WHERE ${coin}Txs.positionId = ${newClosedPos[0].id}`,
    //             )
    //             if (profit.length === 0) isNewCTx = true
    //         }

    //         if (isNewCTx) {
    //             sqlStrings.push(
    //                 `INSERT INTO ${coin}Txs (positionId, amount, ratio) VALUES (${newClosedPos[0].id}, ${oldCoinTx.amount}, ${oldCoinTx.ratio});`,
    //             )
    //             cloudSymbolProfitData.push({ ...oldCoinTx, positionId: newClosedPos[0].id, symbol: coin })
    //             // continue
    //         }
    //     }
    // }

    // for (let i = 0; i < sqlStrings.length; i++) {
    //     try {
    //         await newDB.run(sqlStrings[i])
    //         console.log(`Inserted! ${sqlStrings[i]}`)
    //     } catch (err: any) {
    //         console.error(err)
    //         throw err
    //     }
    // }

    await oldDB.close()
    console.info(` -- INFO -- Database successfully migrated from ${db_old_filepath} to ${db_new_filepath}.`)
}
export const FR_migrateFrom_oldDB = async (db_old_filepath: string, db_new_filepath: string) => {
    return FRMigrateImpl(db_old_filepath, db_new_filepath)
}
