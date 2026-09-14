import { afterEach, describe, expect, it, vi } from "vitest"
import path from "path"
import { clearDbEnv, makeTempDir, removeTempDir, setDbEnv } from "./helpers"
import { database } from "../database"
import { initMiddleware } from "../middleware"

const req = {} as any
const res = {} as any
const noop = () => {}

let dirs: string[] = []

const freshDir = () => {
    const dir = makeTempDir()
    dirs.push(dir)
    return dir
}

afterEach(async () => {
    await database.closeDB()
    for (const dir of dirs) removeTempDir(dir)
    dirs = []
    clearDbEnv()
    vi.restoreAllMocks()
})

describe("initMiddleware", () => {
    it("opens one set of connections however many requests arrive", async () => {
        setDbEnv(freshDir())
        let passed = 0

        await initMiddleware(req, res, () => passed++)
        const first = database.db
        await initMiddleware(req, res, () => passed++)

        expect(passed).toBe(2)
        expect(database.db).toBe(first) // the same connection, not a second one
    })

    // The reason the duplicate-column race existed: a first page load fires
    // several requests at once, and each of them opened the databases again.
    it("opens them once when the requests arrive together", async () => {
        setDbEnv(freshDir())
        const spy = vi.spyOn(database, "updateDB")

        await Promise.all([
            initMiddleware(req, res, noop),
            initMiddleware(req, res, noop),
            initMiddleware(req, res, noop),
        ])

        expect(spy).toHaveBeenCalledTimes(1)
        expect(await database.db!.all(`SELECT 1 AS ok`)).toEqual([{ ok: 1 }])
    })

    // Guards the tests that point the *_DB_PATH variables at a new temp directory
    // per case: a memo that ignored the paths would keep serving the old file.
    it("re-initializes when the configured paths change, releasing the old file", async () => {
        const first = freshDir()
        setDbEnv(first)
        await initMiddleware(req, res, noop)
        const firstConnection = database.db!

        const second = freshDir()
        setDbEnv(second)
        await initMiddleware(req, res, noop)

        expect(database.db).not.toBe(firstConnection)
        const [opened] = (await database.db!.all(`PRAGMA database_list`)) as { file: string }[]
        expect(opened.file).toBe(path.join(second, "tx.db"))
        await expect(firstConnection.all(`SELECT 1`)).rejects.toThrow()
    })

    it("retries after a failed initialization instead of caching the failure", async () => {
        setDbEnv(freshDir())
        const spy = vi.spyOn(database, "updateDB").mockRejectedValueOnce(new Error("disk on fire"))

        await expect(initMiddleware(req, res, noop)).rejects.toThrow("disk on fire")
        await initMiddleware(req, res, noop)

        expect(spy.mock.calls.length).toBeGreaterThan(1)
        expect(await database.db!.all(`SELECT 1 AS ok`)).toEqual([{ ok: 1 }])
    })
})
