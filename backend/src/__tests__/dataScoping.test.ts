import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { app } from "../index"
import { makeTempDir, removeTempDir, setDbEnv, clearDbEnv, resetUsers, registerUser, loginUser, ADMIN_PASSWORD } from "./helpers"
import { DEMO_SYMBOLS } from "../demoData"

let dir: string

beforeAll(() => {
    dir = makeTempDir()
    setDbEnv(dir)
})

afterAll(() => {
    clearDbEnv()
    removeTempDir(dir)
})

beforeEach(() => {
    resetUsers()
})

describe("demo data scoping", () => {
    it("a demo user sees the seeded symbols and addresses", async () => {
        const { body } = await registerUser(app, "demouser", "pw1", true)
        const syms = await request(app).get("/data/symbols").set("Authorization", `Bearer ${body.accessToken}`)
        expect(syms.status).toBe(200)
        // The demo account is seeded with every DEMO_SYMBOLS venue row.
        expect(syms.body.symbols.sort()).toEqual([...DEMO_SYMBOLS].sort())
        const addrs = await request(app).get("/data/addresses").set("Authorization", `Bearer ${body.accessToken}`)
        expect(addrs.body.addresses).toHaveLength(4)
    })

    it("a plain user has no data", async () => {
        const { body } = await registerUser(app, "plain", "pw1")
        const syms = await request(app).get("/data/symbols").set("Authorization", `Bearer ${body.accessToken}`)
        expect(syms.body.symbols).toEqual([])
    })

    it("admin stays isolated from a demo user's data", async () => {
        await registerUser(app, "demouser", "pw1", true)
        const { body: adminBody } = await loginUser(app, "admin", ADMIN_PASSWORD)
        const syms = await request(app).get("/data/symbols").set("Authorization", `Bearer ${adminBody.accessToken}`)
        expect(syms.body.symbols).toEqual([]) // fresh DB: admin owns no spot rows
        const addrs = await request(app).get("/data/addresses").set("Authorization", `Bearer ${adminBody.accessToken}`)
        expect(addrs.body.addresses).toEqual([])
    })

    it("two demo users get distinct addresses", async () => {
        const a = await registerUser(app, "demoA", "pw1", true)
        const b = await registerUser(app, "demoB", "pw1", true)
        const addrsA = await request(app).get("/data/addresses").set("Authorization", `Bearer ${a.body.accessToken}`)
        const addrsB = await request(app).get("/data/addresses").set("Authorization", `Bearer ${b.body.accessToken}`)
        const overlap = addrsA.body.addresses.filter((x: string) => addrsB.body.addresses.includes(x))
        expect(overlap).toEqual([])
    })

    it("admin can delete a user and their data; stale token stops working", async () => {
        const { body } = await registerUser(app, "victim", "pw1", true)
        const { body: adminBody } = await loginUser(app, "admin", ADMIN_PASSWORD)

        const del = await request(app).delete(`/users/victim`).set("Authorization", `Bearer ${adminBody.accessToken}`)
        expect(del.status).toBe(200)

        const stale = await request(app).get("/data/symbols").set("Authorization", `Bearer ${body.accessToken}`)
        expect(stale.status).toBe(401)

        const delAdmin = await request(app).delete(`/users/admin`).set("Authorization", `Bearer ${adminBody.accessToken}`)
        expect(delAdmin.status).toBe(400)
    })
})

// ── Admin-only raw database export ─────────────────────────────────────────
// The export routes must (a) reject non-admins and (b) serve the database at the
// configured *_DB_PATH rather than a hardcoded <backend>/db file.
const sqliteBinaryParser = (res: any, cb: (err: Error | null, body?: Buffer) => void) => {
    res.setEncoding("binary")
    let data = ""
    res.on("data", (chunk: string) => (data += chunk))
    res.on("end", () => cb(null, Buffer.from(data, "binary")))
}

describe("admin-only database export", () => {
    it("forbids non-admins from exporting any database", async () => {
        const { body } = await registerUser(app, "exporter", "pw1")
        for (const route of ["/data/export", "/data/spotFuture/export", "/data/fRate/export"]) {
            const res = await request(app).post(route).set("Authorization", `Bearer ${body.accessToken}`)
            expect(res.status, route).toBe(403)
        }
    })

    it("serves the admin the database at TX_DB_PATH, not a hardcoded path", async () => {
        const { body } = await loginUser(app, "admin", ADMIN_PASSWORD)
        const res = await request(app)
            .post("/data/export")
            .set("Authorization", `Bearer ${body.accessToken}`)
            .buffer(true)
            .parse(sqliteBinaryParser)
        expect(res.status).toBe(201)
        expect(String(res.headers["content-disposition"])).toContain("tx.db")
        // SQLite magic header: proves the temp-dir DB (TX_DB_PATH) is what was sent.
        expect((res.body as Buffer).subarray(0, 15).toString("utf8")).toBe("SQLite format 3")
    })
})
