import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// ── Global test cleanup ────────────────────────────────────────────────────
afterEach(() => {
    cleanup()
    localStorage.clear()
    document.body.className = ""
    vi.unstubAllGlobals()
})

// ── jsdom polyfills required by antd / Testing Library / user-event ────────
// antd's responsive internals rely on matchMedia, which jsdom does not provide.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }),
    })
}

// Some antd components observe DOM sizes; jsdom ships no ResizeObserver.
if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
    class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

if (typeof window !== "undefined") {
    // user-event scrolls elements into view before interacting with them.
    window.HTMLElement.prototype.scrollIntoView ??= () => {}

    // Defensive polyfill: jsdom does not implement CSS.supports.
    if (window.CSS && typeof window.CSS.supports === "undefined") {
        Object.defineProperty(window.CSS, "supports", {
            writable: true,
            value: () => false,
        })
    }
}
