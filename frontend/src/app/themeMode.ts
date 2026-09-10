// ── Theme mode resolution ───────────────────────────────────────────────────
// Single source of truth for which theme the app is in. An explicit user choice
// stored in localStorage ALWAYS wins over the OS preference — previously the
// body-class logic let `prefers-color-scheme: dark` override a saved "light",
// leaving <body> with `dark-theme` while ConfigProvider rendered the light
// theme, so every `body.light .nexus-*` override was skipped.

export type ThemeMode = "light" | "dark"

const STORAGE_KEY = "theme"

/** Resolve the active theme: stored choice first, OS preference as fallback. */
export const resolveThemeMode = (): ThemeMode => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored === "light" || stored === "dark") return stored
    } catch {
        // localStorage unavailable (private mode / SSR) — fall through to OS.
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    }
    return "light"
}

/**
 * Apply a theme to the DOM: the `<html>` data-theme + color-scheme hooks, and
 * the `<body>` class that all the light/dark CSS keys off. Safe to call before
 * React mounts (used by the pre-paint script in index.html).
 */
export const applyThemeMode = (mode: ThemeMode): void => {
    if (typeof document === "undefined") return

    const body = document.body
    if (body) {
        body.classList.remove("light", "dark-theme")
        body.classList.add(mode === "dark" ? "dark-theme" : "light")
    }

    const root = document.documentElement
    root.setAttribute("data-theme", mode)
    root.style.colorScheme = mode
}

/** Persist an explicit user choice. */
export const persistThemeMode = (mode: ThemeMode): void => {
    try {
        localStorage.setItem(STORAGE_KEY, mode)
    } catch {
        // Ignore write failures (private mode / storage disabled).
    }
}
