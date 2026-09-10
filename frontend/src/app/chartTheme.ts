// ── Shared chart theme (G2 / @ant-design/plots) ─────────────────────────────
// Single source of truth for axis, grid, slider and palette colours so every
// chart in the app reads as the same product as the landing page. Colours are
// derived from `brand` and switch on the AntD `MenuTheme` ("dark" | "light").
import { brand } from "./brand"

export type ChartTheme = "dark" | "light"

export interface ChartTokens {
    /** Gradient stop at the low end (transparent-ish top of area/column). */
    fillFrom: string
    /** Gradient stop at the high end (saturated colour). */
    fillTo: string
    /** Solid stroke used for line series. */
    line: string
    axisLabel: string
    gridLine: string
    sliderText: string
    sliderHandle: string
    /** Categorical palette for pie / multi-series charts. */
    palette: string[]
}

export const chartTokens = (theme: ChartTheme): ChartTokens =>
    theme === "dark"
        ? {
              fillFrom: "rgba(109, 124, 242, 0.05)",
              fillTo: "rgba(52, 211, 153, 0.55)",
              line: brand.positive,
              axisLabel: brand.onDarkMuted,
              gridLine: "rgba(255, 255, 255, 0.06)",
              sliderText: brand.onDarkMuted,
              sliderHandle: brand.surface,
              palette: [brand.positive, brand.indigo, brand.gold, brand.negative, "#38bdf8"],
          }
        : {
              fillFrom: "rgba(15, 95, 215, 0.05)",
              fillTo: "rgba(15, 157, 99, 0.45)",
              line: "#0f9d63",
              axisLabel: brand.onLightMuted,
              gridLine: "#e2e8f0",
              sliderText: brand.onLightMuted,
              sliderHandle: "#f0f0f0",
              palette: ["#0f9d63", "#0f5fd7", "#c98a1e", "#dc2626", "#0284c7"],
          }

/** Vertical gradient fill string for area / column series. */
export const seriesFill = (theme: ChartTheme): string => {
    const t = chartTokens(theme)
    return `linear-gradient(-90deg, ${t.fillFrom} 0%, ${t.fillTo} 100%)`
}

/** Gradient fill string for the nth slice of a pie/donut. */
export const sliceFill = (theme: ChartTheme, index: number): string => {
    const t = chartTokens(theme)
    const base = t.palette[index % t.palette.length]
    const glow = theme === "dark" ? "rgba(255, 255, 255, 0.72)" : "rgba(255, 255, 255, 0.35)"
    return `linear-gradient(-90deg, ${glow} 0%, ${base} 100%)`
}
