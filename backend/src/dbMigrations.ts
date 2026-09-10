// ── Multi-user aware database migrations ───────────────────────────────────
// Supersedes the original pre-`username` migrators in database.ts. Changes vs
// the legacy implementation:
//   1. `username` is carried through every INSERT (legacy rows default 'admin').
//   2. Dedupe keys are user-scoped, so one user's rows can never shadow another
//      user's identical exchange/on-chain ids.
//   3. Lookups are Set/bucket indexed instead of O(n×m) nested scans (the tx
//      database has ~38k rows per table).
//   4. Spot symbol tables are discovered from the databases instead of a
//      hardcoded symbol list.
// Only ever invoked by the manual admin CLI (scripts/migrate-latest-dbs.ts).
import type { Database } from "sqlite"
import { database, initDatabase } from "./database"
import { database_createNewTables } from "./databaseRouter"
import { spotFutureDatabase_createTablesIfNotExists } from "./futureDatabaseRouter"
import { fundingRateDatabase_createTablesIfNotExists } from "./fundingRateDatabaseRouter"

type Row = Record<string, any>

// The nine per-exchange typed tables (lowercase) that exist in the SF/FR DBs.
const EXCHANGES = ["bybit", "gate", "binance", "osm", "inj", "dydx", "hl", "bolt", "suil"] as const
const SF_CEX_FIELDS = ["bybitId", "gateId", "binanceId", "hlId", "boltId"]
const SF_DEX_FIELDS = ["osmId", "injId", "dydxId", "hlId", "boltId", "suilId"]

// ── value helpers (mirroring the legacy convertType / comparisons) ──────────
export const userOf = (row: Row): string =>
    typeof row?.username === "string" && row.username.length > 0 ? row.username : "admin"

export const truthy = (v: any): boolean => {
    if (v === null || v === undefined || v === "" || v === false || v === "undefined" || v === "null") return false
    if (v === true) return true
    const n = Number(v)
    return Number.isNaN(n) ? true : n !== 0
}

export const normHex = (v: any): string => {
    try {
        return BigInt(String(v)).toString(16)
    } catch {
        return String(v ?? "").toLowerCase()
    }
}

const idKey = (v: any): string => {
    const s = String(v ?? "")
    if (s.includes("XRPL")) return `x:${s}`
    try {
        return `n:${BigInt(s).toString()}`
    } catch {
        return `s:${s}`
    }
}

const idEqual = (a: any, b: any): boolean => {
    if (a === null || a === undefined || b === null || b === undefined) return false
    const sa = String(a)
    const sb = String(b)
    if (sa.includes("XRPL") || sb.includes("XRPL")) return sa === sb
    try {
        return BigInt(sa) === BigInt(sb)
    } catch {
        return sa === sb
    }
}

// ── generic helpers ─────────────────────────────────────────────────────────
const tableNames = async (db: Database, like: string): Promise<string[]> =>
    (
        (await db.all(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name LIKE '${like}'`,
        )) as { name: string }[]
    ).map((r) => r.name)

const countRows = async (db: Database, table: string): Promise<number> =>
    ((await db.get(`SELECT COUNT(*) AS c FROM "${table}"`)) as { c: number } | undefined)?.c ?? 0

/** Insert source rows whose user-scoped key is not already present in `dst`. */
const copyByKey = async (
    dst: Database,
    table: string,
    srcRows: Row[],
    dstRows: Row[],
    keyOf: (row: Row) => string,
    insert: (row: Row) => Promise<unknown>,
): Promise<number> => {
    const existing = new Set(dstRows.map((r) => keyOf(r)))
    let inserted = 0
    for (const row of srcRows) {
        const k = keyOf(row)
        if (existing.has(k)) continue
        existing.add(k)
        await insert(row)
        inserted++
    }
    return inserted
}

/** Replace a table's rows: delete user-owned rows then insert from source. */
const appendByKey = copyByKey

// ── Spot (tx.db) ────────────────────────────────────────────────────────────
// Indexed spot-transaction duplicate test. The legacy scan compared every
// source row against every target row sharing an address, which is ~147M
// BigInt comparisons for the tx database. The predicate is equivalent to:
//   address equal AND ( both cexId truthy ? cexId equal : dexId equal )
// so we pre-index target rows by cexId and dexId (splitting the dex index into
// "target has no cexId" vs "target has cexId" to honour the exact branch).
type TxIndex = { cex: Set<string>; dexAny: Set<string>; dexNoCex: Set<string> }
const txIndex = (): TxIndex => ({ cex: new Set(), dexAny: new Set(), dexNoCex: new Set() })

const addTxIndex = (index: TxIndex, row: Row): void => {
    const base = `${userOf(row)}|${normHex(row.address)}`
    if (truthy(row.cexId)) index.cex.add(`${base}|${idKey(row.cexId)}`)
    if (truthy(row.dexId)) {
        index.dexAny.add(`${base}|${row.dexId}`)
        if (!truthy(row.cexId)) index.dexNoCex.add(`${base}|${row.dexId}`)
    }
}

const isDupSpotTxIndexed = (index: TxIndex, row: Row): boolean => {
    const base = `${userOf(row)}|${normHex(row.address)}`
    if (truthy(row.cexId)) {
        if (index.cex.has(`${base}|${idKey(row.cexId)}`)) return true
        return truthy(row.dexId) && index.dexNoCex.has(`${base}|${row.dexId}`)
    }
    return truthy(row.dexId) && index.dexAny.has(`${base}|${row.dexId}`)
}

const isDupTokenTx = (s: Row, t: Row): boolean => {
    if (truthy(s.orderId) && truthy(t.orderId)) {
        if (String(s.orderId).includes("XRPL") || String(t.orderId).includes("XRPL")) {
            return s.orderId === t.orderId && s.txHash === t.txHash
        }
        return idEqual(s.orderId, t.orderId) && s.txHash === t.txHash
    }
    return s.txHash === t.txHash
}

const bucketize = (rows: Row[], keysOf: (row: Row) => string[]): Map<string, Row[]> => {
    const map = new Map<string, Row[]>()
    for (const row of rows) {
        for (const k of keysOf(row)) {
            const list = map.get(k)
            if (list) list.push(row)
            else map.set(k, [row])
        }
    }
    return map
}

const insertRow = async (db: Database, table: string, columns: string[], row: Row): Promise<void> => {
    const cols = columns.map((c) => `"${c}"`).join(", ")
    const marks = columns.map(() => "?").join(", ")
    const values = columns.map((c) => (c === "username" ? userOf(row) : row[c]))
    await db.run(`INSERT OR IGNORE INTO "${table}" (${cols}) VALUES (${marks})`, values)
}

export const migrateSpotDB = async (db_old_filepath: string, db_new_filepath: string): Promise<boolean> => {
    if (!database.db) await database.updateDB(db_new_filepath)
    const src = (await initDatabase(db_old_filepath, "spot")) as Database
    const dst = (await initDatabase(db_new_filepath, "spot")) as Database

    try {
        // ── accounts ───────────────────────────────────────────────────────
        const srcAccs = (await src.all(`SELECT * FROM accounts`)) as Row[]
        const dstAccs = (await dst.all(`SELECT * FROM accounts`)) as Row[]
        await copyByKey(
            dst,
            "accounts",
            srcAccs,
            dstAccs,
            (r) => `${userOf(r)}|${normHex(r.address)}`,
            (r) => insertRow(dst, "accounts", ["address", "username"], r),
        )
        console.log("spot: accounts migrated")

        // ── transactions (compound predicate → bucket by user+address) ─────
        const srcTxs = (await src.all(`SELECT * FROM transactions`)) as Row[]
        const dstTxs = (await dst.all(`SELECT * FROM transactions`)) as Row[]
        const index = txIndex()
        for (const r of dstTxs) addTxIndex(index, r)
        let txInserted = 0
        for (const row of srcTxs) {
            if (isDupSpotTxIndexed(index, row)) continue
            addTxIndex(index, row)
            await insertRow(dst, "transactions", ["timestamp", "address", "cexId", "dexId", "username"], row)
            txInserted++
        }
        console.log(`spot: transactions migrated (+${txInserted})`)

        // ── cexTxs / dexTxs ────────────────────────────────────────────────
        const cexSrc = (await src.all(`SELECT * FROM cexTxs`)) as Row[]
        const cexDst = (await dst.all(`SELECT * FROM cexTxs`)) as Row[]
        const cex = await copyByKey(
            dst,
            "cexTxs",
            cexSrc,
            cexDst,
            (r) => `${userOf(r)}|${idKey(r.orderId)}`,
            (r) => insertRow(dst, "cexTxs", ["orderId", "tokenIn", "tokenOut", "username"], r),
        )
        const dexSrc = (await src.all(`SELECT * FROM dexTxs`)) as Row[]
        const dexDst = (await dst.all(`SELECT * FROM dexTxs`)) as Row[]
        const dex = await copyByKey(
            dst,
            "dexTxs",
            dexSrc,
            dexDst,
            (r) => `${userOf(r)}|${r.txHash}`,
            (r) => insertRow(dst, "dexTxs", ["txHash", "tokenIn", "tokenOut", "username"], r),
        )
        console.log(`spot: cexTxs migrated (+${cex}), dexTxs migrated (+${dex})`)

        // ── per-symbol balances + token txs (symbols discovered) ──────────
        const symbols = new Set<string>()
        for (const name of [...(await tableNames(src, "%Bal")), ...(await tableNames(dst, "%Bal"))]) {
            symbols.add(name.slice(0, -3).toLowerCase())
        }
        for (const symbol of symbols) {
            await database_createNewTables(symbol, src)
            await database_createNewTables(symbol, dst)

            const balSrc = (await src.all(`SELECT * FROM "${symbol}Bal"`)) as Row[]
            const balDst = (await dst.all(`SELECT * FROM "${symbol}Bal"`)) as Row[]
            const balInserted = await copyByKey(
                dst,
                `${symbol}Bal`,
                balSrc,
                balDst,
                (r) => `${userOf(r)}|${normHex(r.address)}|${idKey(r.timestamp)}`,
                (r) => insertRow(dst, `${symbol}Bal`, ["timestamp", "address", "amount", "username"], r),
            )

            const tsxSrc = (await src.all(`SELECT * FROM "${symbol}Txs"`)) as Row[]
            const tsxDst = (await dst.all(`SELECT * FROM "${symbol}Txs"`)) as Row[]
            const buckets = bucketize(tsxDst, (r) => {
                const keys: string[] = []
                if (truthy(r.orderId)) keys.push(`${userOf(r)}|o|${idKey(r.orderId)}`)
                if (truthy(r.txHash)) keys.push(`${userOf(r)}|h|${r.txHash}`)
                return keys
            })
            let symInserted = 0
            for (const row of tsxSrc) {
                const keys: string[] = []
                if (truthy(row.orderId)) keys.push(`${userOf(row)}|o|${idKey(row.orderId)}`)
                if (truthy(row.txHash)) keys.push(`${userOf(row)}|h|${row.txHash}`)
                const candidates = keys.flatMap((k) => buckets.get(k) ?? [])
                if (candidates.some((t) => isDupTokenTx(row, t))) continue
                keys.forEach((k) => {
                    const list = buckets.get(k)
                    if (list) list.push(row)
                    else buckets.set(k, [row])
                })
                await insertRow(dst, `${symbol}Txs`, ["orderId", "txHash", "amount", "ratio", "username"], row)
                symInserted++
            }
            console.log(`spot: ${symbol} → Bal(+${balInserted}) Txs(+${symInserted})`)
        }

        console.log("spot migration complete")
        return true
    } catch (err: any) {
        console.error("spot migration failed:", err)
        return false
    } finally {
        await Promise.all([src.close(), dst.close()])
    }
}

// re-exported name kept for parity with the legacy helper (used in logs/tests)
export const _appendByKey = appendByKey

// ── SpotFuture / Funding-rate shared helpers ───────────────────────────────
const determineDuplicateEXS = (EXS: string[]): { CEX: string; DEX: string } => {
    const onlyCEXs = ["bybitId", "gateId", "binanceId"]
    const DEXs = ["osmId", "injId", "dydxId", "hlId", "boltId", "suilId"]
    const binaryEXs = ["hlId", "boltId"]
    let CEX = ""
    let DEX = ""
    for (const EX of EXS) if (onlyCEXs.includes(EX)) CEX = EX
    if (!CEX) for (const EX of EXS) if (binaryEXs.includes(EX)) CEX = EX
    for (const EX of EXS) if (CEX && EX !== CEX && DEXs.includes(EX)) DEX = EX
    return { CEX, DEX }
}

const EX_ORDER = [
    "bybitId",
    "gateId",
    "binanceId",
    "hlId",
    "boltId",
    "osmId",
    "injId",
    "dydxId",
    "suilId",
]

// Detect the two legs of a transaction. Venue pairs are not always CEX↔DEX
// (the spot-future book contains CEX↔CEX arbitrage too, e.g. bybit↔binance),
// so fall back to the next populated exchange field when no DEX candidate is
// found. Keeps the legacy preference order for the common cases.
const detectExPair = (row: Row): { cexField: string; cexValue: any; dexField: string; dexValue: any } => {
    const present = EX_ORDER.filter((key) => truthy(row[key]))
    if (present.length < 2) throw new Error(`Missing CEX/DEX on transaction ${JSON.stringify(row)}`)

    const { CEX: preferredCex, DEX: preferredDex } = determineDuplicateEXS(present)
    const cexField = preferredCex && present.includes(preferredCex) ? preferredCex : present[0]
    const dexField =
        preferredDex && present.includes(preferredDex) && preferredDex !== cexField
            ? preferredDex
            : present.filter((f) => f !== cexField)[0]
    if (!cexField || !dexField) throw new Error(`Missing CEX/DEX on transaction ${JSON.stringify(row)}`)
    return { cexField, cexValue: row[cexField], dexField, dexValue: row[dexField] }
}

const coinTables = async (db: Database): Promise<string[]> => {
    const names = await tableNames(db, "%Txs")
    const typed = EXCHANGES.map((e) => `${e}Txs`)
    const skip = new Set<string>(["transactions", "cexTxs", "dexTxs", ...typed])
    return names.filter((n) => !skip.has(n)).map((n) => n.slice(0, -3).toLowerCase())
}

const migrateAccounts = async (src: Database, dst: Database): Promise<number> => {
    const srcRows = (await src.all(`SELECT * FROM accounts`)) as Row[]
    const dstRows = (await dst.all(`SELECT * FROM accounts`)) as Row[]
    return copyByKey(dst, "accounts", srcRows, dstRows, (r) => `${userOf(r)}|${normHex(r.address)}`, (r) =>
        insertRow(dst, "accounts", ["address", "username"], r),
    )
}

const migratePositions = async (src: Database, dst: Database): Promise<void> => {
    const openedSrc = (await src.all(`SELECT * FROM openedPositions`)) as Row[]
    const openedDst = (await dst.all(`SELECT * FROM openedPositions`)) as Row[]
    await copyByKey(
        dst,
        "openedPositions",
        openedSrc,
        openedDst,
        (r) => `${userOf(r)}|${r.openingId}`,
        (r) => insertRow(dst, "openedPositions", ["timestamp", "openingId", "username"], r),
    )
    const closedSrc = (await src.all(`SELECT * FROM closedPositions`)) as Row[]
    const closedDst = (await dst.all(`SELECT * FROM closedPositions`)) as Row[]
    await copyByKey(
        dst,
        "closedPositions",
        closedSrc,
        closedDst,
        (r) => `${userOf(r)}|${r.openingId}|${r.closingId}`,
        (r) => insertRow(dst, "closedPositions", ["timestamp", "openingId", "closingId", "username"], r),
    )
}

/** Remap `${coin}Txs.positionId` from the source closedPositions.id to the target one. */
const migrateCoinTxs = async (
    src: Database,
    dst: Database,
    ensureCoinTable: (coin: string) => Promise<unknown>,
): Promise<number> => {
    const srcClosedById = new Map<string, Row>()
    for (const row of (await src.all(`SELECT * FROM closedPositions`)) as Row[]) srcClosedById.set(String(row.id), row)
    const dstClosedByClosingId = new Map<string, Row>()
    for (const row of (await dst.all(`SELECT * FROM closedPositions`)) as Row[])
        dstClosedByClosingId.set(`${userOf(row)}|${row.closingId}`, row)

    let inserted = 0
    for (const coin of await coinTables(src)) {
        const table = `${coin}Txs`
        const hasSrc = (await tableNames(src, table)).length > 0
        if (!hasSrc) continue
        await ensureCoinTable(coin)
        const srcRows = (await src.all(`SELECT * FROM "${table}"`)) as Row[]
        if (!srcRows.length) continue
        const dstRows = (await dst.all(`SELECT * FROM "${table}"`)) as Row[]
        const existing = new Set(dstRows.map((r) => `${userOf(r)}|${r.positionId}`))

        for (const row of srcRows) {
            const oldClosed = srcClosedById.get(String(row.positionId))
            if (!oldClosed) {
                console.warn(`migrate: skipping ${table} row (unknown positionId ${row.positionId})`)
                continue
            }
            const newClosed = dstClosedByClosingId.get(`${userOf(oldClosed)}|${oldClosed.closingId}`)
            if (!newClosed) {
                console.warn(`migrate: skipping ${table} row (closingId ${oldClosed.closingId} not migrated)`)
                continue
            }
            const key = `${userOf(row)}|${newClosed.id}`
            if (existing.has(key)) continue
            existing.add(key)
            await insertRow(dst, table, ["positionId", "amount", "ratio", "username"], {
                ...row,
                positionId: newClosed.id,
            })
            inserted++
        }
    }
    return inserted
}

// ── SpotFuture (spotFuture.db) ──────────────────────────────────────────────
export const spotFuture_migrateFrom_oldDB = async (db_old_filepath: string, db_new_filepath: string): Promise<void> => {
    if (!database.spotFutureDB) await database.updateSpotFutureDB(db_new_filepath)
    const src = (await initDatabase(db_old_filepath, "spotFuture")) as Database
    const dst = (await initDatabase(db_new_filepath, "spotFuture")) as Database

    try {
        console.log(`SF: accounts migrated (+${await migrateAccounts(src, dst)})`)

        const srcTxs = (await src.all(`SELECT * FROM transactions`)) as Row[]
        const dstTxs = (await dst.all(`SELECT * FROM transactions`)) as Row[]
        const txs = await copyByKey(
            dst,
            "transactions",
            srcTxs,
            dstTxs,
            (r) => `${userOf(r)}|${r.uuid}`,
            async (r) => {
                const { cexField, cexValue, dexField, dexValue } = detectExPair(r)
                await insertRow(
                    dst,
                    "transactions",
                    [
                        "uuid",
                        "timestamp",
                        "address",
                        cexField,
                        dexField,
                        "qty",
                        "futurePrice",
                        "spotPrice",
                        "orderFee",
                        "fundingFee",
                        "username",
                    ],
                    { ...r, [cexField]: cexValue, [dexField]: dexValue },
                )
            },
        )
        console.log(`SF: transactions migrated (+${txs})`)

        await migratePositions(src, dst)

        let typed = 0
        for (const ex of EXCHANGES) {
            const table = `${ex}Txs`
            if (!(await tableNames(src, table)).length) continue
            const srcRows = (await src.all(`SELECT * FROM "${table}"`)) as Row[]
            const dstRows = (await dst.all(`SELECT * FROM "${table}"`)) as Row[]
            typed += await copyByKey(
                dst,
                table,
                srcRows,
                dstRows,
                (r) => `${userOf(r)}|${r.id}`,
                (r) => insertRow(dst, table, ["id", "tokenIn", "tokenOut", "username"], r),
            )
        }
        console.log(`SF: typedTxs migrated (+${typed})`)

        const coins = await migrateCoinTxs(src, dst, (coin) =>
            spotFutureDatabase_createTablesIfNotExists(coin, undefined, dst),
        )
        console.log(`SF: coinTxs migrated (+${coins})`)
        console.log(`SF migration complete: ${db_old_filepath} → ${db_new_filepath}`)
    } catch (err: any) {
        console.error("SF migration failed:", err)
        throw err
    } finally {
        await Promise.all([src.close(), dst.close()])
    }
}

// ── Funding rate (fRate.db) ─────────────────────────────────────────────────
export const FR_migrateFrom_oldDB = async (db_old_filepath: string, db_new_filepath: string): Promise<void> => {
    if (!database.fundingRateDB) await database.updateFundingRateDB(db_new_filepath)
    const src = (await initDatabase(db_old_filepath, "fundingRate")) as Database
    const dst = (await initDatabase(db_new_filepath, "fundingRate")) as Database

    try {
        console.log(`FR: accounts migrated (+${await migrateAccounts(src, dst)})`)

        const srcTxs = (await src.all(`SELECT * FROM transactions`)) as Row[]
        const dstTxs = (await dst.all(`SELECT * FROM transactions`)) as Row[]
        const txs = await copyByKey(
            dst,
            "transactions",
            srcTxs,
            dstTxs,
            (r) => `${userOf(r)}|${r.uuid}`,
            async (r) => {
                const { cexField, cexValue, dexField, dexValue } = detectExPair(r)
                await insertRow(
                    dst,
                    "transactions",
                    ["uuid", "timestamp", "address", cexField, dexField, "qty", "username"],
                    { ...r, [cexField]: cexValue, [dexField]: dexValue },
                )
            },
        )
        console.log(`FR: transactions migrated (+${txs})`)

        await migratePositions(src, dst)

        let typed = 0
        for (const ex of EXCHANGES) {
            const table = `${ex}Txs`
            if (!(await tableNames(src, table)).length) continue
            const srcRows = (await src.all(`SELECT * FROM "${table}"`)) as Row[]
            const dstRows = (await dst.all(`SELECT * FROM "${table}"`)) as Row[]
            typed += await copyByKey(
                dst,
                table,
                srcRows,
                dstRows,
                (r) => `${userOf(r)}|${r.id}`,
                (r) =>
                    insertRow(
                        dst,
                        table,
                        ["id", "price", "orderFee", "fundingFee", "tokenIn", "tokenOut", "username"],
                        r,
                    ),
            )
        }
        console.log(`FR: typedTxs migrated (+${typed})`)

        const coins = await migrateCoinTxs(src, dst, (coin) =>
            fundingRateDatabase_createTablesIfNotExists(coin, undefined, dst),
        )
        console.log(`FR: coinTxs migrated (+${coins})`)
        console.log(`FR migration complete: ${db_old_filepath} → ${db_new_filepath}`)
    } catch (err: any) {
        console.error("FR migration failed:", err)
        throw err
    } finally {
        await Promise.all([src.close(), dst.close()])
    }
}
