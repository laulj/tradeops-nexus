import React from "react"
import { Sparkline } from "./Sparkline"

export type MetricTone = "positive" | "negative" | "gold" | "neutral"

// Flat metric tile from the mock: micro label + mono value + optional sub-line,
// icon and sparkline. Grid-driven (no fixed widths) so it is responsive by default.
export const MetricTile: React.FC<{
    label: string
    value: React.ReactNode
    sub?: React.ReactNode
    icon?: React.ReactNode
    tone?: MetricTone
    spark?: number[]
    sparkColor?: string
    className?: string
    /** Show a shimmer in place of the value while its query is still in flight. */
    loading?: boolean
}> = ({ label, value, sub, icon, tone = "neutral", spark, sparkColor, className, loading = false }) => (
    <div className={`nexus-tile rounded-lg p-3 text-left sm:p-4 ${className ?? ""}`} aria-busy={loading}>
        <div className="flex items-center justify-between gap-2">
            <span className="font-metric text-[9px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
            {icon && <span className="shrink-0 leading-none">{icon}</span>}
        </div>
        {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-zinc-500/20 sm:h-8" aria-hidden />
        ) : (
            <div className={`mt-2 font-metric text-xl font-semibold tabular-nums sm:text-2xl nexus-metric--${tone}`}>{value}</div>
        )}
        {sub && <div className="mt-1 font-metric text-[10px] text-zinc-500">{sub}</div>}
        {spark && spark.length > 1 && (
            <div className="mt-2">
                <Sparkline values={spark} color={sparkColor} width={120} height={24} />
            </div>
        )}
    </div>
)
