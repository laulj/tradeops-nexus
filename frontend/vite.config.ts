import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"

// Serve the SPA for top-level navigations (Accept: text/html) while still
// proxying real API calls (fetch/XHR). Without this, visiting /login directly
// would be proxied to the backend's GET /login handler, which 401s with
// {"error":"Missing token"} instead of rendering the app.
const spaFallback = (req: { headers: Record<string, string | string[] | undefined> }) =>
    String(req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    // Backend origin used by the dev/preview proxies. Defaults to a locally running
    // API; override with VITE_BACKEND_TARGET in the shell or in frontend/.env.local
    // (see frontend/.env.example). loadEnv() is needed because .env files are not
    // part of process.env while the config itself is being evaluated.
    const env = loadEnv(mode, process.cwd(), "")
    const backendTarget = env.VITE_BACKEND_TARGET || process.env.VITE_BACKEND_TARGET || "http://localhost:8080"

    // Every API prefix the frontend calls is proxied to the backend so the browser
    // only ever talks to the same origin (no insecure cross-origin requests).
    const apiProxy = Object.fromEntries(
        ["/login", "/register", "/logout", "/status", "/users", "/data"].map((prefix) => [
            prefix,
            { target: backendTarget, changeOrigin: true, bypass: spaFallback },
        ]),
    )

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
        },
        test: {
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
        },
    }
})
