import React from "react"

// The mock's micro section label: mono, uppercase, wide tracking, muted.
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <p className={`font-metric text-[10px] uppercase tracking-[0.2em] text-zinc-500 ${className ?? ""}`}>{children}</p>
)
