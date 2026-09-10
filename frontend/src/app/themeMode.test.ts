import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { applyThemeMode, resolveThemeMode } from "@/app/themeMode"

// Force the simulated OS `prefers-color-scheme` result for a test.
const setMatchMedia = (dark: boolean) => {
    window.matchMedia = ((query: string) => ({
        matches: dark,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
}

describe("resolveThemeMode", () => {
    beforeEach(() => {
        localStorage.clear()
        document.body.className = ""
        document.documentElement.removeAttribute("data-theme")
    })
    afterEach(() => {
        localStorage.clear()
        document.body.className = ""
        document.documentElement.removeAttribute("data-theme")
        setMatchMedia(false)
    })

    it("prefers an explicit saved light over a dark OS preference", () => {
        localStorage.setItem("theme", "light")
        setMatchMedia(true)
        expect(resolveThemeMode()).toBe("light")
    })

    it("prefers an explicit saved dark over a light OS preference", () => {
        localStorage.setItem("theme", "dark")
        setMatchMedia(false)
        expect(resolveThemeMode()).toBe("dark")
    })

    it("falls back to the OS preference when nothing is saved", () => {
        setMatchMedia(true)
        expect(resolveThemeMode()).toBe("dark")
    })
})

describe("applyThemeMode", () => {
    afterEach(() => {
        document.body.className = ""
        document.documentElement.removeAttribute("data-theme")
    })

    it("sets the body class, html data-theme and color-scheme", () => {
        applyThemeMode("light")
        expect(document.body.classList.contains("light")).toBe(true)
        expect(document.body.classList.contains("dark-theme")).toBe(false)
        expect(document.documentElement.getAttribute("data-theme")).toBe("light")

        applyThemeMode("dark")
        expect(document.body.classList.contains("dark-theme")).toBe(true)
        expect(document.body.classList.contains("light")).toBe(false)
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    })
})
