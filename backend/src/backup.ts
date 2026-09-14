import { createHash } from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { access, mkdir, rename, rm } from "fs/promises"
import path from "path"
import sqlite3 from "sqlite3"
import { maxRestoreMegabytes } from "./limits"

// ── Database snapshots and restore ──────────────────────────────────────────
// An admin can replace any of the three SQLite files from a backup without SSH:
// the upload is streamed to a staging file, verified, and only swapped in at the
// next start. Swapping while the app holds the file open is how SQLite databases
// get corrupted — and with a persistent disk the host already restarts on every
// deploy, so "stage now, apply at boot" costs nothing.

export const RESTORE_TARGET_ENV = {
    tx: "TX_DB_PATH",
    spotFuture: "SPOT_FUTURE_DB_PATH",
    fRate: "FUNDING_RATE_DB_PATH",
} as const

export type RestoreTarget = keyof typeof RESTORE_TARGET_ENV

const DEFAULT_PATHS: Record<RestoreTarget, string> = {
    tx: "./db/tx.db",
    spotFuture: "./db/spotFuture.db",
    fRate: "./db/fRate.db",
}

export const RESTORE_TARGETS = Object.keys(RESTORE_TARGET_ENV) as RestoreTarget[]

export const isRestoreTarget = (value: string): value is RestoreTarget =>
    (RESTORE_TARGETS as string[]).includes(value)

/**
 * Application tables a database must contain for a restore to be plausible.
 *
 * An integrity check only proves the upload is *a* SQLite database — it says
 * nothing about whether it is *this* database. Every router creates `transactions`
 * and `accounts` for all three targets, so requiring them rejects an unrelated
 * file (a browser profile, another application's export) that would otherwise be
 * swapped in and leave the API reading a schema it does not know.
 */
export const REQUIRED_TABLES: Record<RestoreTarget, readonly string[]> = {
    tx: ["transactions", "accounts"],
    spotFuture: ["transactions", "accounts"],
    fRate: ["transactions", "accounts"],
}

/** Required tables the inspected file is missing; empty means the shape matches. */
export const missingRequiredTables = (target: RestoreTarget, tables: readonly string[]): string[] => {
    const present = new Set(tables.map((t) => t.toLowerCase()))
    return REQUIRED_TABLES[target].filter((t) => !present.has(t.toLowerCase()))
}

/** Mirrors the resolution in middleware.ts, so a restore lands where the app reads. */
export const databasePathFor = (target: RestoreTarget): string =>
    process.env[RESTORE_TARGET_ENV[target]] || DEFAULT_PATHS[target]

export const backupDirFor = (target: RestoreTarget): string =>
    path.join(path.dirname(databasePathFor(target)), "backups")

/** Staging path for an uploaded file; `applyPendingRestores` consumes it. */
export const pendingPathFor = (target: RestoreTarget): string => `${databasePathFor(target)}.pending`

export const maxRestoreBytes = (): number => Math.floor(maxRestoreMegabytes() * 1024 * 1024)

export const snapshotPathFor = (target: RestoreTarget, at: number = Date.now()): string =>
    path.join(backupDirFor(target), `${target}-${new Date(at).toISOString().replace(/[:.]/g, "-")}.db`)

export interface SqliteInspection {
    /** SQLite's own verdict: "ok" when the file is consistent. */
    integrity: string
    /** Application tables (anything that is not an internal `sqlite_%` table). */
    tables: string[]
}

const openReadOnly = (filePath: string): Promise<sqlite3.Database> =>
    new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => (err ? reject(err) : resolve(db)))
    })

/** Opens the file read-only and reports SQLite's integrity verdict and its tables. */
export const inspectSqliteFile = async (filePath: string): Promise<SqliteInspection> => {
    const db = await openReadOnly(filePath)
    try {
        const integrity = await new Promise<string>((resolve, reject) => {
            db.get(`PRAGMA integrity_check`, (err, row: { integrity_check?: string }) =>
                err ? reject(err) : resolve(String(row?.integrity_check ?? "unknown")),
            )
        })
        const tables = await new Promise<string[]>((resolve, reject) => {
            db.all(
                `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
                (err, rows: { name: string }[]) => (err ? reject(err) : resolve((rows ?? []).map((row) => row.name))),
            )
        })
        return { integrity, tables }
    } finally {
        db.close()
    }
}

export const sha256File = (filePath: string): Promise<string> =>
    new Promise((resolve, reject) => {
        const hash = createHash("sha256")
        createReadStream(filePath)
            .on("data", (chunk) => hash.update(chunk))
            .on("error", reject)
            .on("end", () => resolve(hash.digest("hex")))
    })

export const exists = async (filePath: string): Promise<boolean> => {
    try {
        await access(filePath)
        return true
    } catch {
        return false
    }
}

export const ensureBackupDir = (target: RestoreTarget): Promise<void> =>
    mkdir(backupDirFor(target), { recursive: true }).then(() => undefined)

/**
 * A file together with the WAL sidecars SQLite creates beside it. Opening a file
 * (the integrity check does) can leave `<path>-wal`/`-shm` behind, so removing the
 * file alone leaves a stale pair that outlives the database it belonged to — and
 * makes a staging area look as if something is still pending.
 */
const withSidecars = (filePath: string): string[] => [filePath, `${filePath}-wal`, `${filePath}-shm`]

export const removeFile = async (filePath: string): Promise<void> => {
    await Promise.all(withSidecars(filePath).map((p) => rm(p, { force: true })))
}

/**
 * WAL keeps its state in `<db>-wal`/`<db>-shm` next to the database. Those files
 * belong to the database being replaced, and leaving them beside a different file
 * is exactly what SQLite reports as "btreeInitPage() returns error code 11".
 */
export const removeSidecars = async (target: RestoreTarget): Promise<void> => {
    const databasePath = databasePathFor(target)
    await Promise.all(["-wal", "-shm"].map((suffix) => removeFile(`${databasePath}${suffix}`)))
}

/**
 * Streams a request body straight to disk. Constant memory on purpose: a restore
 * can be hundreds of megabytes and this instance has 512 MB, so buffering it (or
 * using a body parser) would be the end of the process.
 */
export const stageUpload = (
    request: NodeJS.ReadableStream,
    filePath: string,
    maxBytes: number,
): Promise<{ bytes: number }> =>
    new Promise((resolve, reject) => {
        const out = createWriteStream(filePath)
        let bytes = 0
        let settled = false

        const fail = (err: unknown) => {
            if (settled) return
            settled = true
            out.destroy()
            reject(err)
        }

        request.on("data", (chunk: Buffer) => {
            bytes += chunk.length
            if (bytes > maxBytes) {
                // Stop writing to disk, but drain the rest instead of destroying the
                // socket: tearing the connection down would stop the 413 from ever
                // reaching the client.
                fail(Object.assign(new Error("Upload exceeds the restore size limit"), { code: "RESTORE_TOO_LARGE" }))
                ;(request as unknown as { resume?: () => void }).resume?.()
                return
            }
            out.write(chunk)
        })
        request.on("end", () =>
            out.end(() => {
                if (settled) return
                settled = true
                resolve({ bytes })
            }),
        )
        request.on("error", fail)
        out.on("error", fail)
    })

/**
 * Swaps staged files into place. Called once per process, before any database is
 * opened; a staged file that fails inspection is left alone and logged rather
 * than applied.
 */
export const applyPendingRestores = async (): Promise<RestoreTarget[]> => {
    const applied: RestoreTarget[] = []

    for (const target of RESTORE_TARGETS) {
        const pending = pendingPathFor(target)
        if (!(await exists(pending))) continue

        try {
            const inspection = await inspectSqliteFile(pending)
            if (inspection.integrity !== "ok" || inspection.tables.length === 0) {
                console.error(
                    `Refusing to apply ${path.basename(pending)} (integrity: ${inspection.integrity}, ${inspection.tables.length} tables)`,
                )
                continue
            }
            const missingTables = missingRequiredTables(target, inspection.tables)
            if (missingTables.length > 0) {
                console.error(`Refusing to apply ${path.basename(pending)} (missing tables: ${missingTables.join(", ")})`)
                continue
            }
            // Same directory, so the rename is atomic. The stale WAL sidecars have
            // to go with the database they belonged to.
            await rename(pending, databasePathFor(target))
            await removeSidecars(target)
            // The staged file's own sidecars die with it: the file has just been
            // renamed away, so anything named after it is now orphaned.
            await removeFile(pending)
            applied.push(target)
            console.log(`INFO -- restored the ${target} database from a staged file`)
        } catch (err) {
            console.error(`Failed to apply the staged ${target} database:`, err)
        }
    }

    return applied
}
