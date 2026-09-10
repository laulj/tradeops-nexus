import { Database } from "sqlite"
import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import { database } from "./database"
import { insertAddressIfNotExists, database_createNewTables } from "./databaseRouter"
import { spotFutureDatabase_createTablesIfNotExists } from "./futureDatabaseRouter"
import { fundingRateDatabase_createTablesIfNotExists } from "./fundingRateDatabaseRouter"
import { EXCHANGE_NAME } from "./utils"

// The routers type the exchange-name param as the EXCHANGE_NAME tuple; at runtime
// it is a plain exchange string. This helper bridges that (existing) type quirk.
type ExchangeTuple = typeof EXCHANGE_NAME
const exchangeRef = (e: string): { symbol: ExchangeTuple } => ({ symbol: e as unknown as ExchangeTuple })

// ── Demo dataset constants ──────────────────────────────────────────────────
// Base tokens seeded. USDC is the quote token and sorts first in /data/symbols.
export const DEMO_SYMBOLS = ["USDC", "ETH", "BTC", "SOL", "ARB", "WIF", "TIA", "TSLA", "NVDA"] as const
const DEMO_BASES = ["ETH", "BTC", "SOL", "ARB", "WIF", "TIA", "TSLA", "NVDA"] as const
const SPOT_TX_COUNT = 128
const BALANCE_SNAPSHOTS = 13 // one every 5 days across a 60-day window

const DAY = 5 * 31 * 60 * 60 * 1000

// ── Per-population pseudo-random data ──────────────────────────────────────
// populateDemoData() creates a fresh PRNG so every account gets a different,
// plausible dataset while structure, row counts, demoAddress and demoId (which
// must stay globally unique) are unchanged. Tests assert counts/identities only.
type Rand = () => number

const mulberry32 = (seed: number): Rand => {
    let a = seed >>> 0
    return () => {
        a += 0x6d2b79f5
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const makeRand = (): Rand => {
    const entropy = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}:${Math.random()}`
    const seed = parseInt(hashHex(entropy).slice(0, 8), 16)
    return mulberry32(seed)
}
const rNum = (rand: Rand, min: number, max: number, dp = 4): number => Number((min + rand() * (max - min)).toFixed(dp))
const rInt = (rand: Rand, min: number, max: number): number => Math.floor(min + rand() * (max - min + 1))

// Reference prices keep random fills in a believable per-symbol magnitude.
const SPOT_REF_PRICE: Record<string, number> = {
    eth: 3400,
    btc: 67000,
    sol: 175,
    arb: 1.05,
    wif: 1.9,
    tia: 5.2,
    tsla: 250,
    nvda: 135,
}
const SF_REF_PRICE: Record<string, number> = { eth: 3400, btc: 67000, sol: 175, arb: 1.05 }
const FR_REF_PRICE: Record<string, number> = { eth: 3400, btc: 67000, sol: 175 }

// Deterministic per-user values. Uniqueness across users matters because many
// id columns are globally UNIQUE — the username is mixed into the hash input.
const hashHex = (input: string): string => Buffer.from(keccak256(utf8ToBytes(input))).toString("hex")

export const demoAddress = (username: string, i: number): string => "0x" + hashHex(`${username}:addr:${i}`).slice(0, 40)
const demoId = (username: string, kind: string, i: number): string => hashHex(`${username}:${kind}:${i}`).slice(0, 40)

const daysAgo = (n: number, hourOffset = 0): number => Date.now() - n * DAY + hourOffset * 3_600_000

// ── Spot data (tx.db) ───────────────────────────────────────────────────────
const seedSpotDemoData = async (username: string, db: Database, rand: Rand) => {
    const addresses = [demoAddress(username, 0), demoAddress(username, 1)]

    // Accounts + dynamic symbol tables (created with the username column).
    for (const addr of addresses) await insertAddressIfNotExists(db, addr, username)
    for (const symbol of DEMO_SYMBOLS) await database_createNewTables(symbol.toLowerCase(), db)

    // ── Arbitrage transactions + typed (cex/dex) + per-symbol rows ────────
    // Each demo trade mirrors a CEX↔DEX arbitrage: both a cexId and a dexId leg
    // exist, so the profit aggregations (which require both legs) light up.
    for (let i = 0; i < SPOT_TX_COUNT; i++) {
        const timestamp = daysAgo(Math.floor((i * 60) / SPOT_TX_COUNT), (i % 12) + 1)
        const address = addresses[i % 2]
        const base = DEMO_BASES[i % DEMO_BASES.length]
        const cexId = demoId(username, "cex", i)
        const dexHash = demoId(username, "dex", i)

        await db.run(`INSERT OR IGNORE INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            cexId,
            base,
            "USDC",
            username,
        ])
        await db.run(`INSERT OR IGNORE INTO dexTxs (txHash, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            dexHash,
            base,
            "USDC",
            username,
        ])
        await db.run(
            `INSERT OR IGNORE INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`,
            [timestamp, address, cexId, dexHash, username],
        )

        const amount = rNum(rand, 30, 420, 2)
        const ratio = rNum(rand, 0.00015, 0.0038, 6)
        // The profit aggregations join the QUOTE symbol's Txs table (usdcTxs)
        // via orderId/txHash — seed that as the source of profit rows.
        await db.run(`INSERT OR IGNORE INTO usdcTxs (orderId, txHash, amount, ratio, username) VALUES (?, ?, ?, ?, ?)`, [
            cexId,
            dexHash,
            amount,
            ratio,
            username,
        ])
        // Also record the base-symbol rows so the base symbols show up in
        // /data/symbols and the per-base tables aren't empty.
        await db.run(
            `INSERT OR IGNORE INTO ${base.toLowerCase()}Txs (orderId, txHash, amount, ratio, username) VALUES (?, ?, ?, ?, ?)`,
            [cexId, dexHash, amount, ratio, username],
        )
    }

    // ── Balance snapshots (spot charts) ────────────────────────────────────
    // Wallet balances drift on a random walk per address — organic chartable
    // series instead of straight lines — with a light positive bias and a floor.
    const balanceBase: Record<string, number> = { usdc: 8000, eth: 1.5, btc: 0.02, sol: 20, arb: 100 }
    for (const [symbol, startAmount] of Object.entries(balanceBase)) {
        const level: number[] = addresses.map(() => startAmount * (0.8 + rand() * 0.4))
        for (let i = 0; i < BALANCE_SNAPSHOTS; i++) {
            const timestamp = daysAgo(60 - i * 5)
            for (let a = 0; a < addresses.length; a++) {
                // Per-5-day shock (~8% magnitude) with a tiny upward drift for a
                // "managed" wallet; floored at 40% of the starting holding.
                const shock = (rand() - 0.46) * 0.16
                level[a] = Math.max(startAmount * 0.4, level[a] * (1 + shock))
                await db.run(
                    `INSERT OR IGNORE INTO ${symbol}Bal (timestamp, address, amount, username) VALUES (?, ?, ?, ?)`,
                    [timestamp, addresses[a], Number(level[a].toFixed(6)), username],
                )
            }
        }
    }
}

// ── SpotFuture data (spotFuture.db) ─────────────────────────────────────────
const SF_EXCHANGE_PAIRS: [string, string][] = [
    ["bybit", "binance"],
    ["gate", "hl"],
    ["bybit", "hl"],
    ["binance", "gate"],
]
const SF_SYMBOLS = ["eth", "btc", "sol", "arb"] as const

const seedSpotFutureDemoData = async (username: string, db: Database, rand: Rand) => {
    const address = demoAddress(username, 2)

    await insertAddressIfNotExists(db, address, username)

    let position = 0
    for (let open = 0; open < 3; open++, position++) {
        const [ex1, ex2] = SF_EXCHANGE_PAIRS[position % SF_EXCHANGE_PAIRS.length]
        const openId = demoId(username, "sf-open", position)
        const ex1Id = demoId(username, "sfx", position * 2)
        const ex2Id = demoId(username, "sfx", position * 2 + 1)
        const timestamp = daysAgo(5 * position + 3)

        await spotFutureDatabase_createTablesIfNotExists(undefined, exchangeRef(ex1), db)
        await spotFutureDatabase_createTablesIfNotExists(undefined, exchangeRef(ex2), db)
        await db.run(`INSERT OR IGNORE INTO ${ex1}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            ex1Id,
            "ETH",
            "USDC",
            username,
        ])
        await db.run(`INSERT OR IGNORE INTO ${ex2}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            ex2Id,
            "ETH",
            "USDC",
            username,
        ])
        await db.run(
            `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                openId,
                timestamp,
                address,
                ex1Id,
                ex2Id,
                rNum(rand, 0.4, 2.4, 3),
                rNum(rand, 0.96, 1.06, 4) * SF_REF_PRICE.eth,
                rNum(rand, 0.955, 1.05, 4) * SF_REF_PRICE.eth,
                rNum(rand, 0.35, 1.8, 3),
                rNum(rand, 0.3, 2.4, 3),
                username,
            ],
        )
        await db.run(`INSERT OR IGNORE INTO openedPositions (timestamp, openingId, username) VALUES (?, ?, ?)`, [
            timestamp,
            openId,
            username,
        ])
    }

    for (let closed = 0; closed < 4; closed++, position++) {
        const [ex1, ex2] = SF_EXCHANGE_PAIRS[position % SF_EXCHANGE_PAIRS.length]
        const openId = demoId(username, "sf-open", position)
        const closeId = demoId(username, "sf-close", position)
        // Open and close legs are separate exchange orders — they need their own
        // ids because transactions.{exchange}Id columns are globally UNIQUE.
        const openEx1Id = demoId(username, "sfx", position * 4)
        const openEx2Id = demoId(username, "sfx", position * 4 + 1)
        const closeEx1Id = demoId(username, "sfx", position * 4 + 2)
        const closeEx2Id = demoId(username, "sfx", position * 4 + 3)
        const openTs = daysAgo(5 * position + 3)
        const closeTs = daysAgo(5 * position)
        const symbol = SF_SYMBOLS[closed % SF_SYMBOLS.length]
        const refPrice = SF_REF_PRICE[symbol]
        const qty = rNum(rand, 0.3, 1.8, 3)
        const profitAmount = rNum(rand, 40, 260, 2)
        const profitRatio = rNum(rand, 0.0006, 0.0055, 6)

        await spotFutureDatabase_createTablesIfNotExists(undefined, exchangeRef(ex1), db)
        await spotFutureDatabase_createTablesIfNotExists(undefined, exchangeRef(ex2), db)
        await spotFutureDatabase_createTablesIfNotExists(symbol, undefined, db)
        await db.run(`INSERT OR IGNORE INTO ${ex1}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            openEx1Id,
            symbol.toUpperCase(),
            "USDC",
            username,
        ])
        await db.run(`INSERT OR IGNORE INTO ${ex2}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            openEx2Id,
            symbol.toUpperCase(),
            "USDC",
            username,
        ])
        await db.run(`INSERT OR IGNORE INTO ${ex1}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            closeEx1Id,
            symbol.toUpperCase(),
            "USDC",
            username,
        ])
        await db.run(`INSERT OR IGNORE INTO ${ex2}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            closeEx2Id,
            symbol.toUpperCase(),
            "USDC",
            username,
        ])
        await db.run(
            `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                openId,
                openTs,
                address,
                openEx1Id,
                openEx2Id,
                qty,
                rNum(rand, 0.96, 1.05, 4) * refPrice,
                rNum(rand, 0.95, 1.04, 4) * refPrice,
                rNum(rand, 0.3, 1.4, 3),
                rNum(rand, 0.2, 1.6, 3),
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                closeId,
                closeTs,
                address,
                closeEx1Id,
                closeEx2Id,
                qty,
                rNum(rand, 0.95, 1.06, 4) * refPrice,
                rNum(rand, 0.94, 1.05, 4) * refPrice,
                rNum(rand, 0.3, 1.4, 3),
                rNum(rand, 0.2, 1.6, 3),
                username,
            ],
        )
        let cp = await db.get(`SELECT id FROM closedPositions WHERE openingId = ? AND closingId = ?`, [openId, closeId])
        if (!cp) {
            await db.run(
                `INSERT OR IGNORE INTO closedPositions (timestamp, openingId, closingId, username) VALUES (?, ?, ?, ?)`,
                [closeTs, openId, closeId, username],
            )
            cp = await db.get(`SELECT id FROM closedPositions WHERE openingId = ? AND closingId = ?`, [openId, closeId])
        }
        await db.run(`INSERT OR IGNORE INTO ${symbol}Txs (positionId, amount, ratio, username) VALUES (?, ?, ?, ?)`, [
            cp.id,
            profitAmount,
            profitRatio,
            username,
        ])
        // The profit aggregations read the QUOTE symbol's Txs table (usdcTxs)
        // joined by positionId — seed it too so closed-position profits render.
        await spotFutureDatabase_createTablesIfNotExists("usdc", undefined, db)
        await db.run(`INSERT OR IGNORE INTO usdcTxs (positionId, amount, ratio, username) VALUES (?, ?, ?, ?)`, [
            cp.id,
            profitAmount,
            profitRatio,
            username,
        ])
    }
}

// ── Funding-rate data (fRate.db) ────────────────────────────────────────────
const FR_EXCHANGE_PAIRS: [string, string][] = [
    ["bybit", "hl"],
    ["binance", "hl"],
    ["gate", "bybit"],
]
const FR_SYMBOLS = ["eth", "btc", "sol"] as const

const seedFundingRateDemoData = async (username: string, db: Database, rand: Rand) => {
    const address = demoAddress(username, 3)

    await insertAddressIfNotExists(db, address, username)

    let position = 0
    for (let open = 0; open < 3; open++, position++) {
        const [ex1, ex2] = FR_EXCHANGE_PAIRS[position % FR_EXCHANGE_PAIRS.length]
        const openId = demoId(username, "fr-open", position)
        const ex1Id = demoId(username, "frx", position * 2)
        const ex2Id = demoId(username, "frx", position * 2 + 1)
        const timestamp = daysAgo(4 * position + 2)

        await fundingRateDatabase_createTablesIfNotExists(undefined, exchangeRef(ex1), db)
        await fundingRateDatabase_createTablesIfNotExists(undefined, exchangeRef(ex2), db)
        await db.run(
            `INSERT OR IGNORE INTO ${ex1}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                ex1Id,
                rNum(rand, 0.96, 1.06, 4) * FR_REF_PRICE.eth,
                rNum(rand, 0.25, 1.2, 3),
                rNum(rand, 0.05, 0.8, 3),
                "ETH",
                "USDC",
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO ${ex2}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                ex2Id,
                rNum(rand, 0.955, 1.055, 4) * FR_REF_PRICE.eth,
                rNum(rand, 0.25, 1.2, 3),
                rNum(rand, 0.05, 0.8, 3),
                "ETH",
                "USDC",
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [openId, timestamp, address, ex1Id, ex2Id, rNum(rand, 0.3, 2.5, 3), username],
        )
        await db.run(`INSERT OR IGNORE INTO openedPositions (timestamp, openingId, username) VALUES (?, ?, ?)`, [
            timestamp,
            openId,
            username,
        ])
    }

    for (let closed = 0; closed < 4; closed++, position++) {
        const [ex1, ex2] = FR_EXCHANGE_PAIRS[position % FR_EXCHANGE_PAIRS.length]
        const openId = demoId(username, "fr-open", position)
        const closeId = demoId(username, "fr-close", position)
        // Open and close legs are separate exchange orders — they need their own
        // ids because transactions.{exchange}Id columns are globally UNIQUE.
        const openEx1Id = demoId(username, "frx", position * 4)
        const openEx2Id = demoId(username, "frx", position * 4 + 1)
        const closeEx1Id = demoId(username, "frx", position * 4 + 2)
        const closeEx2Id = demoId(username, "frx", position * 4 + 3)
        const openTs = daysAgo(4 * position + 2)
        const closeTs = daysAgo(4 * position)
        const symbol = FR_SYMBOLS[closed % FR_SYMBOLS.length]
        const refPrice = FR_REF_PRICE[symbol]
        const qty = rNum(rand, 0.3, 2.2, 3)
        const profitAmount = rNum(rand, 35, 230, 2)
        const profitRatio = rNum(rand, 0.0004, 0.005, 6)

        await fundingRateDatabase_createTablesIfNotExists(undefined, exchangeRef(ex1), db)
        await fundingRateDatabase_createTablesIfNotExists(undefined, exchangeRef(ex2), db)
        await fundingRateDatabase_createTablesIfNotExists(symbol, undefined, db)
        await db.run(
            `INSERT OR IGNORE INTO ${ex1}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                openEx1Id,
                rNum(rand, 0.96, 1.06, 4) * refPrice,
                rNum(rand, 0.2, 1.2, 3),
                rNum(rand, 0.03, 0.7, 3),
                symbol.toUpperCase(),
                "USDC",
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO ${ex2}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                openEx2Id,
                rNum(rand, 0.955, 1.055, 4) * refPrice,
                rNum(rand, 0.2, 1.2, 3),
                rNum(rand, 0.02, 0.6, 3),
                symbol.toUpperCase(),
                "USDC",
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO ${ex1}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                closeEx1Id,
                rNum(rand, 0.95, 1.07, 4) * refPrice,
                rNum(rand, 0.2, 1.2, 3),
                rNum(rand, 0.03, 0.7, 3),
                symbol.toUpperCase(),
                "USDC",
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO ${ex2}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                closeEx2Id,
                rNum(rand, 0.945, 1.065, 4) * refPrice,
                rNum(rand, 0.2, 1.2, 3),
                rNum(rand, 0.02, 0.6, 3),
                symbol.toUpperCase(),
                "USDC",
                username,
            ],
        )
        await db.run(
            `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [openId, openTs, address, openEx1Id, openEx2Id, qty, username],
        )
        await db.run(
            `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [closeId, closeTs, address, closeEx1Id, closeEx2Id, qty, username],
        )
        let cp = await db.get(`SELECT id FROM closedPositions WHERE openingId = ? AND closingId = ?`, [openId, closeId])
        if (!cp) {
            await db.run(
                `INSERT OR IGNORE INTO closedPositions (timestamp, openingId, closingId, username) VALUES (?, ?, ?, ?)`,
                [closeTs, openId, closeId, username],
            )
            cp = await db.get(`SELECT id FROM closedPositions WHERE openingId = ? AND closingId = ?`, [openId, closeId])
        }
        await db.run(`INSERT OR IGNORE INTO ${symbol}Txs (positionId, amount, ratio, username) VALUES (?, ?, ?, ?)`, [
            cp.id,
            profitAmount,
            profitRatio,
            username,
        ])
        // The profit aggregations read the QUOTE symbol's Txs table (usdcTxs)
        // joined by positionId — seed it too so closed-position profits render.
        await fundingRateDatabase_createTablesIfNotExists("usdc", undefined, db)
        await db.run(`INSERT OR IGNORE INTO usdcTxs (positionId, amount, ratio, username) VALUES (?, ?, ?, ?)`, [
            cp.id,
            profitAmount,
            profitRatio,
            username,
        ])
    }
}

// ── Public API ──────────────────────────────────────────────────────────────
export const populateDemoData = async (username: string) => {
    if (!database.db || !database.spotFutureDB || !database.fundingRateDB) throw new Error("Databases not initialized")
    const rand = makeRand()
    await seedSpotDemoData(username, database.db, rand)
    await seedSpotFutureDemoData(username, database.spotFutureDB, rand)
    await seedFundingRateDemoData(username, database.fundingRateDB, rand)
    await database.db.run(`UPDATE users SET demo_populated = 1 WHERE username = ?`, [username])
}

// Rollback helper: delete every row owned by `username` in all three DBs plus
// the users-table entry (used when demo seeding fails partway through).
export const removeUserData = async (username: string) => {
    const dbs = [database.db, database.spotFutureDB, database.fundingRateDB].filter(Boolean) as Database[]
    for (const db of dbs) {
        const tables = (await db.all(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'users'`,
        )) as { name: string }[]
        for (const { name } of tables) {
            const cols = (await db.all(`PRAGMA table_info("${name}")`)) as { name: string }[]
            if (cols.some((c) => c.name === "username")) {
                await db.run(`DELETE FROM "${name}" WHERE username = ?`, [username])
            }
        }
    }
    if (database.db) await database.db.run(`DELETE FROM users WHERE username = ?`, [username])
}
