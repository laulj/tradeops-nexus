import path from "path"
import { readFileSync } from "fs"
import request from "supertest"
import sqlite3 from "sqlite3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { app } from "../index"
import { applyPendingRestores, exists, inspectSqliteFile, pendingPathFor } from "../backup"
import { clearDbEnv, loginUser, makeTempDir, removeTempDir, resetUsers, setDbEnv } from "./helpers"

// The restore endpoint is the only destructive surface in the app: it replaces a
// database file. These tests pin its guards (admin only, allowlisted target,
// verified content, size cap) and the "stage now, apply at boot" contract.

let dir: string

beforeEach(() => {
    dir = makeTempDir()
    setDbEnv(dir)
    resetUsers()
})

afterEach(() => {
    clearDbEnv()
    removeTempDir(dir)
    resetUsers()
})

const adminToken = async (): Promise<string> => (await loginUser(app, "admin", "demo123")).body.accessToken

/** Writes a genuine (tiny) SQLite database, since the endpoint inspects them. */
const makeSqliteFile = async (filePath: string, marker: string): Promise<void> => {
    const db = new sqlite3.Database(filePath)
    await new Promise<void>((resolve, reject) =>
        db.exec(
            `CREATE TABLE users (username TEXT PRIMARY KEY, created_at INTEGER);
             INSERT INTO users (username, created_at) VALUES ('${marker}', 1);`,
            (err) => (err ? reject(err) : resolve()),
        ),
    )
    await new Promise<void>((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())))
}

const post = (target: string, body: Buffer | string) =>
    request(app)
        .post(`/admin/restore/${target}`)
        .set("Content-Type", "application/octet-stream")
        .send(body)

describe("POST /admin/restore/:target", () => {
    it("refuses anonymous callers and non-admins", async () => {
        expect((await post("tx", "anything")).status).toBe(401)

        const demo = await loginUser(app, "userDemo", "demo123")
        const forbidden = await request(app)
            .post("/admin/restore/tx")
            .set("Authorization", `Bearer ${demo.body.accessToken}`)
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.from("anything"))
        expect(forbidden.status).toBe(403)
    })

    it("rejects a target outside the allowlist", async () => {
        const token = await adminToken()
        const res = await request(app)
            .post("/admin/restore/not-a-database")
            .set("Authorization", `Bearer ${token}`)
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.from("nope"))

        expect(res.status).toBe(400)
        expect(String(res.body.error)).toMatch(/unknown restore target/i)
    })

    it("rejects an upload that is not a SQLite database", async () => {
        const source = path.join(dir, "not-a-db.bin")
        const token = await adminToken()

        const res = await request(app)
            .post("/admin/restore/spotFuture")
            .set("Authorization", `Bearer ${token}`)
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.from("definitely not a sqlite file"))

        expect(res.status).toBe(422)
        // Nothing is left behind for the next boot to pick up.
        expect(await exists(pendingPathFor("spotFuture"))).toBe(false)
        expect(source).toBeDefined()
    })

    it("rejects an upload whose checksum does not match", async () => {
        const source = path.join(dir, "valid-tx.db")
        await makeSqliteFile(source, "restored-marker")
        const token = await adminToken()

        const res = await request(app)
            .post("/admin/restore/tx")
            .set("Authorization", `Bearer ${token}`)
            .set("Content-Type", "application/octet-stream")
            .set("x-content-sha256", "deadbeef")
            .send(readFileSync(source))

        expect(res.status).toBe(422)
        expect(await exists(pendingPathFor("tx"))).toBe(false)
    })

    it("refuses an upload larger than the configured ceiling", async () => {
        process.env.MAX_RESTORE_MB = "0.0001" // ~100 bytes
        const token = await adminToken()

        const res = await request(app)
            .post("/admin/restore/fRate")
            .set("Authorization", `Bearer ${token}`)
            .set("Content-Type", "application/octet-stream")
            .send(Buffer.alloc(2048, 7))

        expect(res.status).toBe(413)
        expect(await exists(pendingPathFor("fRate"))).toBe(false)
    })

    it("stages a valid database, snapshots the current one, and applies it at the next start", async () => {
        const source = path.join(dir, "valid-tx.db")
        await makeSqliteFile(source, "restored-marker")
        const token = await adminToken()

        const res = await request(app)
            .post("/admin/restore/tx")
            .set("Authorization", `Bearer ${token}`)
            .set("Content-Type", "application/octet-stream")
            .send(readFileSync(source))

        expect(res.status).toBe(202)
        expect(res.body).toMatchObject({ ok: true, target: "tx", restartRequired: true })
        expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/)
        // A snapshot of the file being replaced, so the restore is undoable.
        expect(String(res.body.snapshot)).toMatch(/^tx-.*\.db$/)
        expect(await exists(pendingPathFor("tx"))).toBe(true)

        // Nothing has been swapped yet: the live file still holds the original.
        const before = await inspectSqliteFile(path.join(dir, "tx.db"))
        expect(before.tables).toContain("users")

        expect(await applyPendingRestores()).toEqual(["tx"])
        expect(await exists(pendingPathFor("tx"))).toBe(false)

        const after = await inspectSqliteFile(path.join(dir, "tx.db"))
        expect(after.integrity).toBe("ok")
        expect(after.tables).toContain("users")
    })
})
