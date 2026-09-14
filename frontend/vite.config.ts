import { fileURLToPath } from "node:url"
import { loadEnv, type Plugin, type ProxyOptions } from "vite"
import { defineConfig } from "vitest/config"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { API_PREFIXES } from "./src/api/prefixes.ts"

// Serve the SPA for top-level navigations (Accept: text/html) while still
// proxying real API calls (fetch/XHR). Without this, visiting /login directly
// would be proxied to the backend's GET /login handler, which 401s with
// {"error":"Missing token"} instead of rendering the app.
const spaFallback = (req: { headers: Record<string, string | string[] | undefined> }) =>
    String(req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined

// Production serves the API reference at /docs, from frontend/dist/docs.html.
// Vite's dev and preview servers expose that entry as /docs.html, so rewrite the
// URL locally to match the documented, deployed path.
const docsRoute = (): Plugin => {
    const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
        if (req.url?.split("?")[0] === "/docs") req.url = "/docs.html"
        next()
    }

    return {
        name: "docs-route",
        // Block bodies on purpose: `use()` returns the connect app itself, and a
        // plugin hook that returns a function is installed as a middleware *after*
        // Vite's own — which then gets called like a connect app and crashes.
        configureServer: (server) => {
            server.middlewares.use(rewrite)
        },
        configurePreviewServer: (server) => {
            server.middlewares.use(rewrite)
        },
    }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    // Backend origin used by the dev/preview proxies. Defaults to a locally running
    // API; override with VITE_BACKEND_TARGET in the shell or in frontend/.env.local
    // (see frontend/.env.example). loadEnv() is needed because .env files are not
    // part of process.env while the config itself is being evaluated.
    const env = loadEnv(mode, process.cwd(), "")
    const backendTarget = env.VITE_BACKEND_TARGET || process.env.VITE_BACKEND_TARGET || "http://localhost:8080"

    // Every API prefix the frontend calls is proxied to the backend so the browser
    // only ever talks to the same origin (no insecure cross-origin requests). The
    // list lives beside the API client (src/api/prefixes.ts) so prefixes.test.ts
    // can compare it against the calls the client actually makes.
    const apiProxy: Record<string, ProxyOptions> = Object.fromEntries(
        API_PREFIXES.map((prefix) => [prefix, { target: backendTarget, changeOrigin: true, bypass: spaFallback }]),
    )

    // The docs routes are served by the API in production, so the dev and preview
    // servers proxy them too — deliberately without the spaFallback bypass: a
    // browser asking for /openapi.json wants the document, not the application.
    // (A navigation sends Accept: text/html, which is exactly what spaFallback
    // would otherwise divert to index.html.)
    apiProxy["/openapi.json"] = { target: backendTarget, changeOrigin: true }

    return {
        resolve: {
            alias: {
                "@": fileURLToPath(new URL("./src", import.meta.url)),
            },
        },
        plugins: [
            react(),
            // React Compiler is a build/dev optimization — skip it under Vitest (mode === "test")
            mode !== "test" && babel({ presets: [reactCompilerPreset()] }),
            tailwindcss(),
            docsRoute(),
        ],
        server: {
            proxy: apiProxy,
        },
        preview: {
            proxy: apiProxy,
        },
        build: {
            // No source maps in the deployed bundle. They added ~12.8 MB to the
            // asset payload — more than every JS chunk combined — and shipped the
            // full source to anyone who requested a *.js.map. Debug against a
            // local build when you need Lighthouse or a stack trace.
            sourcemap: false,
            rollupOptions: {
                // Two entries on purpose. The dashboard, and the API reference at
                // /docs. The reference's renderer (Scalar) is larger than the whole
                // app, so it must live outside the app's chunk graph entirely —
                // `scripts/check-bundle-size.mjs` budgets the two separately and
                // fails if the renderer ever leaks into the app's entry.
                input: {
                    main: fileURLToPath(new URL("./index.html", import.meta.url)),
                    docs: fileURLToPath(new URL("./docs.html", import.meta.url)),
                },
            },
        },
        test: {
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
            // Process CSS rather than stubbing it, so `import css from "./x.css?raw"`
            // returns the source (the shell-boundary test reads it to assert that no
            // rule of ours can reach the reference). Stubbed CSS yields "".
            css: true,
        },
    }
})
