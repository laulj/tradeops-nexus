import { afterEach, describe, expect, it } from "vitest"
import { ADMIN_USERNAME, adminPassword, assertCredentialsConfigured, isProduction } from "../credentials"

// The admin account can list/delete users and download every database, so its
// password is a deployment secret: the demo default must never be usable in
// production, and an operator-supplied value must always win.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

const restore = (key: "NODE_ENV" | "ADMIN_PASSWORD", value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
}

afterEach(() => {
    restore("NODE_ENV", ORIGINAL_NODE_ENV)
    restore("ADMIN_PASSWORD", ORIGINAL_ADMIN_PASSWORD)
})

describe("admin credentials", () => {
    it("uses the password supplied by the environment", () => {
        process.env.ADMIN_PASSWORD = "rotated-in-the-host"
        expect(adminPassword()).toBe("rotated-in-the-host")
    })

    it("falls back to the development default outside production", () => {
        delete process.env.ADMIN_PASSWORD
        process.env.NODE_ENV = "test"

        expect(isProduction()).toBe(false)
        expect(adminPassword()).toBe("demo123")
    })

    it("refuses to serve production without ADMIN_PASSWORD", () => {
        delete process.env.ADMIN_PASSWORD
        process.env.NODE_ENV = "production"

        expect(isProduction()).toBe(true)
        expect(() => adminPassword()).toThrow(/ADMIN_PASSWORD/)
        expect(() => assertCredentialsConfigured()).toThrow(/ADMIN_PASSWORD/)
    })

    it("accepts a configured password in production", () => {
        process.env.NODE_ENV = "production"
        process.env.ADMIN_PASSWORD = "rotated-in-the-host"

        expect(() => assertCredentialsConfigured()).not.toThrow()
    })

    it("treats a blank environment value as unset", () => {
        process.env.ADMIN_PASSWORD = "   "
        process.env.NODE_ENV = "test"

        expect(adminPassword()).toBe("demo123")
    })

    it("trims surrounding whitespace", () => {
        process.env.ADMIN_PASSWORD = "  spaced-out  "

        expect(adminPassword()).toBe("spaced-out")
    })

    it("keeps the bootstrap username stable", () => {
        expect(ADMIN_USERNAME).toBe("admin")
    })
})
