import React from "react"

// Live status pulse — mirrors the landing page's `landing-ping` dot, but defined
// app-side so it works without the (lazy) landing bundle.
export const LiveDot: React.FC<{ label?: string; className?: string }> = ({ label = "live", className }) => (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
        <span className="relative flex h-2 w-2">
            <span className="nexus-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="font-metric text-[10px] uppercase tracking-[0.18em] text-emerald-300">{label}</span>
    </span>
)
