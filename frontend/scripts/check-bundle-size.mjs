#!/usr/bin/env node
// Egress guard for the built SPA.
//
// Outbound bandwidth on Render is metered: the workspace includes a fixed number
// of GB per month and every GB past that is billed. The SPA is ~99% of what this
// service sends, so three things are worth failing CI over:
//
//   1. source maps in the deployed bundle — they were 12.8 MB once, larger than
//      every JS chunk combined, and they ship the full source to anyone who asks
//   2. a gzipped JS/CSS payload that outgrows its budget
//   3. the API reference's renderer leaking into the dashboard's entry
//   4. the reference's stylesheet going missing — the package's module entry
//      imports and injects no CSS, so the page would render unstyled (bare SVGs
//      and browser-default buttons)
//
// The build has two entries: `index.html` (the dashboard) and `docs.html` (the
// API reference at /docs). The reference's renderer is bigger than the whole
// dashboard, so it gets its own budget — and because the two buckets are split
// by *reachability*, importing the renderer from app code moves it into the app
// bucket, where it cannot possibly fit. That is the enforcement, instead of a
// rule someone has to remember.
//
// Usage:  node scripts/check-bundle-size.mjs [distDir]
// Budget: BUNDLE_BUDGET_BYTES=... (default 1.25 MiB) for the dashboard
//         DOCS_BUDGET_BYTES=...   (default 1.5 MiB)  for the reference renderer
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"

const distDir = path.resolve(process.argv[2] ?? "dist")
const appBudget = Number(process.env.BUNDLE_BUDGET_BYTES ?? 1_310_720) // 1.25 MiB
const docsBudget = Number(process.env.DOCS_BUDGET_BYTES ?? 1_572_864) // 1.5 MiB

const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : [full]
    })

let files
try {
    files = walk(distDir)
} catch {
    console.error(`✗ ${path.relative(process.cwd(), distDir)} not found — build the frontend first.`)
    process.exit(1)
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

const maps = files.filter((file) => file.endsWith(".map"))
if (maps.length > 0) {
    console.error(`✗ ${maps.length} source map(s) found in the deployed bundle:`)
    for (const map of maps.slice(0, 5)) {
        console.error(`    ${path.relative(distDir, map)} (${kb(statSync(map).size)})`)
    }
    console.error("  Source maps roughly tripled the asset payload and expose the source.")
    console.error("  Set `build.sourcemap = false` in frontend/vite.config.ts.")
    process.exit(1)
}

// ── Which file does which page need? ────────────────────────────────────────
// Vite rewrites the entry HTML with the chunks it loads, and every chunk names
// its own imports, so walking those references gives the exact graph per entry.
// Note the specifiers: Vite 8 emits dynamic imports with backticks
// (`import(\`./chunk.js\`)`), alongside the quoted static forms.
const HTML_ASSET = /(?:src|href)="([^"]+\.(?:js|css))"/g
const CHUNK_IMPORT = /(?:import\(|import\s*|from\s*)["'`]([^"'`]+\.(?:js|css))["'`]/g
// Vite's preload helper lists a dynamically imported chunk's whole graph — its JS
// *and* its CSS — in a `__vite__mapDeps` array, as plain string literals with no
// `import`/`from` in front of them. CSS is named nowhere else, so missing these
// arrays classified the reference's stylesheet as dead weight and counted it
// against the dashboard instead.
const CHUNK_DEP = /["'`](assets\/[^"'`]+\.(?:js|css))["'`]/g

const refs = (text, pattern) => [...text.matchAll(pattern)].map((match) => match[1])

const resolveRef = (from, ref) => {
    if (/^(?:https?:|data:)/.test(ref)) return null
    const clean = ref.split("?")[0]
    if (clean.startsWith("/")) return path.join(distDir, clean.slice(1))
    if (clean.startsWith("./") || clean.startsWith("../")) return path.resolve(path.dirname(from), clean)
    // Vite's preload lists (`__vite__mapDeps`) name their dependencies from the
    // dist root, without a leading "./".
    if (clean.includes("/")) return path.join(distDir, clean)
    return null
}

const reachableFrom = (entryHtml) => {
    const seen = new Set()
    if (!existsSync(entryHtml)) return seen

    const queue = refs(readFileSync(entryHtml, "utf8"), HTML_ASSET)
        .map((ref) => resolveRef(entryHtml, ref))
        .filter(Boolean)

    while (queue.length > 0) {
        const file = queue.pop()
        if (seen.has(file) || !existsSync(file)) continue
        seen.add(file)
        if (!file.endsWith(".js")) continue
        const text = readFileSync(file, "utf8")
        for (const ref of [...refs(text, CHUNK_IMPORT), ...refs(text, CHUNK_DEP)]) {
            const next = resolveRef(file, ref)
            if (next && !seen.has(next)) queue.push(next)
        }
    }

    return seen
}

const docsHtml = path.join(distDir, "docs.html")
if (!existsSync(docsHtml)) {
    console.error("✗ dist/docs.html is missing — the second Vite entry (frontend/docs.html) did not build.")
    console.error("  The API reference at /docs is served from that file.")
    process.exit(1)
}

const appReach = reachableFrom(path.join(distDir, "index.html"))
const docsReach = reachableFrom(docsHtml)

const asset = (file) => ({ file, raw: statSync(file).size, gz: gzipSync(readFileSync(file)).length })
const jsOrCss = files.filter((file) => file.endsWith(".js") || file.endsWith(".css"))

// A chunk both pages reach is shared, so it counts against the dashboard — the
// stricter of the two budgets. Anything neither page reaches (a lazily-built
// chunk with a computed name) counts there as well, because it still ships.
const docsOnly = jsOrCss.filter((file) => docsReach.has(file) && !appReach.has(file))
const appFiles = jsOrCss.filter((file) => !docsOnly.includes(file))

const report = (label, list, budget) => {
    const assets = list.map(asset).sort((a, b) => b.gz - a.gz)
    const gz = assets.reduce((sum, item) => sum + item.gz, 0)
    const raw = assets.reduce((sum, item) => sum + item.raw, 0)
    console.log(`${label} — ${assets.length} files, ${kb(raw)} raw / ${kb(gz)} gzipped (budget ${kb(budget)})`)
    for (const item of assets.slice(0, 5)) {
        console.log(`  ${kb(item.gz).padStart(8)} gz  ${path.relative(distDir, item.file)}`)
    }
    return gz
}

const appGz = report("SPA payload", appFiles, appBudget)
const docsGz = report("API reference payload", docsOnly, docsBudget)

// ── Does the reference actually have its stylesheet? ────────────────────────
// @scalar/api-reference ships its CSS as a separate file (`./style.css`) and its
// module entry neither imports nor injects it: a page that loads the renderer
// without the stylesheet mounts unstyled, which looks like enormous icons and
// buttons rather than an obvious error. Marker: Scalar's `--scalar-*` properties.
const hasScalarStyles = (file) => file.endsWith(".css") && readFileSync(file, "utf8").includes("--scalar-")
const docsStyles = docsOnly.filter(hasScalarStyles)
const appStyles = appFiles.filter(hasScalarStyles)

if (docsStyles.length === 0) {
    console.error("✗ the API reference's stylesheet is missing from this build.")
    console.error("  The renderer must import '@scalar/api-reference/style.css' alongside the module;")
    console.error("  without it the page renders unstyled.")
    process.exit(1)
}
if (appStyles.length > 0) {
    console.error("✗ the dashboard's CSS includes the reference's stylesheet:")
    for (const file of appStyles) console.error(`    ${path.relative(distDir, file)}`)
    console.error("  The renderer's styles belong to the /docs entry only.")
    process.exit(1)
}
console.log(
    `✓ reference stylesheet present (${docsStyles.map((file) => path.basename(file)).join(", ")}) — and absent from the dashboard`,
)

let overBudget = false
if (appGz > appBudget) {
    console.error(`✗ the dashboard's gzipped JS+CSS is ${kb(appGz - appBudget)} over budget.`)
    console.error("  Raise BUNDLE_BUDGET_BYTES deliberately, or trim the dependency.")
    console.error("  (A /docs chunk landing in this bucket means app code imports the renderer.)")
    overBudget = true
}
if (docsGz > docsBudget) {
    console.error(`✗ the API reference's gzipped JS+CSS is ${kb(docsGz - docsBudget)} over budget.`)
    console.error("  Raise DOCS_BUDGET_BYTES deliberately, or reconsider the renderer.")
    overBudget = true
}
if (overBudget) process.exit(1)

console.log(
    `✓ within budget (${kb(appBudget - appGz)} dashboard headroom, ${kb(docsBudget - docsGz)} docs headroom)`,
)
