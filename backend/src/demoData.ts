import { Database } from "sqlite"
import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import { database, getUser } from "./database"
import { insertAddressIfNotExists, database_createNewTables } from "./databaseRouter"
import { spotFutureDatabase_createTablesIfNotExists } from "./futureDatabaseRouter"
import { fundingRateDatabase_createTablesIfNotExists } from "./fundingRateDatabaseRouter"
import { EXCHANGE_NAME } from "./utils"
import { isReservedUsername } from "./credentials"

// The routers type the exchange-name param as the EXCHANGE_NAME tuple; at runtime
// it is a plain exchange string. This helper bridges that (existing) type quirk.
type ExchangeTuple = typeof EXCHANGE_NAME
const exchangeRef = (e: string): { symbol: ExchangeTuple } => ({ symbol: e as unknown as ExchangeTuple })

// ── Demo dataset shape ──────────────────────────────────────────────────────
// Base tokens seeded. USDC is the quote token and sorts first in /data/symbols.
export const DEMO_SYMBOLS = ["USDC", "ETH", "BTC", "SOL", "ARB", "WIF", "TIA", "TSLA", "NVDA"] as const
const DEMO_BASES = ["ETH", "BTC", "SOL", "ARB", "WIF", "TIA", "TSLA", "NVDA"] as const

// Venues and symbols traded by the perp-futures and funding-rate books.
const SF_EXCHANGE_PAIRS: [string, string][] = [
    ["bybit", "binance"],
    ["gate", "hl"],
    ["bybit", "hl"],
    ["binance", "gate"],
]
const SF_SYMBOLS = ["eth", "btc", "sol", "arb"] as const
const FR_EXCHANGE_PAIRS: [string, string][] = [
    ["bybit", "hl"],
    ["binance", "hl"],
    ["gate", "bybit"],
]
const FR_SYMBOLS = ["eth", "btc", "sol"] as const
const SF_PAIR_WEIGHTS = [0.35, 0.28, 0.22, 0.15]
const FR_PAIR_WEIGHTS = [0.4, 0.35, 0.25]

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const EPOCH_8H = 8 * 60 * 60 * 1000

// A fresh account gets a multi-year trading history: enough that the daily,
// weekly, monthly, quarterly and yearly profit views all say something.
export const DEMO_WINDOW_DAYS = 1095 // three years
const MIN_WINDOW_DAYS = 30

// Env override, read per call rather than at import time, so tests can shrink the
// window (and the seed work they have to pay for) without re-importing this module.
export const demoWindowDays = (): number => {
    const raw = Number(process.env.DEMO_WINDOW_DAYS)
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEMO_WINDOW_DAYS
}

// Row counts are derived here rather than hard-coded at the insert sites, and are
// exported so tests can assert against demoPlan() instead of magic numbers.
export const demoPlan = (windowDays: number = demoWindowDays()) => {
    const days = Math.max(MIN_WINDOW_DAYS, Math.round(windowDays))
    return {
        windowDays: days,
        spotTrades: Math.max(8, Math.round((days / 7) * 4)), // ≈4 round-trips a week
        balanceSnapshots: Math.floor(days / 7) + 1, // weekly
        spotFuture: { open: 5, closed: 24 }, // ≈2 closed positions a month
        fundingRate: { open: 5, closed: 24 },
    }
}
export type DemoPlan = ReturnType<typeof demoPlan>

// ── Per-account pseudo-random data ──────────────────────────────────────────
// The PRNG is seeded from the username, so an account always gets the same
// plausible history (reproducible demos, screenshots and tests) while two
// accounts still differ. Row counts, structure, demoAddress and demoId — which
// must stay globally unique — stay deterministic either way.
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

// Deterministic per-user values. Uniqueness across users matters because many id
// columns are globally UNIQUE — the username is mixed into the hash input.
const hashHex = (input: string): string => Buffer.from(keccak256(utf8ToBytes(input))).toString("hex")

export const demoAddress = (username: string, i: number): string => "0x" + hashHex(`${username}:addr:${i}`).slice(0, 40)
const demoId = (username: string, kind: string, i: number): string => hashHex(`${username}:${kind}:${i}`).slice(0, 40)

const makeRand = (username: string): Rand => mulberry32(parseInt(hashHex(`${username}:demo:v2`).slice(0, 8), 16))

const rNum = (rand: Rand, min: number, max: number, dp = 4): number => Number((min + rand() * (max - min)).toFixed(dp))
const rInt = (rand: Rand, min: number, max: number): number => Math.floor(min + rand() * (max - min + 1))
const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value))

/** Box–Muller transform: a standard normal deviate. */
const gauss = (rand: Rand): number => {
    let u = 0
    let v = 0
    while (u === 0) u = rand()
    while (v === 0) v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Weighted pick — keeps the symbol/venue mix realistic instead of round-robin. */
const weightedPick = <T>(rand: Rand, items: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    let roll = rand() * total
    for (let i = 0; i < items.length; i++) {
        roll -= weights[i]
        if (roll <= 0) return items[i]
    }
    return items[items.length - 1]
}

// One transaction per database. SQLite commits (and fsyncs) every statement on
// its own, which turns a multi-thousand-row seed into a multi-second one.
const inTransaction = async <T>(db: Database, body: () => Promise<T>): Promise<T> => {
    await db.exec("BEGIN")
    try {
        const result = await body()
        await db.exec("COMMIT")
        return result
    } catch (err) {
        await db.exec("ROLLBACK").catch(() => {})
        throw err
    }
}

// ── Market model ────────────────────────────────────────────────────────────
// Reference prices anchor "today": each symbol's walk is rescaled so its newest
// point lands on the reference, so fills stay in a believable magnitude while the
// history itself trends, dips and gaps.
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

// Per-symbol character: how volatile it is, how heavily the desk trades it and how
// big a ticket it writes. Drives the weighted picks and the position sizing.
type Market = { vol: number; weight: number; notional: [number, number] }
const MARKETS: Record<string, Market> = {
    eth: { vol: 0.033, weight: 5, notional: [4000, 90000] },
    btc: { vol: 0.026, weight: 5, notional: [5000, 120000] },
    sol: { vol: 0.046, weight: 3, notional: [2000, 45000] },
    arb: { vol: 0.05, weight: 2, notional: [800, 18000] },
    wif: { vol: 0.066, weight: 1, notional: [400, 9000] },
    tia: { vol: 0.056, weight: 1, notional: [500, 12000] },
    tsla: { vol: 0.028, weight: 2, notional: [1500, 30000] },
    nvda: { vol: 0.03, weight: 2, notional: [1500, 30000] },
}
const market = (symbol: string): Market => MARKETS[symbol] ?? { vol: 0.04, weight: 1, notional: [1000, 20000] }
const refPrice = (symbol: string): number => SPOT_REF_PRICE[symbol] ?? SF_REF_PRICE[symbol] ?? FR_REF_PRICE[symbol] ?? 1

/** Daily closes for one symbol: a geometric walk with a drifting trend and the
 *  odd gap, rescaled so the most recent day equals the reference price. */
const pricePath = (ref: number, days: number, vol: number, rand: Rand): number[] => {
    const path: number[] = [ref]
    let drift = (rand() - 0.42) * 0.0018
    for (let d = 1; d <= days; d++) {
        if (rand() < 0.012) drift = (rand() - 0.5) * 0.003 // regime change
        const gap = rand() < 0.02 ? (rand() - 0.5) * 0.22 : 0 // news gap
        path.push(path[d - 1] * (1 + drift + gauss(rand) * vol + gap))
    }
    const scale = ref / path[days]
    return path.map((p) => Number(Math.max(ref / 40, p * scale).toPrecision(12)))
}

/** Perp-vs-spot basis, quoted three times a day: mean-reverting around a small
 *  premium, so the book spends time in contango and in backwardation, and a desk
 *  can enter while the basis is rich and unwind once it has converged. */
const basisSeries = (days: number, rand: Rand): number[] => {
    const series: number[] = []
    let basis = (rand() - 0.3) * 0.002
    for (let i = 0; i < days * 3; i++) {
        basis = basis * 0.94 + (rand() - 0.5) * 0.0018
        series.push(Number(basis.toFixed(6)))
    }
    return series
}

/** 8-hourly funding rate: zero-centred, sign-flipping, with occasional spikes. */
const fundingSeries = (days: number, rand: Rand): number[] => {
    const series: number[] = []
    let rate = (rand() - 0.4) * 0.0004
    for (let i = 0; i < days * 3; i++) {
        rate = rate * 0.97 + (rand() - 0.5) * 0.00006 // ≈0.007% per 8h, as on a calm book
        series.push(Number(rate.toFixed(6)))
    }
    return series
}

// Trading activity by simulated hour of day and weekday, derived from how far back
// the entry is rather than the wall clock, so the same account always produces the
// same history. Trades are busiest through the EU/US overlap and thin at weekends.
const HOUR_WEIGHT = [0.18, 0.14, 0.12, 0.12, 0.16, 0.25, 0.45, 0.7, 0.85, 0.6, 0.6, 0.75, 1, 1, 1, 0.95, 0.9, 0.85, 0.9, 0.85, 0.75, 0.6, 0.4, 0.26]
const activityWeight = (ageMs: number): number => {
    const hour = Math.floor((ageMs % DAY) / HOUR)
    const weekday = Math.floor(ageMs / DAY) % 7
    const weekend = weekday === 0 || weekday === 6 ? 0.45 : 1
    const season = 0.8 + 0.2 * Math.sin((ageMs / DAY) * 0.4) // slow busy/quiet stretches
    return (HOUR_WEIGHT[hour] ?? 0.5) * weekend * season
}

/** Poisson-ish inter-arrivals with an intraday/weekly/seasonal profile plus
 *  occasional bursts, instead of trades spaced perfectly evenly. */
const arrivalTimes = (count: number, days: number, rand: Rand, now: number): number[] => {
    const span = days * DAY
    const times: number[] = []
    let guard = count * 400
    while (times.length < count && guard-- > 0) {
        const age = rand() * span
        if (rand() > activityWeight(age)) continue
        const ts = now - age
        times.push(Math.round(ts))
        // Volatility clustering: a burst of follow-up trades minutes apart.
        const burst = rand() < 0.05 ? 1 + rInt(rand, 0, 3) : 0
        for (let b = 1; b <= burst && times.length < count; b++) times.push(Math.round(ts - b * (1 + rand() * 40) * 60_000))
    }
    while (times.length < count) times.push(Math.round(now - rand() * span))
    return times.sort((a, b) => a - b)
}

// ── Per-population context ──────────────────────────────────────────────────
type DemoContext = {
    username: string
    plan: DemoPlan
    rand: Rand
    /** ms timestamps of the spot round-trips, oldest first */
    arrivals: number[]
    tsAt: (daysAgo: number) => number
    /** spot price of `symbol` (lowercase; "usdc" is the quote and stays at 1) */
    priceAt: (symbol: string, ts: number) => number
    basisAt: (symbol: string, ts: number) => number
    /** funding paid (positive) or received (negative) on `notional` over a hold */
    fundingOver: (symbol: string, from: number, to: number, notional: number) => number
    /** symbol for entry #i — every base is guaranteed to appear at least once */
    symbolAt: (i: number, universe: readonly string[]) => string
    addressAt: (addresses: readonly string[]) => string
    pickPair: (pairs: readonly [string, string][], weights: readonly number[]) => [string, string]
}

const buildContext = (username: string, windowDays?: number): DemoContext => {
    const plan = demoPlan(windowDays ?? demoWindowDays())
    const rand = makeRand(username)
    const now = Date.now()

    const universe = [...new Set<string>([...DEMO_BASES.map((b) => b.toLowerCase()), ...SF_SYMBOLS, ...FR_SYMBOLS])]
    const prices: Record<string, number[]> = {}
    const bases: Record<string, number[]> = {}
    const fundings: Record<string, number[]> = {}
    for (const symbol of universe) {
        prices[symbol] = pricePath(refPrice(symbol), plan.windowDays, market(symbol).vol, rand)
        bases[symbol] = basisSeries(plan.windowDays, rand)
        fundings[symbol] = fundingSeries(plan.windowDays, rand)
    }
    const dayIndex = (ts: number) => clamp(plan.windowDays - Math.round((now - ts) / DAY), 0, plan.windowDays)
    // The basis and funding series are quoted every 8 hours, keyed by their slot —
    // an *age* rather than an absolute epoch, so an account's history does not
    // change as the clock moves.
    const slotIndex = (ts: number, length: number) => clamp(Math.round((now - ts) / EPOCH_8H), 0, length - 1)

    return {
        username,
        plan,
        rand,
        arrivals: arrivalTimes(plan.spotTrades, plan.windowDays, rand, now),
        tsAt: (daysAgo) => now - daysAgo * DAY,
        priceAt: (symbol, ts) => (symbol === "usdc" ? 1 : prices[symbol][dayIndex(ts)]),
        basisAt: (symbol, ts) => (symbol === "usdc" ? 0 : bases[symbol][slotIndex(ts, bases[symbol].length)]),
        fundingOver: (symbol, from, to, notional) => {
            const series = fundings[symbol]
            let total = 0
            // Walk the eight-hour epochs of the hold, oldest first, indexing by age.
            for (let age = now - to; age <= now - from; age += EPOCH_8H) total += series[Math.round(age / EPOCH_8H) % series.length] * notional
            return Number(total.toFixed(3))
        },
        symbolAt: (i, picks) => (i < picks.length ? picks[i] : weightedPick(rand, picks, picks.map((s) => market(s).weight))),
        addressAt: (addresses) => (addresses.length < 2 || rand() < 0.68 ? addresses[0] : weightedPick(rand, addresses.slice(1), addresses.slice(1).map(() => 1))),
        pickPair: (pairs, weights) => weightedPick(rand, pairs, weights),
    }
}

// ── Spot data (tx.db) ───────────────────────────────────────────────────────
const seedSpotDemoData = async (ctx: DemoContext, db: Database) => {
    const { username, plan, rand, arrivals } = ctx
    const addresses = [demoAddress(username, 0), demoAddress(username, 1)]

    // Accounts + dynamic symbol tables (created with the username column).
    for (const addr of addresses) await insertAddressIfNotExists(db, addr, username)
    for (const symbol of DEMO_SYMBOLS) await database_createNewTables(symbol.toLowerCase(), db)

    await inTransaction(db, async () => {
        // ── Arbitrage round-trips + typed (cex/dex) + per-symbol rows ────────
        // Each demo trade mirrors a CEX↔DEX arbitrage: both a cexId and a dexId
        // leg exist, so the profit aggregations (which require both legs) light up.
        const bases = DEMO_BASES.map((b) => b.toLowerCase())
        for (let i = 0; i < arrivals.length; i++) {
            const timestamp = arrivals[i]
            const address = ctx.addressAt(addresses)
            const base = ctx.symbolAt(i, bases)
            const cexId = demoId(username, "cex", i)
            const dexHash = demoId(username, "dex", i)

            await db.run(`INSERT OR IGNORE INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
                cexId,
                base.toUpperCase(),
                "USDC",
                username,
            ])
            await db.run(`INSERT OR IGNORE INTO dexTxs (txHash, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
                dexHash,
                base.toUpperCase(),
                "USDC",
                username,
            ])
            await db.run(`INSERT OR IGNORE INTO transactions (timestamp, address, cexId, dexId, username) VALUES (?, ?, ?, ?, ?)`, [
                timestamp,
                address,
                cexId,
                dexHash,
                username,
            ])

            // The profit follows the size of the ticket and the edge the route paid
            // off — more volatile pairs pay more — so it tracks the notional instead
            // of being drawn from a fixed band. A slice of routes lose money: the
            // price moved between legs before the arb got filled.
            const notional = rNum(rand, 5000, 120_000, 2)
            const edge = clamp((rNum(rand, 1.5, 38, 2) * market(base).vol) / 0.033, 0.8, 90) / 10_000
            const slipper = rand() < 0.18 ? -1 : 1
            const ratio = Number((edge * slipper).toFixed(6))
            const amount = Number((notional * ratio).toFixed(2))

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
            await db.run(`INSERT OR IGNORE INTO ${base}Txs (orderId, txHash, amount, ratio, username) VALUES (?, ?, ?, ?, ?)`, [
                cexId,
                dexHash,
                amount,
                ratio,
                username,
            ])
        }

        // ── Balance snapshots (spot charts) ──────────────────────────────────
        // Each wallet tracks its asset's price with damped exposure (a desk is long
        // its book), lives through real drawdowns, and sees the occasional deposit
        // or withdrawal re-shape the whole series.
        const balanceBase: Record<string, number> = { usdc: 8000, eth: 1.5, btc: 0.02, sol: 20, arb: 3000, wif: 4000, tia: 1200, tsla: 6, nvda: 30 }
        for (const [symbol, startAmount] of Object.entries(balanceBase)) {
            for (let a = 0; a < addresses.length; a++) {
                let holding = startAmount * (0.7 + rand() * 0.6)
                const exposure = 0.5 + rand() * 0.45 // partial beta to the asset
                let previous = ctx.priceAt(symbol, ctx.tsAt(plan.windowDays))
                for (let i = 0; i < plan.balanceSnapshots; i++) {
                    const timestamp = ctx.tsAt(plan.windowDays - i * 7)
                    const price = ctx.priceAt(symbol, timestamp)
                    const assetMove = previous > 0 ? price / previous - 1 : 0
                    previous = price
                    holding *= 1 + assetMove * exposure + (rand() - 0.49) * 0.04
                    if (rand() < 0.06) holding *= rNum(rand, 0.55, 1.6, 3) // deposit / withdrawal
                    holding = clamp(holding, startAmount * 0.2, startAmount * 8)
                    await db.run(
                        `INSERT OR IGNORE INTO ${symbol}Bal (timestamp, address, amount, username) VALUES (?, ?, ?, ?)`,
                        [timestamp, addresses[a], Number(holding.toFixed(6)), username],
                    )
                }
            }
        }
    })
}

// ── SpotFuture data (spotFuture.db) ─────────────────────────────────────────
const seedSpotFutureDemoData = async (ctx: DemoContext, db: Database) => {
    const { username, plan, rand } = ctx
    const address = demoAddress(username, 2)

    await insertAddressIfNotExists(db, address, username)

    // Idempotent DDL first, so every insert below can share a single transaction.
    for (const exchange of [...new Set(SF_EXCHANGE_PAIRS.flat())]) await spotFutureDatabase_createTablesIfNotExists(undefined, exchangeRef(exchange), db)
    for (const symbol of [...SF_SYMBOLS, "usdc"]) await spotFutureDatabase_createTablesIfNotExists(symbol, undefined, db)

    // legs run through one counter per account: transactions.{exchange}Id is
    // globally UNIQUE, and open and close legs are separate exchange orders.
    let leg = 0
    const legFill = async (exchange: string, symbol: string) => {
        const id = demoId(username, "sfx", leg++)
        await db.run(`INSERT OR IGNORE INTO ${exchange}Txs (id, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?)`, [
            id,
            symbol.toUpperCase(),
            "USDC",
            username,
        ])
        return id
    }

    /** Perp price sits on the spot path plus the basis of that moment. */
    const futureAt = (symbol: string, ts: number) => {
        const spot = ctx.priceAt(symbol, ts)
        return { spot: Number(spot.toPrecision(10)), future: Number((spot * (1 + ctx.basisAt(symbol, ts))).toPrecision(10)) }
    }

    await inTransaction(db, async () => {
        // ── Positions that are still open ────────────────────────────────────
        for (let i = 0; i < plan.spotFuture.open; i++) {
            const [ex1, ex2] = ctx.pickPair(SF_EXCHANGE_PAIRS, SF_PAIR_WEIGHTS)
            const symbol = ctx.symbolAt(i, SF_SYMBOLS)
            const [notionalLo, notionalHi] = market(symbol).notional
            const notional = rNum(rand, notionalLo, notionalHi, 2)
            const timestamp = ctx.tsAt(rInt(rand, 2, Math.max(3, Math.round(plan.windowDays * 0.4))))
            const { spot, future } = futureAt(symbol, timestamp)
            const qty = Number((notional / spot).toFixed(4))
            const openId = demoId(username, "sf-open", i)
            const ex1Id = await legFill(ex1, symbol)
            const ex2Id = await legFill(ex2, symbol)
            const fee = ((notional * (rNum(rand, 0.3, 1.2, 2) + rNum(rand, 0.3, 1.2, 2))) / 10_000).toFixed(3)
            // Funding keeps accruing while the hedge is on, so an open position
            // already carries a (signed) funding cost.
            const fundingFee = ctx.fundingOver(symbol, timestamp, ctx.tsAt(0), notional)

            await db.run(
                `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [openId, timestamp, address, ex1Id, ex2Id, qty, future, spot, Number(fee), fundingFee, username],
            )
            await db.run(`INSERT OR IGNORE INTO openedPositions (timestamp, openingId, username) VALUES (?, ?, ?)`, [timestamp, openId, username])
        }

        // ── Round-trips that were opened and closed (realised PnL) ───────────
        for (let i = 0; i < plan.spotFuture.closed; i++) {
            const [ex1, ex2] = ctx.pickPair(SF_EXCHANGE_PAIRS, SF_PAIR_WEIGHTS)
            const symbol = ctx.symbolAt(i, SF_SYMBOLS)
            const [notionalLo, notionalHi] = market(symbol).notional
            const notional = rNum(rand, notionalLo, notionalHi, 2)
            // The desk enters somewhere in the window and unwinds once the basis it
            // captured has narrowed — that is what makes this an arbitrage rather
            // than a coin flip. A slice of positions is cut early instead, and
            // those are the ones that realise a loss.
            const openAge = 2 + rand() * Math.max(1, plan.windowDays - 4)
            const holdDays = clamp(Math.exp(gauss(rand) * 0.7) * 9, 0.25, 30)
            const openTs = ctx.tsAt(openAge)
            const entryBasis = Math.abs(ctx.basisAt(symbol, openTs))
            const convergence = entryBasis * rNum(rand, 0.2, 0.65, 3)
            let closeTs = ctx.tsAt(Math.max(0.25, openAge - holdDays))
            if (rand() > 0.15) {
                const slots = Math.round(holdDays * 3)
                for (let slot = 1; slot <= slots; slot++) {
                    const candidate = openTs + slot * EPOCH_8H
                    if (candidate > ctx.tsAt(0) - EPOCH_8H) break
                    if (Math.abs(ctx.basisAt(symbol, candidate)) <= convergence) {
                        closeTs = candidate
                        break
                    }
                }
            }
            // Closed entries continue the id namespace of the still-open ones:
            // transactions.uuid is globally UNIQUE, so a fresh 0-based index here
            // would collide with the open book and be silently dropped.
            const entry = plan.spotFuture.open + i
            const openId = demoId(username, "sf-open", entry)
            const closeId = demoId(username, "sf-close", entry)
            const opened = futureAt(symbol, openTs)
            const closed = futureAt(symbol, closeTs)
            // The hedge size is kept, so both legs and both timestamps share it, and
            // the side follows the sign of the basis at entry (short the perp when it
            // is rich, long it when it is cheap).
            const qty = Number((notional / opened.spot).toFixed(4))
            const side = opened.future >= opened.spot ? 1 : -1
            const openFee = Number(((notional * (rNum(rand, 0.3, 1.2, 2) + rNum(rand, 0.3, 1.2, 2))) / 10_000).toFixed(3))
            const closeFee = Number(((notional * (rNum(rand, 0.3, 1.2, 2) + rNum(rand, 0.3, 1.2, 2))) / 10_000).toFixed(3))
            // The leg that is short a rich perp is the one collecting funding, so
            // the carry is an income while the basis stays positive — but the rate
            // can flip during the hold, and that is a real cost of the trade.
            const accrual = Math.abs(ctx.fundingOver(symbol, openTs, closeTs, notional))
            const settled = accrual * rNum(rand, 0.15, 1.0, 3)
            const fundingFee = Number((rand() < 0.12 ? settled : -side * settled).toFixed(3))
            // Realised PnL is the entry basis less the exit basis, minus the fees and
            // funding settled on the way — so the number on the row reconciles with
            // the prices stored next to it.
            const gross = qty * side * (opened.future - opened.spot - (closed.future - closed.spot))
            const profit = Number((gross - openFee - closeFee - fundingFee).toFixed(2))
            const ratio = Number(clamp(profit / notional, -0.05, 0.05).toFixed(6))

            const openEx1Id = await legFill(ex1, symbol)
            const openEx2Id = await legFill(ex2, symbol)
            const closeEx1Id = await legFill(ex1, symbol)
            const closeEx2Id = await legFill(ex2, symbol)

            await db.run(
                `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [openId, openTs, address, openEx1Id, openEx2Id, qty, opened.future, opened.spot, openFee, 0, username],
            )
            await db.run(
                `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [closeId, closeTs, address, closeEx1Id, closeEx2Id, qty, closed.future, closed.spot, closeFee, fundingFee, username],
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
                profit,
                ratio,
                username,
            ])
            // The profit aggregations read the QUOTE symbol's Txs table (usdcTxs)
            // joined by positionId — seed it too so closed-position profits render.
            await db.run(`INSERT OR IGNORE INTO usdcTxs (positionId, amount, ratio, username) VALUES (?, ?, ?, ?)`, [
                cp.id,
                profit,
                ratio,
                username,
            ])
        }
    })
}

// ── Funding-rate data (fRate.db) ────────────────────────────────────────────
const seedFundingRateDemoData = async (ctx: DemoContext, db: Database) => {
    const { username, plan, rand } = ctx
    const address = demoAddress(username, 3)

    await insertAddressIfNotExists(db, address, username)

    for (const exchange of [...new Set(FR_EXCHANGE_PAIRS.flat())]) await fundingRateDatabase_createTablesIfNotExists(undefined, exchangeRef(exchange), db)
    for (const symbol of [...FR_SYMBOLS, "usdc"]) await fundingRateDatabase_createTablesIfNotExists(symbol, undefined, db)

    let leg = 0
    const legFill = async (exchange: string, symbol: string, price: number, orderFee: number, fundingFee: number) => {
        const id = demoId(username, "frx", leg++)
        await db.run(
            `INSERT OR IGNORE INTO ${exchange}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, price, orderFee, fundingFee, symbol.toUpperCase(), "USDC", username],
        )
        return id
    }

    /** The two venues quote the same asset at slightly different marks. */
    const legPrices = (symbol: string, ts: number) => {
        const spot = ctx.priceAt(symbol, ts)
        const skew = ctx.basisAt(symbol, ts)
        return [Number((spot * (1 + skew / 2)).toPrecision(10)), Number((spot * (1 - skew / 2)).toPrecision(10))] as const
    }

    await inTransaction(db, async () => {
        // ── Positions that are still open ────────────────────────────────────
        for (let i = 0; i < plan.fundingRate.open; i++) {
            const [ex1, ex2] = ctx.pickPair(FR_EXCHANGE_PAIRS, FR_PAIR_WEIGHTS)
            const symbol = ctx.symbolAt(i, FR_SYMBOLS)
            const [notionalLo, notionalHi] = market(symbol).notional
            const notional = rNum(rand, notionalLo, notionalHi, 2)
            const timestamp = ctx.tsAt(rInt(rand, 2, Math.max(3, Math.round(plan.windowDays * 0.4))))
            const [price1, price2] = legPrices(symbol, timestamp)
            const openId = demoId(username, "fr-open", i)
            const ex1Id = await legFill(ex1, symbol, price1, Number(((notional * rNum(rand, 0.2, 0.8, 2)) / 10_000).toFixed(3)), 0)
            const ex2Id = await legFill(ex2, symbol, price2, Number(((notional * rNum(rand, 0.2, 0.8, 2)) / 10_000).toFixed(3)), 0)

            await db.run(
                `INSERT OR IGNORE INTO transactions (uuid, timestamp, address, ${ex1}Id, ${ex2}Id, qty, username) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [openId, timestamp, address, ex1Id, ex2Id, Number((notional / price1).toFixed(4)), username],
            )
            await db.run(`INSERT OR IGNORE INTO openedPositions (timestamp, openingId, username) VALUES (?, ?, ?)`, [timestamp, openId, username])
        }

        // ── Round-trips that were opened and closed (realised carry) ─────────
        for (let i = 0; i < plan.fundingRate.closed; i++) {
            const [ex1, ex2] = ctx.pickPair(FR_EXCHANGE_PAIRS, FR_PAIR_WEIGHTS)
            const symbol = ctx.symbolAt(i, FR_SYMBOLS)
            const [notionalLo, notionalHi] = market(symbol).notional
            const notional = rNum(rand, notionalLo, notionalHi, 2)
            // Carry needs time — funding accrues over the hold — so this book sits in
            // positions for days to weeks rather than hours.
            const closeAge = 1 + rand() * Math.max(1, plan.windowDays - 8)
            const holdDays = clamp(Math.exp(gauss(rand) * 0.8) * 6, 0.5, 45)
            const openAge = Math.min(plan.windowDays, closeAge + holdDays)
            const openTs = ctx.tsAt(openAge)
            const closeTs = ctx.tsAt(closeAge)
            // Closed entries continue the id namespace of the still-open ones:
            // transactions.uuid is globally UNIQUE, so a fresh 0-based index here
            // would collide with the open book and be silently dropped.
            const entry = plan.fundingRate.open + i
            const openId = demoId(username, "fr-open", entry)
            const closeId = demoId(username, "fr-close", entry)
            const [price1Open, price2Open] = legPrices(symbol, openTs)
            const [price1Close, price2Close] = legPrices(symbol, closeTs)
            const qty = Number((notional / price1Open).toFixed(4))
            // One leg pays funding and the other collects it. The desk routes the
            // trade to the venue paying the richer rate and hedges on the cheapest,
            // so it keeps most of the spread — but the two can invert, which is what
            // turns some of these into losers.
            const accrual = Math.abs(ctx.fundingOver(symbol, openTs, closeTs, notional))
            const received = Number((accrual * rNum(rand, 0.5, 1.8, 3)).toFixed(3))
            const paid = Number((accrual * rNum(rand, 0.05, 0.7, 3)).toFixed(3))
            const fee1 = Number(((notional * rNum(rand, 0.2, 0.8, 2)) / 10_000).toFixed(3))
            const fee2 = Number(((notional * rNum(rand, 0.2, 0.8, 2)) / 10_000).toFixed(3))
            const fee3 = Number(((notional * rNum(rand, 0.2, 0.8, 2)) / 10_000).toFixed(3))
            const fee4 = Number(((notional * rNum(rand, 0.2, 0.8, 2)) / 10_000).toFixed(3))
            const fees = Number((fee1 + fee2 + fee3 + fee4).toFixed(3))
            const delta = qty * (price1Close - price1Open) * (rand() - 0.5) * 0.01 // unhedged basis leak
            const profit = Number((received - paid - fees + delta).toFixed(2))
            const ratio = Number(clamp(profit / notional, -0.03, 0.03).toFixed(6))

            const openEx1Id = await legFill(ex1, symbol, price1Open, fee1, paid)
            const openEx2Id = await legFill(ex2, symbol, price2Open, fee2, -received)
            const closeEx1Id = await legFill(ex1, symbol, price1Close, fee3, 0)
            const closeEx2Id = await legFill(ex2, symbol, price2Close, fee4, 0)

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
                profit,
                ratio,
                username,
            ])
            // The profit aggregations read the QUOTE symbol's Txs table (usdcTxs)
            // joined by positionId — seed it too so closed-position profits render.
            await db.run(`INSERT OR IGNORE INTO usdcTxs (positionId, amount, ratio, username) VALUES (?, ?, ?, ?)`, [
                cp.id,
                profit,
                ratio,
                username,
            ])
        }
    })
}

// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Seed a full multi-year demo portfolio for `username`.
 *
 * `windowDays` overrides the history length (defaults to DEMO_WINDOW_DAYS, which
 * `DEMO_WINDOW_DAYS` in the environment can also raise or lower); tests pass a
 * short window so they don't pay for thousands of rows.
 */
export const populateDemoData = async (username: string, windowDays?: number) => {
    if (!database.db || !database.spotFutureDB || !database.fundingRateDB) throw new Error("Databases not initialized")
    const ctx = buildContext(username, windowDays)
    await seedSpotDemoData(ctx, database.db)
    await seedSpotFutureDemoData(ctx, database.spotFutureDB)
    await seedFundingRateDemoData(ctx, database.fundingRateDB)
    await database.db.run(`UPDATE users SET demo_populated = 1 WHERE username = ?`, [username])
}

// Rollback helper: delete every row owned by `username` in all three DBs plus
// the users-table entry (used when demo seeding fails partway through).
export const removeUserData = async (username: string) => {
    // Belt-and-braces: this deletes every row the account owns in all three
    // databases plus its `users` row, so it is the one function that must never
    // be pointed at a bootstrap account. Every current caller already filters
    // them out, but the blast radius is too large to rely on that alone.
    if (isReservedUsername(username)) throw new Error(`Refusing to delete the reserved account: ${username}`)
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

// ── Seeding an existing account exactly once ────────────────────────────────
// Single-flight: two concurrent sign-ins to the shared sample account must not
// both run the generator (that would double the rows and the request cost).
const demoSeedInFlight = new Map<string, Promise<void>>()

/**
 * Populates an account's demo data once. `populateDemoData` records
 * `demo_populated = 1` but never checks it, and parts of the generator use
 * generated ids, so a second run would duplicate rows — every caller goes
 * through here so the guard and the single-flight are in one place.
 */
export const ensureDemoPopulated = async (username: string, windowDays?: number): Promise<void> => {
    const record = await getUser(username)
    if (!record || record.demo_populated) return

    const inFlight = demoSeedInFlight.get(username)
    if (inFlight) return inFlight

    const run = populateDemoData(username, windowDays).finally(() => demoSeedInFlight.delete(username))
    demoSeedInFlight.set(username, run)
    return run
}
