import { describe, expect, it } from "vitest"
// Vite's `?raw` gives the source text without touching the filesystem — the app
// tsconfig has no Node types, on purpose.
import cssSource from "./docs.css?raw"
import htmlSource from "../../docs.html?raw"

/**
 * The shell and the reference share one document, and Scalar writes its own rules
 * at *element* specificity — `:where(.scalar-app) button` scores (0,0,1) — so any
 * element-level rule of ours outranks it. That is how the reference came to be
 * painted with the shell's button fill: white glyphs on light green, worse again
 * under a `filter: brightness()` hover.
 *
 * These assertions keep the boundary that fixes it: element selectors live only
 * under `.docs-shell`, and the renderer's mount point is a *sibling* of that
 * subtree, so a collision is impossible rather than merely unlikely.
 */

/**
 * Comments are stripped before any assertion: the stylesheet *explains* the old
 * `filter: brightness()` hover and the `.docs button` collision, and prose must not
 * be able to satisfy (or trip) a check about declarations.
 */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "")

const css = stripComments(cssSource)
const html = htmlSource

/** Every selector in the stylesheet, including the ones inside `@media` blocks. */
const selectorsIn = (source: string): string[] => {
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "")
    return [...withoutComments.matchAll(/(?:^|[}{;])\s*([^{}@;]+?)\s*\{/g)].map((match) => match[1].trim())
}

describe("the docs shell boundary", () => {
    const selectors = selectorsIn(css)

    it("is reading the stylesheet it thinks it is", () => {
        // Without this, a regex that matched nothing would make every assertion
        // below pass vacuously.
        expect(selectors).toContain("body")
        expect(selectors.filter((selector) => selector.startsWith(".docs-shell")).length).toBeGreaterThan(10)
    })

    it("keeps element selectors inside .docs-shell, where the renderer never renders", () => {
        const ELEMENT = /(^|[\s>+~])(button|a|h1|h2|h3|p|span|code|svg|\*)(?=$|[\s>+~.:[,])/
        const offenders = selectors.filter((selector) => !selector.startsWith(".docs-shell") && ELEMENT.test(selector))

        expect(offenders, "scope these under .docs-shell, or they will restyle Scalar's own controls").toEqual([])
    })

    it("mounts the reference outside the shell subtree", () => {
        const shellStart = html.indexOf('class="docs-shell"')
        const shellBodyStart = html.indexOf(">", shellStart) + 1
        const target = html.indexOf('id="docs-target"')

        expect(shellStart, "docs.html has no .docs-shell wrapper").toBeGreaterThan(-1)
        expect(target, "docs.html has no mount point").toBeGreaterThan(shellBodyStart)

        // The shell must be closed before the mount point: balanced divs in between.
        const between = html.slice(shellBodyStart, target)
        const opens = (between.match(/<div\b/g) ?? []).length
        const closes = (between.match(/<\/div>/g) ?? []).length
        expect(closes, "the shell is not closed before #docs-target").toBe(opens)
    })

    it("leaves the reference's mount point free of colour and typography", () => {
        const reference = css.match(/\.docs \.reference \{([^}]*)\}/)?.[1] ?? ""

        expect(reference).toMatch(/min-height/)
        expect(reference).not.toMatch(/color|font|background|filter|opacity/)
    })

    it("drives the label and hover colours from the theme, never a literal or a filter", () => {
        // `--docs-accent` flips light-to-dark between themes, so a hardcoded label
        // colour is wrong in one of them; `filter: brightness()` also perturbs the
        // text, which is what made the hover look wrong on top of the collision.
        expect(css).not.toMatch(/filter:\s*brightness/)
        expect(css).toMatch(/\.docs-shell button \{[^}]*color: var\(--docs-on-accent\)/)
        expect(css).toMatch(/\.docs-shell button:hover[^{]*\{[^}]*background: var\(--docs-accent-strong\)/)
    })

    it("defines every colour it uses in both themes", () => {
        for (const property of ["--docs-on-accent", "--docs-accent-strong"]) {
            expect(css, `${property} is missing from :root`).toMatch(new RegExp(`:root \\{[^}]*${property}:`))
            expect(css, `${property} is missing from the light theme`).toMatch(
                new RegExp(`html\\[data-theme="light"\\] \\{[^}]*${property}:`),
            )
        }
    })
})
