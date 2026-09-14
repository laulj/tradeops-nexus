import { describe, expect, it } from "vitest"
import { loadScalar } from "./main"

// No mocking here on purpose. The page's failure mode was a wrong assumption
// about how the package resolves — a global that never exists — and injecting a
// fake loader is exactly what hid it. So this test imports the package the way
// the browser bundle does and checks the contract the page depends on.

describe("the reference renderer", () => {
    it("resolves to something the page can actually call", async () => {
        expect(
            (globalThis as { Scalar?: unknown }).Scalar,
            "if this ever becomes defined, the package changed its distribution — the loader handles either",
        ).toBeUndefined()

        const api = await loadScalar()

        expect(typeof api.createApiReference).toBe("function")
    })
})
