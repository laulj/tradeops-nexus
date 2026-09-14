import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import sqlite3 from "sqlite3"
import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import type { Express } from "express"
import request from "supertest"
import { users } from "../index"

// ── Password / auth helpers ─────────────────────────────────────────────────
export const hashPassword = (password: string): number[] => Array.from(keccak256(utf8ToBytes(password)))

// The admin bootstrap account (seeded by ensureUsersTable).
export const ADMIN_PASSWORD = "demo123"

export const registerUser = async (app: Express, username: string, password: string, populateDemoData = false) => {
    const res = await request(app).post("/register").send({
        username,
        password: hashPassword(password),
        ...(populateDemoData ? { populateDemoData: true } : {}),
    })
    return { status: res.status, body: res.body as { accessToken?: string; username?: string; demoPopulated?: boolean } }
}

export const loginUser = async (app: Express, username: string, password: string) => {
    const res = await request(app).post("/login").send({ username, password: hashPassword(password) })
    return { status: res.status, body: res.body as { accessToken?: string } }
}

// ── Temp-DB environment ─────────────────────────────────────────────────────
export const makeTempDir = (): string => mkdtempSync(path.join(tmpdir(), "arb-backend-test-"))

export const setDbEnv = (dir: string) => {
    process.env.TX_DB_PATH = path.join(dir, "tx.db")
    process.env.SPOT_FUTURE_DB_PATH = path.join(dir, "spotFuture.db")
    process.env.FUNDING_RATE_DB_PATH = path.join(dir, "fRate.db")
    // Keep the demo seed small here: the production default is a three-year
    // history, which would make every request that registers a demo user slow.
    process.env.DEMO_WINDOW_DAYS = "120"
    // Pin the admin password so the tests neither depend on (nor leak) whatever
    // the developer's shell exports, and the production guard cannot fire.
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD
}

export const clearDbEnv = () => {
    for (const key of [
        "TX_DB_PATH",
        "SPOT_FUTURE_DB_PATH",
        "FUNDING_RATE_DB_PATH",
        "DEMO_WINDOW_DAYS",
        "ADMIN_PASSWORD",
        "DEMO_PASSWORD",
        "PLAYGROUND_TTL_MS",
        "MAX_PLAYGROUND_ACCOUNTS",
        "PLAYGROUND_ENABLED",
        "PLAYGROUND_WINDOW_DAYS",
        "PLAYGROUND_SWEEP_MS",
        "EGRESS_ENABLED",
        "EGRESS_WARN_GB",
        "EGRESS_DEGRADE_GB",
        "EGRESS_HARD_CEILING_GB",
        "EGRESS_BURST_GB_PER_HOUR",
        "EGRESS_OVERHEAD_FACTOR",
        "EGRESS_FLUSH_MS",
        "ALERT_WEBHOOK_URL",
        "ALERT_EMAIL_API_KEY",
        "ALERT_EMAIL_FROM",
        "ALERT_EMAIL_TO",
        "ALERT_EMAIL_PROVIDER",
        "ALERT_EMAIL_TEST_ON_BOOT",
        "ALERT_MAX_PER_RUN",
    ]) {
        delete process.env[key]
    }
}

/** Bandwidth-budget knobs; every one is read per call. */
export const setEgressEnv = (
    opts: {
        warnGb?: number
        degradeGb?: number
        ceilingGb?: number
        burstGbPerHour?: number
        overheadFactor?: number
        flushMs?: number
        enabled?: boolean
    } = {},
) => {
    if (opts.warnGb !== undefined) process.env.EGRESS_WARN_GB = String(opts.warnGb)
    if (opts.degradeGb !== undefined) process.env.EGRESS_DEGRADE_GB = String(opts.degradeGb)
    if (opts.ceilingGb !== undefined) process.env.EGRESS_HARD_CEILING_GB = String(opts.ceilingGb)
    if (opts.burstGbPerHour !== undefined) process.env.EGRESS_BURST_GB_PER_HOUR = String(opts.burstGbPerHour)
    if (opts.overheadFactor !== undefined) process.env.EGRESS_OVERHEAD_FACTOR = String(opts.overheadFactor)
    if (opts.flushMs !== undefined) process.env.EGRESS_FLUSH_MS = String(opts.flushMs)
    if (opts.enabled !== undefined) process.env.EGRESS_ENABLED = opts.enabled ? "1" : "0"
}

/** Alert-channel configuration. Empty strings count as "not configured". */
export const setAlertEnv = (
    opts: {
        webhookUrl?: string
        apiKey?: string
        from?: string
        to?: string
        provider?: string
        bootTest?: string
        maxPerRun?: number
    } = {},
) => {
    if (opts.webhookUrl !== undefined) process.env.ALERT_WEBHOOK_URL = opts.webhookUrl
    if (opts.apiKey !== undefined) process.env.ALERT_EMAIL_API_KEY = opts.apiKey
    if (opts.from !== undefined) process.env.ALERT_EMAIL_FROM = opts.from
    if (opts.to !== undefined) process.env.ALERT_EMAIL_TO = opts.to
    if (opts.provider !== undefined) process.env.ALERT_EMAIL_PROVIDER = opts.provider
    if (opts.bootTest !== undefined) process.env.ALERT_EMAIL_TEST_ON_BOOT = opts.bootTest
    if (opts.maxPerRun !== undefined) process.env.ALERT_MAX_PER_RUN = String(opts.maxPerRun)
}

/** Playground knobs, which are read per call so a test can change them mid-run. */
export const setPlaygroundEnv = (
    opts: { ttlMs?: number; max?: number; enabled?: boolean; windowDays?: number; sweepMs?: number } = {},
) => {
    if (opts.ttlMs !== undefined) process.env.PLAYGROUND_TTL_MS = String(opts.ttlMs)
    if (opts.max !== undefined) process.env.MAX_PLAYGROUND_ACCOUNTS = String(opts.max)
    if (opts.enabled !== undefined) process.env.PLAYGROUND_ENABLED = opts.enabled ? "1" : "0"
    if (opts.windowDays !== undefined) process.env.PLAYGROUND_WINDOW_DAYS = String(opts.windowDays)
    if (opts.sweepMs !== undefined) process.env.PLAYGROUND_SWEEP_MS = String(opts.sweepMs)
}

export const removeTempDir = (dir: string) => rmSync(dir, { recursive: true, force: true })

// Drop the in-memory session store between tests so tokens don't leak across.
export const resetUsers = () => {
    for (const key of Object.keys(users)) delete users[key]
}

// ── Direct sqlite assertions (against the temp DB files) ────────────────────
export const openDb = (filepath: string): Promise<sqlite3.Database> =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filepath, (err) => (err ? reject(err) : resolve(db)))
    })

export const query = (db: sqlite3.Database, sql: string, params: any[] = []): Promise<any[]> =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as any[])))
    })

export const countWhere = async (db: sqlite3.Database, table: string, username: string): Promise<number> => {
    const rows = await query(db, `SELECT COUNT(*) AS c FROM "${table}" WHERE username = ?`, [username])
    return Number(rows[0]?.c ?? 0)
}
