// Minimal dependency-free routing for the public pages.
//
// The signed-in experience is a single stateful shell (AppShell) so it does not
// need a router. When signed out we show either the marketing landing page (/)
// or the login/register screen (/login) — a tiny pathname listener is enough.

export const getCurrentPath = (): string => window.location.pathname + window.location.search

export const isLoginPath = (path: string): boolean => path === "/login" || path.startsWith("/login?")

// SPA navigation: push history and notify the App-level popstate listener.
export const navigate = (to: string): void => {
    if (getCurrentPath() === to) return
    window.history.pushState({}, "", to)
    window.dispatchEvent(new Event("popstate"))
}

// Same as navigate() but wrapped in the View Transition API when the browser
// supports it (crossfade + slide between public pages). Falls back to an
// instant swap otherwise — reduced-motion users get the same fallback via CSS.
export const transitionTo = (to: string): void => {
    const go = () => navigate(to)
    const doc = document as Document & {
        startViewTransition?: (update: () => void) => unknown
    }
    if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(go)
    } else {
        go()
    }
}
