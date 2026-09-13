#!/usr/bin/env node
// Egress guard for the built SPA.
//
// Outbound bandwidth on Render is metered: the workspace includes a fixed number
// of GB per month and every GB past that is billed. The SPA is ~99% of what this
// service sends, so two things are worth failing CI over:
//
//   1. source maps in the deployed bundle — they were 12.8 MB once, larger than
//      every JS chunk combined, and they ship the full source to anyone who asks
//   2. a gzipped JS/CSS payload that outgrows the budget
//
// Usage:  node scripts/check-bundle-size.mjs [distDir]
// Budget: BUNDLE_BUDGET_BYTES=... (default 1.25 MiB gzipped)
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { gzipSync } from "node:zlib"

const distDir = path.resolve(process.argv[2] ?? "dist")
const budgetBytes = Number(process.env.BUNDLE_BUDGET_BYTES ?? 1_310_720) // 1.25 MiB

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

const assets = files
    .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
    .map((file) => ({ file, raw: statSync(file).size, gz: gzipSync(readFileSync(file)).length }))
    .sort((a, b) => b.gz - a.gz)

const totalGz = assets.reduce((sum, asset) => sum + asset.gz, 0)
const totalRaw = assets.reduce((sum, asset) => sum + asset.raw, 0)

console.log(
    `SPA payload — ${assets.length} files, ${kb(totalRaw)} raw / ${kb(totalGz)} gzipped (budget ${kb(budgetBytes)})`,
)
for (const asset of assets.slice(0, 5)) {
    console.log(`  ${kb(asset.gz).padStart(8)} gz  ${path.relative(distDir, asset.file)}`)
}

if (totalGz > budgetBytes) {
    console.error(
        `✗ gzipped JS+CSS is ${kb(totalGz - budgetBytes)} over budget. Raise BUNDLE_BUDGET_BYTES deliberately, or trim the dependency.`,
    )
    process.exit(1)
}

console.log(`✓ within budget (${kb(budgetBytes - totalGz)} headroom)`)
