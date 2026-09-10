import React from "react"

// Tiny inline SVG sparkline — used by metric tiles and the landing desks.
export const Sparkline: React.FC<{
    values: number[]
    color?: string
    width?: number
    height?: number
    className?: string
}> = ({ values, color = "#34d399", width = 96, height = 26, className }) => {
    if (values.length < 2) return <span className="font-metric text-[10px] text-zinc-600">—</span>
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const step = width / (values.length - 1)
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`)
    const last = pts[pts.length - 1]
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`overflow-visible ${className ?? ""}`} aria-hidden>
            <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx={last.split(",")[0]} cy={last.split(",")[1]} r="2" fill={color} />
        </svg>
    )
}
