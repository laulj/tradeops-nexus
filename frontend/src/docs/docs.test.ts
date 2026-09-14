import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The renderer is mocked with the shape the real package actually has: a named
// `createApiReference` export, and *no* global. The first version of this page
// read `window.Scalar` instead — which the package never sets — so every click
// threw and the page blamed the bandwidth budget. Keeping this mock honest is
// what stops that assumption creeping back.
const { createApiReference } = vi.hoisted(() => ({ createApiReference: vi.fn() }))

vi.mock("@scalar/api-reference", () => ({ createApiReference }))

import { initDocsPage, type ReferenceLoader } from "./main"

const FIXTURE = `
    <section id="docs-cta">
        <button id="docs-load" type="button">Load the interactive reference</button>
        <p id="docs-status" role="status"></p>
    </section>
    <div id="docs-target"></div>
`

const REMEMBER_KEY = "docs-reference-loaded"

/** Mount with the page's own loader (against the mocked package above). */
const mountPage = () => {
    document.body.innerHTML = FIXTURE
    initDocsPage({ doc: document })
}

/** Mount with an injected loader, for cases the real one cannot produce. */
const mountPageWith = (load: ReferenceLoader) => {
    document.body.innerHTML = FIXTURE
    initDocsPage({ doc: document, load })
}

const button = () => document.getElementById("docs-load") as HTMLButtonElement

beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ""
    vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("docs page", () => {
    it("mounts the renderer against the served specification, with no global", async () => {
        expect(
            (globalThis as { Scalar?: unknown }).Scalar,
            "the package exposes an export, not a global — the page must not depend on one",
        ).toBeUndefined()

        mountPage()
        button().click()

        await vi.waitFor(() => expect(createApiReference).toHaveBeenCalledTimes(1))

        const [target, options] = createApiReference.mock.calls[0]
        expect(target).toBe(document.getElementById("docs-target"))
        expect(options).toMatchObject({ url: "/openapi.json" })
    })

    it("does not touch the renderer until the button is pressed", async () => {
        const load = vi.fn(async () => ({ createApiReference }))
        mountPageWith(load)

        expect(load).not.toHaveBeenCalled()

        button().click()
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    })

    it("hides the call to action and remembers the choice", async () => {
        mountPage()
        button().click()

        await vi.waitFor(() => expect(document.getElementById("docs-cta")?.hidden).toBe(true))
        expect(localStorage.getItem(REMEMBER_KEY)).toBe("1")
    })

    it("loads straight away on a repeat visit, when the chunk is cached", async () => {
        localStorage.setItem(REMEMBER_KEY, "1")
        // Injected, not the shared module mock: this file's mock accumulates calls
        // from earlier tests' in-flight mounts, and an exact count is only
        // meaningful for a loader this test owns.
        const load = vi.fn(async () => ({ createApiReference }))

        mountPageWith(load)

        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
        await vi.waitFor(() => expect(document.getElementById("docs-cta")?.hidden).toBe(true))
        // Auto-load must fire once, not once per listener.
        expect(load).toHaveBeenCalledTimes(1)
    })

    it("explains a failure and allows a retry", async () => {
        const load = vi.fn(async () => {
            throw new Error("offline")
        })
        mountPageWith(load)

        button().click()
        await vi.waitFor(() => expect(button().textContent).toBe("Try again"))

        const status = document.getElementById("docs-status") as HTMLElement
        expect(status.className).toContain("error")
        expect(status.textContent).toContain("/openapi.json")
        // A failed download must not be remembered as a loaded one.
        expect(localStorage.getItem(REMEMBER_KEY)).toBeNull()

        button().click()
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    })

    it("does nothing when the shell is absent", () => {
        document.body.innerHTML = ""
        const load = vi.fn(async () => ({ createApiReference }))

        expect(() => initDocsPage({ doc: document, load })).not.toThrow()
        expect(load).not.toHaveBeenCalled()
    })
})
