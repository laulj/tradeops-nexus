// ── Manual, local, admin-only data migration ──────────────────────────────
// Merges the rows from the newer `*_latest.db` files into the working DBs:
//   tx_latest.db        → tx.db
//   spotFuture_latest.db→ spotFuture.db
//   fRate_latest.db     → fRate.db
//
// Run by an admin on the machine that owns the DB files (stop the server
// first so SQLite file locks are released):
//
//   pnpm --dir backend migrate:latest            # dry run (default)
//   pnpm --dir backend migrate:latest -- --apply # writes + safety copies
//   pnpm --dir backend migrate:latest -- --apply --only tx
//
// Uploading a database through the admin UI and triggering the migration on the
// server is intentionally out of scope for now.
/* eslint-disable no-console */
import fs from "fs"
import os from "os"
import path from "path"
import sqlite3 from "sqlite3"
import { database, migrateSpotDB, spotFuture_migrateFrom_oldDB, FR_migrateFrom_oldDB } from "../src/database"

type Key = "tx" | "spotFuture" | "fRate"

const PAIRS: Record<Key, { latest: string; current: string; run: (latest: string, current: string) => Promise<unknown> }> = {
    tx: { latest: "./db/tx_latest.db", current: "./db/tx.db", run: migrateSpotDB },
    spotFuture: {
        latest: "./db/spotFuture_latest.db",
        current: "./db/spotFuture.db",
        run: spotFuture_migrateFrom_oldDB,
    },
    fRate: { latest: "./db/fRate_latest.db", current: "./db/fRate.db", run: FR_migrateFrom_oldDB },
}

const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`)

// ── table row counts (independent sqlite3 connection) ──────────────────────
const tableCounts = (file: string): Promise<Record<string, number>> =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => {
            if (err) return reject(err)
            db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (e, rows: any[]) => {
                if (e) return reject(e)
                const counts: Record<string, number> = {}
                let pending = rows.length
                if (!pending) {
                    db.close()
                    return resolve(counts)
                }
                for (const { name } of rows) {
                    db.get(`SELECT COUNT(*) AS c FROM "${name}"`, (e2, row: any) => {
                        counts[name] = row ? row.c : 0
                        if (--pending === 0) {
                            db.close()
                            resolve(counts)
                        }
                    })
                }
            })
        })
    })

const reportDelta = async (label: string, before: Record<string, number>, after: Record<string, number>) => {
    const changed = Object.keys(after)
        .filter((t) => (after[t] ?? 0) !== (before[t] ?? 0) || !(t in before))
        .sort()
    let total = 0
    for (const t of changed) {
        const delta = (after[t] ?? 0) - (before[t] ?? 0)
        total += delta
        console.log(`  ${delta >= 0 ? "+" : ""}${delta}${label}:${t}  (${before[t] ?? 0} → ${after[t] ?? 0})`)
    }
    console.log(`  ${label}: ${changed.length} table(s) changed, ${total >= 0 ? "+" : ""}${total} row(s) total`)
}

const safetyCopy = (file: string) => {
    if (!fs.existsSync(file)) return undefined
    const backup = `${file}.premigration-backup`
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
    return backup
}

const runPair = async (key: Key, apply: boolean, latestOverride?: string, currentOverride?: string) => {
    const pair = PAIRS[key]
    const latest = latestOverride ?? pair.latest
    const current = currentOverride ?? pair.current
    console.log(`\n── ${key}: ${latest} → ${current} ${apply ? "[APPLY]" : "[DRY RUN]"}`)
    for (const f of [latest, current]) if (!fs.existsSync(f)) throw new Error(`missing file: ${f}`)

    if (!apply) {
        // Work on throwaway copies so the dry run cannot touch the real files.
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `nexus-migrate-${key}-`))
        const tmpLatest = path.join(tmp, path.basename(latest))
        const tmpCurrent = path.join(tmp, path.basename(current))
        fs.copyFileSync(latest, tmpLatest)
        fs.copyFileSync(current, tmpCurrent)
        const before = await tableCounts(tmpCurrent)
        await pair.run(tmpLatest, tmpCurrent)
        const after = await tableCounts(tmpCurrent)
        await reportDelta(key, before, after)
        fs.rmSync(tmp, { recursive: true, force: true })
        console.log("  dry run complete — nothing written (temp copies discarded)")
        return
    }

    const latestBackup = safetyCopy(latest)
    const currentBackup = safetyCopy(current)
    if (latestBackup) console.log(`  safety copy: ${latestBackup}`)
    if (currentBackup) console.log(`  safety copy: ${currentBackup}`)
    const before = await tableCounts(current)
    await pair.run(latest, current)
    const after = await tableCounts(current)
    await reportDelta(key, before, after)
}

;(async () => {
    const apply = hasFlag("apply")
    const only = (arg("only") ?? "tx,spotFuture,fRate")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as Key[]
    const oldOverride = arg("old")
    const newOverride = arg("new")
    if ((oldOverride || newOverride) && only.length !== 1)
        throw new Error("--old/--new can only be used together with a single --only <name>")

    console.log(`Nexus DB migration — ${apply ? "APPLY" : "DRY RUN"} (${only.join(", ")})`)
    for (const key of only) {
        if (!PAIRS[key]) throw new Error(`unknown --only value: ${key}`)
        await runPair(key, apply, oldOverride, newOverride)
    }
    console.log("\nAll done.")
})().catch(async (err) => {
    console.error("migrate-latest-dbs failed:", err)
    process.exitCode = 1
}).finally(async () => {
    // Release the lazily-opened global handles so the process can exit.
    try {
        await database.closeDB()
    } catch {
        /* already closed by the migrator */
    }
    setTimeout(() => process.exit(process.exitCode ?? 0), 50)
})
