import { readFileSync } from "fs"
import path from "path"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { app } from "../index"

/**
 * The specification is the contract integrators write code against, so the
 * deployment serves it rather than leaving it in the repository. Two properties
 * are worth pinning:
 *
 *   1. what is served is byte-for-byte the file the drift test validates, so
 *      there is never a second copy to fall out of step
 *   2. repeats are nearly free (ETag -> 304 with no body), because this
 *      deployment is billed for every byte it sends
 */

const REPO_SPEC = path.join(__dirname, "..", "..", "..", "docs", "openapi.json")
const repoSpec = JSON.parse(readFileSync(REPO_SPEC, "utf8")) as unknown

describe("GET /openapi.json", () => {
    it("serves the repository specification, verbatim", async () => {
        const res = await request(app).get("/openapi.json")

        expect(res.status).toBe(200)
        expect(res.headers["content-type"]).toContain("application/json")
        expect(JSON.parse(res.text)).toEqual(repoSpec)
    })

    it("caches for five minutes and revalidates with an ETag", async () => {
        const first = await request(app).get("/openapi.json")
        expect(first.headers["cache-control"]).toBe("public, max-age=300")

        const etag = String(first.headers.etag ?? "")
        expect(etag, "sendFile() must set an ETag, or every fetch re-downloads the document").not.toBe("")

        const second = await request(app).get("/openapi.json").set("If-None-Match", etag)
        expect(second.status).toBe(304)
        // The 304 carries no body — that is the entire point of the ETag.
        expect(second.text ?? "").toBe("")
    })

    it("needs no token", async () => {
        // The document is public in the repository already, and it is only useful
        // to an integrator who does not have an account yet.
        expect((await request(app).get("/openapi.json")).status).not.toBe(401)
    })
})
