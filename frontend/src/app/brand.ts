// ── Nexus design tokens ────────────────────────────────────────────────────
// Single source of truth shared by the landing page, the sign-in experience,
// and the Ant Design shell so every surface reads as the same product.
export const brand = {
    // Surfaces
    canvas: "#07080c", // page canvas (landing + dark app body)
    layout: "#0b0e14", // layout behind cards (deep obsidian)
    surface: "#151a22", // elevated card / sider surface
    surfaceMuted: "#0f131a", // nested tile inside a panel
    border: "#222b38", // hairline-ish content borders (dark)
    hairline: "rgba(255, 255, 255, 0.09)", // card / panel hairline (dark)
    hairlineSoft: "rgba(255, 255, 255, 0.06)", // divider hairline (dark)

    // Light theme surfaces (the app supports both themes)
    lightCanvas: "#eef1f6",
    lightLayout: "#f1f3f6",
    lightSurface: "#ffffff",
    lightBorder: "#e2e8f0",

    // Accents
    indigo: "#6d7cf2", // primary interactive (dark) — echoes the landing glows
    blue: "#0f5fd7", // primary interactive (light)
    gold: "#e6b85c", // brand gold (logo, CTAs, shimmer)
    goldSoft: "#f6dfae",
    goldInk: "#170f02", // dark ink used on top of the gold CTA gradient

    // Semantic
    positive: "#34d399",
    negative: "#f87171",

    // Text
    onDark: "#f7fafc",
    onDarkMuted: "#a0aec0",
    onLight: "#0f172a",
    onLightMuted: "#64748b",

    // Type
    fontBody: `"Manrope", system-ui, -apple-system, "Segoe UI", sans-serif`,
    fontDisplay: `"Instrument Serif", ui-serif, Georgia, serif`,
    fontMetric: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`,
} as const
