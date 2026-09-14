import { describe, expect, it } from "vitest"
import { API_PREFIXES } from "@/api/prefixes"
// The client sources as text: the URLs are built from `baseUrl`, which is a
// runtime value, so the only static evidence of which prefixes are called is the
// source itself.
import authSource from "./auth.ts?raw"
import backendSource from "./backend.ts?raw"
import clientSource from "./client.ts?raw"

const SOURCES = [authSource, backendSource, clientSource].join("\n")

/** `baseUrl + "data/symbols"` and `baseUrl + \`admin/restore/${target}\`` */
const LITERAL_URL = /baseUrl\s*\+\s*(?:"([^"]*)"|`([^`]*)`)/g

/**
 * `baseUrl + endpoint`, where the shared login/register helper takes the endpoint
 * as a parameter — its union is the only static evidence of those two URLs.
 */
const PARAMETERISED_ENDPOINT = /endpoint:\s*"([^"]+)"(?:\s*\|\s*"([^"]+)")?/g

/** First path segment of every URL the client builds, normalised to `/segment`. */
const referencedPrefixes = (): string[] => {
    const prefixes = new Set<string>()
    const add = (url: string | undefined) => {
        const [segment] = String(url ?? "")
            .replace(/^\/+/, "")
            .split(/[/?#]/)
        if (segment) prefixes.add(`/${segment}`)
    }

    for (const [, quoted, template] of SOURCES.matchAll(LITERAL_URL)) add(quoted ?? template)
    for (const [, first, second] of SOURCES.matchAll(PARAMETERISED_ENDPOINT)) {
        add(first)
        add(second)
    }

    return [...prefixes].sort()
}

describe("proxied API prefixes", () => {
    // Without this, a regex that stopped matching would make the assertions below
    // pass vacuously — the same trap the docs stylesheet test guards against.
    it("finds every URL the API client builds", () => {
        expect(referencedPrefixes()).toEqual(
            expect.arrayContaining([
                "/login",
                "/register",
                "/logout",
                "/status",
                "/users",
                "/data",
                "/admin",
                "/playground",
            ]),
        )
    })

    // A prefix the dev server does not proxy is a silent 404 in development: Vite
    // answers the request itself, and its SPA fallback only covers navigations.
    it("proxies every prefix the client calls", () => {
        expect(referencedPrefixes().filter((prefix) => !API_PREFIXES.includes(prefix))).toEqual([])
    })

    it("lists no prefix the client never calls", () => {
        const referenced = new Set(referencedPrefixes())
        expect(API_PREFIXES.filter((prefix) => !referenced.has(prefix))).toEqual([])
    })
})
