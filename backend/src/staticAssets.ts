import express, { RequestHandler } from "express"
import path from "path"

// ── SPA asset delivery ──────────────────────────────────────────────────────
// Outbound bandwidth is the one metered, billed resource this service has, and
// the built SPA is by far the largest thing it sends (~3 MB of JS plus ~60 KB of
// CSS). Two properties keep that cost bounded:
//
//  1. Content-hashed chunk names (Vite emits `assets/app-a1b2c3d4.js`) mean a
//     changed file has a new name, so a year-long immutable cache is safe and
//     repeat visits cost zero bytes.
//  2. Everything outside `assets/` keeps its name across deploys — `index.html`
//     above all — so it must be revalidated, otherwise a deploy would leave
//     clients holding an index that references chunk names that no longer exist.

/** Hashed chunk files: safe to cache until the name changes (i.e. forever). */
export const HASHED_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"

/** Named files (`index.html`, `favicon.svg`, `og-image.png`): always revalidate. */
export const NAMED_FILE_CACHE_CONTROL = "no-cache"

/**
 * Serves Vite's hashed chunks from `<spaDir>/assets` with an immutable cache
 * header. Mount at `/assets`.
 */
export const serveHashedAssets = (spaDir: string): RequestHandler =>
    express.static(path.join(spaDir, "assets"), { maxAge: "1y", immutable: true })

/**
 * Serves the rest of the build. Files with a stable name are marked
 * `no-cache` so a deploy is picked up on the next request.
 */
export const serveSpaFiles = (spaDir: string): RequestHandler =>
    express.static(spaDir, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith(".html")) res.setHeader("Cache-Control", NAMED_FILE_CACHE_CONTROL)
        },
    })
