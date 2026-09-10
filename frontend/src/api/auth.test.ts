import { afterEach, describe, expect, it, vi } from "vitest"
import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import { getUsernameFromToken, login, logout, register } from "@/api/auth"

const jsonResponse = (body: unknown, status = 200, ok = status >= 200 && status < 300): Response =>
    ({
        ok,
        status,
        json: vi.fn().mockResolvedValue(body),
        headers: { get: vi.fn(() => (body && typeof body === "object" && "error" in body ? "application/json" : "text/plain")) },
    }) as unknown as Response

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("login", () => {
    it("returns the response body on success and hashes the password", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: "tok" }))
        vi.stubGlobal("fetch", fetchMock)

        await expect(login("admin", "demo123")).resolves.toEqual({ ok: true, accessToken: "tok" })

        const [url, config] = fetchMock.mock.calls[0]
        expect(url).toBe("/login")
        expect(config.method).toBe("POST")
        const body = JSON.parse(config.body)
        expect(body.username).toBe("admin")
        // password must be hashed (keccak), never sent in plaintext
        expect(body.password).not.toBe("demo123")
        expect(Object.values(body.password)).toEqual(Array.from(keccak256(utf8ToBytes("demo123"))))
    })

    it("returns a failure result with status and message on a 401", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "No account found for this username" }, 401, false)))
        await expect(login("admin", "wrong")).resolves.toEqual({
            ok: false,
            status: 401,
            message: "No account found for this username",
        })
    })

    it("returns a failure result with a fallback message when no body is readable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 400, false)))
        await expect(login("admin", "wrong")).resolves.toMatchObject({ ok: false, status: 400 })
    })

    it("returns status 0 when the network request fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
        await expect(login("admin", "demo123")).resolves.toMatchObject({ ok: false, status: 0 })
    })
})

describe("register", () => {
    it("posts hashed credentials to /register and returns the response body on success", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: "tok", username: "alice" }, 201))
        vi.stubGlobal("fetch", fetchMock)

        await expect(register("alice", "s3cret")).resolves.toEqual({ ok: true, accessToken: "tok", username: "alice" })

        const [url, config] = fetchMock.mock.calls[0]
        expect(url).toBe("/register")
        expect(config.method).toBe("POST")
        const body = JSON.parse(config.body)
        expect(body.username).toBe("alice")
        expect(body.password).not.toBe("s3cret")
        expect(Object.values(body.password)).toEqual(Array.from(keccak256(utf8ToBytes("s3cret"))))
        // Demo-data pre-population defaults to false when not requested.
        expect(body.populateDemoData).toBe(false)
    })

    it("sends populateDemoData=true when the user opts into demo data", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: "tok" }, 201))
        vi.stubGlobal("fetch", fetchMock)

        await register("alice", "s3cret", true)

        const [url, config] = fetchMock.mock.calls[0]
        expect(url).toBe("/register")
        const body = JSON.parse(config.body)
        expect(body.populateDemoData).toBe(true)
    })

    it("never sends populateDemoData on login", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accessToken: "tok" }))
        vi.stubGlobal("fetch", fetchMock)

        await login("admin", "demo123")

        const [, config] = fetchMock.mock.calls[0]
        expect("populateDemoData" in JSON.parse(config.body)).toBe(false)
    })

    it("surfaces the backend error for a duplicate username", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Username already exists" }, 409, false)))
        await expect(register("alice", "s3cret")).resolves.toEqual({
            ok: false,
            status: 409,
            message: "Username already exists",
        })
    })
})

describe("getUsernameFromToken", () => {
    const makeToken = (payload: Record<string, unknown>) => {
        const b64 = (obj: unknown) => btoa(JSON.stringify(obj))
        return `${b64({ alg: "HS256" })}.${b64(payload)}.signature`
    }

    it("decodes the sub claim from a JWT payload", () => {
        expect(getUsernameFromToken(makeToken({ sub: "alice", iat: 1 }))).toBe("alice")
    })

    it("returns null for a malformed token", () => {
        expect(getUsernameFromToken("not-a-jwt")).toBeNull()
        expect(getUsernameFromToken("a.b")).toBeNull()
        expect(getUsernameFromToken("")).toBeNull()
    })

    it("returns null when the payload has no sub claim", () => {
        expect(getUsernameFromToken(makeToken({ user: "admin" }))).toBeNull()
    })
})

describe("logout", () => {
    it("removes the token and resolves true on a 201 response", async () => {
        localStorage.setItem("accessToken", "tok")
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(undefined, 201)))

        await expect(logout()).resolves.toBe(true)
        expect(localStorage.getItem("accessToken")).toBeNull()
    })

    it("keeps the token and resolves false on failure", async () => {
        localStorage.setItem("accessToken", "tok")
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500, false)))

        await expect(logout()).resolves.toBe(false)
        expect(localStorage.getItem("accessToken")).toBe("tok")
    })

    it("resolves true without a network call when no token is stored", async () => {
        // Point at the login path so the logout helper skips the redirect branch.
        Object.defineProperty(window, "location", {
            configurable: true,
            writable: true,
            value: { ...window.location, pathname: "/login" },
        })
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)

        await expect(logout()).resolves.toBe(true)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
