// ── The API reference at /docs ─────────────────────────────────────────────
// Scalar's browser bundle is ~1 MB gzipped — more than the entire dashboard —
// so it is deliberately not part of this page. The shell paints in a few KB and
// the renderer is fetched only when a visitor asks for it; the chunk is
// content-hashed and served immutably, so the click is a one-time cost and a
// repeat visit skips the button entirely.
//
// `load` is injected rather than imported inline so the tests can drive the page
// without a browser, and so swapping the renderer later stays a one-file change.

import { resolveThemeMode } from "@/app/themeMode"
import "./docs.css"

export type ScalarApi = {
    createApiReference: (target: string | HTMLElement, options: Record<string, unknown>) => unknown
}

export type ReferenceLoader = () => Promise<ScalarApi>

/** How an import of the package can look, depending on how its entry resolves. */
type ScalarModule = Partial<ScalarApi>
type ScalarGlobal = { Scalar?: Partial<ScalarApi> }

const REMEMBER_KEY = "docs-reference-loaded"

/**
 * Fetch the renderer.
 *
 * Exported because getting this wrong is the page's one real failure mode: the
 * package resolves through its `exports` map to the ESM entry, which exposes
 * `createApiReference` as a *named export*. The prebuilt `standalone.js` — the
 * one behind the documented `<script src>` usage — is not reachable through that
 * map, so no `Scalar` global is ever created. Read the export, and fall back to a
 * global only in case a future build sets one.
 *
 * The dynamic import is also what keeps the whole renderer in its own chunk:
 * nothing Scalar-shaped reaches the network log before the button is pressed.
 */
export const loadScalar: ReferenceLoader = async () => {
    // Stylesheet first. The package's module entry neither imports nor injects its
    // own CSS — only the prebuilt `standalone.js` bundle carries styles — so
    // without this the reference mounts unstyled: bare SVGs at intrinsic size and
    // browser-default buttons. Importing it here, dynamically, keeps it off the
    // first paint and rides along with the click, exactly like the renderer.
    await import("@scalar/api-reference/style.css")

    const module = (await import("@scalar/api-reference")) as ScalarModule
    const global = (window as unknown as ScalarGlobal).Scalar
    const source = typeof module.createApiReference === "function" ? module : global

    if (!source || typeof source.createApiReference !== "function") {
        throw new Error("The renderer exposed no createApiReference")
    }

    // Bound, in case the renderer uses `this` after we hand the function on.
    return { createApiReference: source.createApiReference.bind(source) }
}

const alreadyLoaded = (): boolean => {
    try {
        return localStorage.getItem(REMEMBER_KEY) === "1"
    } catch {
        return false
    }
}

const rememberLoaded = (): void => {
    try {
        localStorage.setItem(REMEMBER_KEY, "1")
    } catch {
        // Private mode: the button simply appears again next visit.
    }
}

export type DocsPageOptions = {
    doc?: Document
    load?: ReferenceLoader
}

/** Wire the shell: one button, one status line, one mount point. */
export const initDocsPage = ({ doc = document, load = loadScalar }: DocsPageOptions = {}): void => {
    const button = doc.getElementById("docs-load") as HTMLButtonElement | null
    const status = doc.getElementById("docs-status")
    const target = doc.getElementById("docs-target")
    const cta = doc.getElementById("docs-cta")
    if (!button || !status || !target || !cta) return

    let started = false

    const mount = async () => {
        if (started) return
        started = true
        button.disabled = true
        button.textContent = "Loading…"
        status.className = "status"
        status.textContent = ""

        try {
            const api = await load()
            cta.hidden = true
            api.createApiReference(target, {
                url: "/openapi.json",
                darkMode: resolveThemeMode() === "dark",
            })
            rememberLoaded()
        } catch (error) {
            // Two things can fail here: the chunk itself (blocked download, or the
            // bandwidth gate serving a 2 KB page where the chunk should be) and the
            // spec fetch the renderer makes afterwards. Say what is true, and point
            // at the document that is always available.
            started = false
            button.disabled = false
            button.textContent = "Try again"
            status.className = "status error"
            status.textContent =
                "The interactive reference could not be loaded — the download was blocked, or this deployment is " +
                "over its bandwidth budget. The specification itself is always available at /openapi.json."
            console.error("Failed to load the API reference", error)
        }
    }

    button.addEventListener("click", () => void mount())

    // The chunk is cached for a year, so a repeat visit costs nothing: honour the
    // earlier choice instead of asking again.
    if (alreadyLoaded()) void mount()
}

// Auto-init in the browser. In tests the fixture is absent at import time, so
// this is a no-op and the exported init can be driven explicitly.
if (typeof document !== "undefined" && document.getElementById("docs-load")) initDocsPage()
