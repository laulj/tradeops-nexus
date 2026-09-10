import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import request from "supertest"
import { app } from "../index"
import { makeTempDir, removeTempDir, setDbEnv, clearDbEnv, resetUsers, registerUser, loginUser, hashPassword, ADMIN_PASSWORD } from "./helpers"

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

let seq = 0
const freshName = (): string => {
    seq += 1
    return `user${seq}`
}

describe("POST /register", () => {
    it("returns a token with sub=username", async () => {
        const name = freshName()
        const { status, body } = await registerUser(app, name, "secret1")
        expect(status).toBe(201)
        expect(body.username).toBe(name)
        expect(body.demoPopulated).toBe(false)
        expect(typeof body.accessToken).toBe("string")
        const payload = JSON.parse(Buffer.from(body.accessToken!.split(".")[1], "base64url"))
        expect(payload.sub).toBe(name)
    })

    it("rejects duplicate usernames with 409", async () => {
        const name = freshName()
        await registerUser(app, name, "secret1")
        const { status } = await registerUser(app, name, "secret2")
        expect(status).toBe(409)
    })

    it("rejects invalid usernames and missing passwords", async () => {
        const name = freshName()
        const short = await request(app).post("/register").send({ username: "ab", password: hashPassword("x") })
        expect(short.status).toBe(400)
        const badChars = await request(app).post("/register").send({ username: "bad name!", password: hashPassword("x") })
        expect(badChars.status).toBe(400)
        const missing = await request(app).post("/register").send({ username: name })
        expect(missing.status).toBe(400)
    })
})

describe("POST /login", () => {
    it("logs in with correct credentials", async () => {
        const name = freshName()
        await registerUser(app, name, "secret1")
        const { status, body } = await loginUser(app, name, "secret1")
        expect(status).toBe(200)
        expect(typeof body.accessToken).toBe("string")
    })

    it("rejects a wrong password with a JSON error", async () => {
        const name = freshName()
        await registerUser(app, name, "secret1")
        const { status, body } = await loginUser(app, name, "wrongpw")
        expect(status).toBe(400)
        expect(body.error).toBe("Incorrect password")
    })

    it("rejects an unknown username with 401 and a helpful error", async () => {
        // Never registered → the UI must be able to tell the user there is no account.
        const { status, body } = await loginUser(app, freshName(), "secret1")
        expect(status).toBe(401)
        expect(body.error).toBe("No account found for this username")
    })
})

describe("GET /logout", () => {
    it("invalidates the token", async () => {
        const { body } = await registerUser(app, freshName(), "secret1")
        const res = await request(app).get("/logout").set("Authorization", `Bearer ${body.accessToken}`)
        expect(res.status).toBe(201)
        const symbols = await request(app).get("/data/symbols").set("Authorization", `Bearer ${body.accessToken}`)
        expect(symbols.status).toBe(401)
    })
})

describe("unauthenticated access", () => {
    it("rejects requests without a token", async () => {
        const res = await request(app).get("/data/symbols")
        expect(res.status).toBe(401)
    })
})

describe("admin user management", () => {
    it("allows only admin to list users", async () => {
        const name = freshName()
        await registerUser(app, name, "secret1")
        const { body: adminBody } = await loginUser(app, "admin", ADMIN_PASSWORD)
        const list = await request(app).get("/users").set("Authorization", `Bearer ${adminBody.accessToken}`)
        expect(list.status).toBe(200)
        const names = (list.body.users as { username: string }[]).map((u) => u.username)
        expect(names).toContain(name)
        expect(names).toContain("admin")
    })

    it("forbids non-admin users from listing users", async () => {
        const { body } = await registerUser(app, freshName(), "secret1")
        const res = await request(app).get("/users").set("Authorization", `Bearer ${body.accessToken}`)
        expect(res.status).toBe(403)
    })
})
