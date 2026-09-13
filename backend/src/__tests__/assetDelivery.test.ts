import express from "express"
import compression from "compression"
import request from "supertest"
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { NAMED_FILE_CACHE_CONTROL, serveHashedAssets, serveSpaFiles } from "../staticAssets"

// Every assertion here guards a byte-cost bug, because outbound bandwidth is the
// one metered and billed resource this service has and the built SPA is by far
// the largest thing it sends:
//   - compression() must be mounted *before* the static handlers (Express runs
//     middleware in registration order), otherwise every chunk ships raw
//   - hashed chunks must be cacheable forever, or each repeat visit re-downloads
//     ~3 MB
//   - named files (index.html) must stay revalidatable, or a deploy would leave
//     clients holding an index that references deleted chunk names

const CHUNK = "app-0123456789.js"

let dir: string
let fixedApp: express.Express
let misorderedApp: express.Express

const buildApp = (compressionFirst: boolean) => {
    const app = express()
    if (compressionFirst) app.use(compression())
    app.use("/assets", serveHashedAssets(dir))
    app.use(serveSpaFiles(dir))
    if (!compressionFirst) app.use(compression())
    return app
}

beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "arb-assets-test-"))
    mkdirSync(path.join(dir, "assets"), { recursive: true })
    // Repetitive content, comfortably over compression()'s 1 KB threshold.
    writeFileSync(path.join(dir, "assets", CHUNK), `/* banner */\n${"export const x = 1\n".repeat(600)}`)
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>")
    writeFileSync(path.join(dir, "og-image.png"), Buffer.alloc(2048, 7))

    fixedApp = buildApp(true)
    misorderedApp = buildApp(false)
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("SPA asset delivery", () => {
    it("compresses hashed chunks when the client accepts gzip", async () => {
        const res = await request(fixedApp).get(`/assets/${CHUNK}`).set("Accept-Encoding", "gzip")

        expect(res.status).toBe(200)
        expect(res.headers["content-encoding"]).toBe("gzip")
    })

    it("ships the chunk raw when compression is mounted after the static handlers", async () => {
        // This is what production looked like before the fix: ~3 MB of
        // uncompressed JS per cold visit. The order in index.ts is the fix.
        const res = await request(misorderedApp).get(`/assets/${CHUNK}`).set("Accept-Encoding", "gzip")

        expect(res.status).toBe(200)
        expect(res.headers["content-encoding"]).toBeUndefined()
    })

    it("serves the whole chunk when no compression is negotiated", async () => {
        const res = await request(fixedApp).get(`/assets/${CHUNK}`).set("Accept-Encoding", "identity")

        expect(res.status).toBe(200)
        expect(res.headers["content-encoding"]).toBeUndefined()
        expect(Number(res.headers["content-length"])).toBe(statSync(path.join(dir, "assets", CHUNK)).size)
    })

    it("caches hashed chunks immutably", async () => {
        const res = await request(fixedApp).get(`/assets/${CHUNK}`).set("Accept-Encoding", "identity")

        expect(res.headers["cache-control"]).toContain("max-age=31536000")
        expect(res.headers["cache-control"]).toContain("immutable")
    })

    it("keeps the named entry point revalidated", async () => {
        const res = await request(fixedApp).get("/index.html")

        expect(res.status).toBe(200)
        expect(res.headers["cache-control"]).toBe(NAMED_FILE_CACHE_CONTROL)
    })

    it("never marks a named file immutable", async () => {
        const res = await request(fixedApp).get("/og-image.png")

        expect(res.status).toBe(200)
        expect(String(res.headers["cache-control"] ?? "")).not.toContain("immutable")
    })

    it("answers a missing chunk with 404 rather than the SPA shell", async () => {
        const res = await request(fixedApp).get("/assets/missing-abcdef.js")

        expect(res.status).toBe(404)
    })
})
