import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

/**
 * `docs/openapi.json` is hand-written, and hand-written documents rot: a route
 * gets renamed, the spec keeps describing the old one, and nobody notices until
 * an integrator does. This test re-derives the route table from the source that
 * registers it and compares the two directions.
 *
 * It reads the source rather than walking Express's private router stack
 * (`app._router.stack`) on purpose: private internals break on a major bump, and
 * this file has to survive upgrades. A source scan is only sound if every
 * registration is a plain statement with a string literal, so both of those are
 * asserted below instead of assumed.
 */

const BACKEND = path.join(__dirname, "..", "..")
const SPEC_PATH = path.join(BACKEND, "..", "docs", "openapi.json")
const SRC = path.join(BACKEND, "src")

const METHODS = ["get", "post", "put", "patch", "delete", "all"] as const
type Method = (typeof METHODS)[number]

/** Where each router is mounted, so a route can be reported at its real path. */
const SOURCES = [
    { file: "index.ts", variable: "app", mount: "" },
    { file: "databaseRouter.ts", variable: "dataRouter", mount: "/data" },
    { file: "futureDatabaseRouter.ts", variable: "spotFutureDataRouter", mount: "/data/spotFuture" },
    { file: "fundingRateDatabaseRouter.ts", variable: "fundingRateDataRouter", mount: "/data/fRate" },
]

type Route = { path: string; methods: Method[] }

/**
 * Registrations start a line (`dataRouter.post(…`). Anchoring there is what
 * keeps dead code out of the list: a commented-out `// app.post(…)` matches
 * neither the registration pattern nor the literal-path guard.
 */
const registrationsIn = (file: string, variable: string, mount: string): Route[] => {
    const source = readFileSync(path.join(SRC, file), "utf8")
    const byPath = new Map<string, Set<Method>>()

    for (const method of METHODS) {
        // A path assembled at runtime would be invisible to this scan.
        const dynamic = new RegExp(`^[ \\t]*${variable}\\.${method}\\(\\s*[^"\\s]`, "m")
        expect(source, `${file}: ${variable}.${method}() must take a string literal`).not.toMatch(dynamic)

        const found = new RegExp(`^[ \\t]*${variable}\\.${method}\\(\\s*"([^"]+)"`, "gm")
        for (const match of source.matchAll(found)) {
            const full = `${mount}${match[1]}`
            byPath.set(full, (byPath.get(full) ?? new Set<Method>()).add(method))
        }
    }

    return [...byPath].map(([full, methods]) => ({ path: full, methods: [...methods] }))
}

type Operation = {
    tags?: string[]
    summary?: string
    security?: unknown[]
    responses?: Record<string, unknown>
}

type Spec = {
    openapi: string
    info: { title: string; version: string }
    servers: { url: string }[]
    security?: unknown[]
    tags: { name: string }[]
    paths: Record<string, Record<string, Operation>>
    "x-internal-paths": { paths: string[]; description: string }[]
}

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Spec
const routes = SOURCES.flatMap(({ file, variable, mount }) => registrationsIn(file, variable, mount))
const internal = new Set(spec["x-internal-paths"].flatMap((group) => group.paths))

/** `:username` in a route is `{username}` in the spec. */
const toSpecPath = (route: string) => route.replace(/:([A-Za-z0-9_]+)/g, "{$1}")

const label = (route: Route) => `${route.methods.map((method) => method.toUpperCase()).join("|")} ${route.path}`

/** Methods the spec documents for a route, treating `all` as "any method". */
const documentedMethods = (route: Route) => {
    const operations = spec.paths[toSpecPath(route.path)] ?? {}
    return Object.keys(operations).filter(
        (method) => route.methods.includes("all") || route.methods.includes(method as Method),
    )
}

const refsIn = (node: unknown, found: string[] = []): string[] => {
    if (Array.isArray(node)) {
        node.forEach((child) => refsIn(child, found))
    } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
            if (key === "$ref" && typeof value === "string") found.push(value)
            else refsIn(value, found)
        }
    }
    return found
}

const resolveRef = (ref: string) =>
    ref
        .replace(/^#\//, "")
        .split("/")
        .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
        .reduce<unknown>((node, token) => (node as Record<string, unknown> | undefined)?.[token], spec)

describe("docs/openapi.json", () => {
    it("documents every route that is not explicitly internal", () => {
        const undocumented = routes.filter(
            (route) => !internal.has(toSpecPath(route.path)) && documentedMethods(route).length === 0,
        )
        expect(
            undocumented.map(label),
            "document it in docs/openapi.json, or excuse it under x-internal-paths",
        ).toEqual([])
    })

    it("only describes routes that are actually registered", () => {
        const stale: string[] = []
        for (const [specPath, operations] of Object.entries(spec.paths)) {
            for (const method of Object.keys(operations)) {
                const exists = routes.some(
                    (route) =>
                        toSpecPath(route.path) === specPath &&
                        (route.methods.includes("all") || route.methods.includes(method as Method)),
                )
                if (!exists) stale.push(`${method.toUpperCase()} ${specPath}`)
            }
        }
        expect(stale, "documented but no longer registered").toEqual([])
    })

    it("keeps the excused list honest", () => {
        const registered = new Set(routes.map((route) => toSpecPath(route.path)))
        const staleExcuses = spec["x-internal-paths"]
            .flatMap((group) => group.paths)
            .filter((specPath) => !registered.has(specPath))
        expect(staleExcuses, "excused under x-internal-paths but no longer registered").toEqual([])
    })

    it("keeps the unauthenticated surface to a known list", () => {
        const publicOperations = Object.entries(spec.paths)
            .flatMap(([specPath, operations]) =>
                Object.entries(operations)
                    .filter(([, operation]) => Array.isArray(operation.security) && operation.security.length === 0)
                    .map(([method]) => `${method.toUpperCase()} ${specPath}`),
            )
            .sort()
        // Everything here is reachable without a token, so growing the list should
        // be a deliberate edit rather than a side effect.
        expect(publicOperations).toEqual([
            "GET /docs",
            "GET /login",
            "GET /openapi.json",
            "POST /login",
            "POST /playground/session",
            "POST /register",
        ])
    })

    it("describes every operation consistently", () => {
        const declaredTags = new Set(spec.tags.map((tag) => tag.name))
        for (const [specPath, operations] of Object.entries(spec.paths)) {
            for (const [method, operation] of Object.entries(operations)) {
                const where = `${method.toUpperCase()} ${specPath}`
                expect(operation.summary, `${where} has no summary`).toBeTruthy()
                expect(operation.tags?.length, `${where} has no tag`).toBeGreaterThan(0)
                for (const tag of operation.tags ?? []) {
                    expect(declaredTags.has(tag), `${where} uses undeclared tag "${tag}"`).toBe(true)
                }
                const statuses = Object.keys(operation.responses ?? {})
                expect(
                    statuses.some((status) => status.startsWith("2")),
                    `${where} documents no success response`,
                ).toBe(true)
                if (operation.tags?.includes("Admin")) {
                    expect(operation.security ?? spec.security, `${where} is tagged Admin but not protected`).toEqual([
                        { bearerAuth: [] },
                    ])
                }
            }
        }
    })

    it("resolves every $ref", () => {
        for (const ref of refsIn(spec)) {
            expect(resolveRef(ref), `unresolvable $ref: ${ref}`).toBeTruthy()
        }
    })
})
