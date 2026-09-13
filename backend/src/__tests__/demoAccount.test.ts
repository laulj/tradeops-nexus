import path from "path"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { app } from "../index"
import { DEMO_USERNAME } from "../credentials"
import {
    clearDbEnv,
    countWhere,
    loginUser,
    makeTempDir,
    openDb,
    query,
    registerUser,
    removeTempDir,
    resetUsers,
    setDbEnv,
} from "./helpers"

// `userDemo` is the account the README advertises, so it must exist on a clean
// checkout — but its dataset is generated rather than committed. These tests pin
// the contract: present but empty, populated once on first sign-in, never
// duplicated, never claimable through /register, and never privileged.

let dir: string

beforeEach(() => {
    dir = makeTempDir()
    setDbEnv(dir)
    resetUsers()
})

afterEach(() => {
    clearDbEnv()
    removeTempDir(dir)
})

const txPath = () => path.join(dir, "tx.db")

describe("the shared sample account", () => {
    it("exists on a fresh database but holds no rows yet", async () => {
        // Any request runs initMiddleware -> initDatabase -> ensureUsersTable.
        await loginUser(app, "nobody", "pw")

        const tx = await openDb(txPath())
        const rows = await query(tx, `SELECT username, demo_populated FROM users ORDER BY username`)
        expect(rows).toEqual([
            { username: "admin", demo_populated: 0 },
            { username: DEMO_USERNAME, demo_populated: 0 },
        ])
        expect(await countWhere(tx, "transactions", DEMO_USERNAME)).toBe(0)
        tx.close()
    })

    it("generates its dataset on the first sign-in", async () => {
        const { status } = await loginUser(app, DEMO_USERNAME, "demo123")
        expect(status).toBe(200)

        const tx = await openDb(txPath())
        expect(await countWhere(tx, "transactions", DEMO_USERNAME)).toBeGreaterThan(0)
        const [row] = await query(tx, `SELECT demo_populated FROM users WHERE username = ?`, [DEMO_USERNAME])
        expect(Number(row.demo_populated)).toBe(1)
        tx.close()
    })

    it("does not duplicate rows when signing in again", async () => {
        await loginUser(app, DEMO_USERNAME, "demo123")
        const first = await openDb(txPath())
        const afterFirstLogin = await countWhere(first, "transactions", DEMO_USERNAME)
        first.close()
        expect(afterFirstLogin).toBeGreaterThan(0)

        // Fresh in-memory session, same database: the guard, not the session
        // cache, is what has to hold.
        resetUsers()
        await loginUser(app, DEMO_USERNAME, "demo123")

        const second = await openDb(txPath())
        expect(await countWhere(second, "transactions", DEMO_USERNAME)).toBe(afterFirstLogin)
        second.close()
    })

    it("cannot be claimed through /register", async () => {
        const exact = await registerUser(app, DEMO_USERNAME, "hunter2")
        expect(exact.status).toBe(400)
        expect((exact.body as { error?: string }).error).toMatch(/reserved/i)

        // Case variants would be separate rows while reading as the same account.
        expect((await registerUser(app, "userdemo", "hunter2")).status).toBe(400)
        expect((await registerUser(app, "Admin", "hunter2")).status).toBe(400)
    })

    it("carries no admin rights", async () => {
        const { body } = await loginUser(app, DEMO_USERNAME, "demo123")
        const res = await request(app).get("/users").set("Authorization", `Bearer ${body.accessToken}`)

        expect(res.status).toBe(403)
    })
})
