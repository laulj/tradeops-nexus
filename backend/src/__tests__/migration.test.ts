import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import sqlite3 from "sqlite3"
import { database, migrateSpotDB, spotFuture_migrateFrom_oldDB, FR_migrateFrom_oldDB } from "../database"

// ── helpers ────────────────────────────────────────────────────────────────
const dirs: string[] = []
const tmpDir = (): string => {
    const d = mkdtempSync(path.join(tmpdir(), "nexus-mig-"))
    dirs.push(d)
    return d
}

const exec = (file: string, statements: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, (err) => {
            if (err) return reject(err)
            db.exec(statements.join("\n"), (e) => {
                db.close()
                e ? reject(e) : resolve()
            })
        })
    })

const all = (file: string, sql: string): Promise<any[]> =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err)
            db.all(sql, (e, rows) => {
                db.close()
                e ? reject(e) : resolve(rows as any[])
            })
        })
    })

const count = async (file: string, table: string, where = ""): Promise<number> => {
    const rows = await all(file, `SELECT COUNT(*) AS c FROM "${table}"${where ? ` WHERE ${where}` : ""}`)
    return rows[0].c as number
}

afterEach(async () => {
    try {
        await database.closeDB()
    } catch {
        /* handles may already be closed by the migrator */
    }
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

// ── spot (tx.db) ───────────────────────────────────────────────────────────
const spotSchema = (withUsername: boolean): string[] => {
    const u = withUsername ? ", username TEXT NOT NULL DEFAULT 'admin'" : ""
    return [
        `CREATE TABLE accounts (address TEXT UNIQUE${u});`,
        `CREATE TABLE transactions (timestamp TEXT NOT NULL, address TEXT NOT NULL, cexId TEXT UNIQUE, dexId TEXT UNIQUE${u});`,
        `CREATE TABLE cexTxs (orderId TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL${u});`,
        `CREATE TABLE dexTxs (txHash TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL${u});`,
        `CREATE TABLE zzzBal (timestamp TEXT NOT NULL, address TEXT NOT NULL, amount REAL NOT NULL${u});`,
        `CREATE TABLE zzzTxs (orderId TEXT UNIQUE, txHash TEXT UNIQUE, amount REAL NOT NULL, ratio REAL NOT NULL${u});`,
    ]
}

describe("migrateSpotDB", () => {
    it("migrates new rows and keeps per-user ownership (same cexId for two users)", async () => {
        const dir = tmpDir()
        const src = path.join(dir, "tx_latest.db")
        const dst = path.join(dir, "tx.db")

        await exec(src, [
            ...spotSchema(true),
            `INSERT INTO accounts (address, username) VALUES ('0xA', 'admin'), ('0xB', 'user1');`,
            `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES ('1','0xA','111',NULL,'admin'), ('2','0xA','222',NULL,'admin'), ('3','0xB','333',NULL,'user1');`,
            `INSERT INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES ('111','ETH','USDC','admin'), ('222','BTC','USDC','admin'), ('333','SOL','USDC','user1');`,
            `INSERT INTO dexTxs (txHash, tokenIn, tokenOut, username) VALUES ('aaa','ETH','USDC','admin');`,
            `INSERT INTO zzzBal (timestamp, address, amount, username) VALUES ('1000','0xA',5,'admin'), ('1000','0xA',7,'user1');`,
            `INSERT INTO zzzTxs (orderId, txHash, amount, ratio, username) VALUES ('111','aaa',1,0.1,'admin'), ('222',NULL,2,0.2,'admin');`,
        ])
        await exec(dst, [
            ...spotSchema(true),
            `INSERT INTO accounts (address, username) VALUES ('0xA', 'admin');`,
            `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES ('1','0xA','111',NULL,'admin');`,
            `INSERT INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES ('111','ETH','USDC','admin');`,
            `INSERT INTO zzzBal (timestamp, address, amount, username) VALUES ('1000','0xA',5,'admin');`,
            `INSERT INTO zzzTxs (orderId, txHash, amount, ratio, username) VALUES ('111','aaa',1,0.1,'admin');`,
        ])

        expect(await migrateSpotDB(src, dst)).toBe(true)

        // admin: existing + new; user1: only their own row survives
        expect(await count(dst, "transactions", "username='admin'")).toBe(2)
        expect(await count(dst, "transactions", "username='user1'")).toBe(1)
        expect(await count(dst, "cexTxs", "username='admin'")).toBe(2)
        expect(await count(dst, "cexTxs", "username='user1'")).toBe(1)
        expect(await count(dst, "dexTxs", "username='admin'")).toBe(1)
        // dynamic symbol tables (zzz not in the legacy hardcoded list)
        expect(await count(dst, "zzzBal", "username='admin'")).toBe(1)
        expect(await count(dst, "zzzBal", "username='user1'")).toBe(1)
        expect(await count(dst, "zzzTxs", "username='admin'")).toBe(2)
        expect(await count(dst, "accounts")).toBe(2)
    })

    it("is idempotent", async () => {
        const dir = tmpDir()
        const src = path.join(dir, "tx_latest.db")
        const dst = path.join(dir, "tx.db")
        await exec(src, [
            ...spotSchema(true),
            `INSERT INTO accounts (address, username) VALUES ('0xA','admin');`,
            `INSERT INTO transactions (timestamp, address, cexId, dexId, username) VALUES ('1','0xA','111',NULL,'admin');`,
            `INSERT INTO cexTxs (orderId, tokenIn, tokenOut, username) VALUES ('111','ETH','USDC','admin');`,
        ])
        await exec(dst, [...spotSchema(true)])

        await migrateSpotDB(src, dst)
        const afterFirst = await count(dst, "cexTxs")
        await migrateSpotDB(src, dst)
        expect(await count(dst, "cexTxs")).toBe(afterFirst)
        expect(afterFirst).toBe(1)
    })

    it("attributes legacy rows (pre-username schema) to admin", async () => {
        const dir = tmpDir()
        const src = path.join(dir, "tx_latest.db")
        const dst = path.join(dir, "tx.db")
        await exec(src, [
            ...spotSchema(false),
            `INSERT INTO accounts (address) VALUES ('0XA');`,
            `INSERT INTO transactions (timestamp, address, cexId, dexId) VALUES ('1','0XA','111',NULL);`,
            `INSERT INTO cexTxs (orderId, tokenIn, tokenOut) VALUES ('111','ETH','USDC');`,
        ])
        await exec(dst, [...spotSchema(true)])

        await migrateSpotDB(src, dst)
        expect(await count(dst, "accounts", "username='admin'")).toBe(1)
        expect(await count(dst, "cexTxs", "username='admin'")).toBe(1)
    })
})

// ── spotFuture ─────────────────────────────────────────────────────────────
const sfSchema = (withUsername: boolean): string[] => {
    const u = withUsername ? ", username TEXT NOT NULL DEFAULT 'admin'" : ""
    return [
        `CREATE TABLE accounts (address TEXT UNIQUE${u});`,
        `CREATE TABLE transactions (uuid TEXT UNIQUE NOT NULL, timestamp TEXT NOT NULL, address TEXT NOT NULL, bybitId TEXT UNIQUE, binanceId TEXT UNIQUE, qty REAL NOT NULL, futurePrice REAL NOT NULL, spotPrice REAL NOT NULL, orderFee REAL NOT NULL, fundingFee REAL NOT NULL${u});`,
        `CREATE TABLE openedPositions (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, openingId TEXT UNIQUE NOT NULL${u});`,
        `CREATE TABLE closedPositions (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, openingId TEXT UNIQUE NOT NULL, closingId TEXT UNIQUE NOT NULL${u});`,
        `CREATE TABLE bybitTxs (id TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL${u});`,
        `CREATE TABLE binanceTxs (id TEXT UNIQUE, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL${u});`,
        `CREATE TABLE usdcTxs (positionId INTEGER, amount REAL NOT NULL, ratio REAL NOT NULL${u});`,
    ]
}

describe("spotFuture_migrateFrom_oldDB", () => {
    it("migrates positions, typed txs and remapped coin profits with username", async () => {
        const dir = tmpDir()
        const src = path.join(dir, "spotFuture_latest.db")
        const dst = path.join(dir, "spotFuture.db")
        await exec(src, [
            ...sfSchema(true),
            `INSERT INTO accounts (address, username) VALUES ('0xS','admin');`,
            `INSERT INTO transactions (uuid, timestamp, address, bybitId, binanceId, qty, futurePrice, spotPrice, orderFee, fundingFee, username) VALUES ('U1','1','0xS','B1','BN1',1,2,1,0.1,0.2,'admin');`,
            `INSERT INTO openedPositions (id, timestamp, openingId, username) VALUES (1,'1','O1','admin');`,
            `INSERT INTO closedPositions (id, timestamp, openingId, closingId, username) VALUES (1,'2','O1','C1','admin');`,
            `INSERT INTO bybitTxs (id, tokenIn, tokenOut, username) VALUES ('B1','ETH','USDC','admin');`,
            `INSERT INTO binanceTxs (id, tokenIn, tokenOut, username) VALUES ('BN1','ETH','USDC','admin');`,
            `INSERT INTO usdcTxs (positionId, amount, ratio, username) VALUES (1,5,0.1,'admin');`,
        ])
        await exec(dst, [...sfSchema(true)])

        await spotFuture_migrateFrom_oldDB(src, dst)

        expect(await count(dst, "transactions", "username='admin'")).toBe(1)
        const tx = (await all(dst, `SELECT * FROM transactions`))[0]
        expect(tx.uuid).toBe("U1")
        expect(tx.username).toBe("admin")
        expect(tx.bybitId).toBe("B1")
        expect(tx.binanceId).toBe("BN1")
        expect(await count(dst, "openedPositions", "username='admin'")).toBe(1)
        const closed = (await all(dst, `SELECT * FROM closedPositions`))[0]
        expect(closed.username).toBe("admin")
        expect(await count(dst, "bybitTxs", "username='admin'")).toBe(1)
        const coin = (await all(dst, `SELECT * FROM usdcTxs`))[0]
        expect(coin.username).toBe("admin")
        expect(Number(coin.positionId)).toBe(Number(closed.id))
    })
})

// ── funding rate ───────────────────────────────────────────────────────────
const frSchema = (withUsername: boolean): string[] => {
    const u = withUsername ? ", username TEXT NOT NULL DEFAULT 'admin'" : ""
    return [
        `CREATE TABLE accounts (address TEXT UNIQUE${u});`,
        `CREATE TABLE transactions (uuid TEXT UNIQUE NOT NULL, timestamp TEXT NOT NULL, address TEXT NOT NULL, bybitId TEXT UNIQUE, gateId TEXT UNIQUE, qty REAL NOT NULL${u});`,
        `CREATE TABLE openedPositions (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, openingId TEXT UNIQUE NOT NULL${u});`,
        `CREATE TABLE closedPositions (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, openingId TEXT UNIQUE NOT NULL, closingId TEXT UNIQUE NOT NULL${u});`,
        `CREATE TABLE bybitTxs (id TEXT UNIQUE, price REAL NOT NULL, orderFee REAL NOT NULL, fundingFee REAL NOT NULL, tokenIn TEXT NOT NULL, tokenOut TEXT NOT NULL${u});`,
        `CREATE TABLE ethTxs (positionId INTEGER, amount REAL NOT NULL, ratio REAL NOT NULL${u});`,
    ]
}

describe("FR_migrateFrom_oldDB", () => {
    it("migrates FR transactions, typed txs (with funding fields) and coin profits", async () => {
        const dir = tmpDir()
        const src = path.join(dir, "fRate_latest.db")
        const dst = path.join(dir, "fRate.db")
        await exec(src, [
            ...frSchema(true),
            `INSERT INTO accounts (address, username) VALUES ('0xF','admin');`,
            `INSERT INTO transactions (uuid, timestamp, address, bybitId, gateId, qty, username) VALUES ('U2','1','0xF','B2','G2',1,'admin');`,
            `INSERT INTO openedPositions (id, timestamp, openingId, username) VALUES (1,'1','O2','admin');`,
            `INSERT INTO closedPositions (id, timestamp, openingId, closingId, username) VALUES (1,'2','O2','C2','admin');`,
            `INSERT INTO bybitTxs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES ('B2',3400,0.3,0.12,'ETH','USDC','admin');`,
            `INSERT INTO ethTxs (positionId, amount, ratio, username) VALUES (1,7,0.05,'admin');`,
        ])
        await exec(dst, [...frSchema(true)])

        await FR_migrateFrom_oldDB(src, dst)

        expect(await count(dst, "transactions", "username='admin'")).toBe(1)
        const typed = (await all(dst, `SELECT * FROM bybitTxs`))[0]
        expect(typed.username).toBe("admin")
        expect(Number(typed.price)).toBe(3400)
        expect(Number(typed.fundingFee)).toBeCloseTo(0.12)
        const closed = (await all(dst, `SELECT * FROM closedPositions`))[0]
        const coin = (await all(dst, `SELECT * FROM ethTxs`))[0]
        expect(coin.username).toBe("admin")
        expect(Number(coin.positionId)).toBe(Number(closed.id))
    })
})
