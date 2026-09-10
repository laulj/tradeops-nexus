import React from "react"

export type TagTone = "earn" | "pay" | "muted" | "gold" | "sky" | "indigo"

// Tone-coded micro tag (the pill language from the landing arbitrage desks).
export const Tag: React.FC<{ tone?: TagTone; children: React.ReactNode; className?: string }> = ({
    tone = "muted",
    children,
    className,
}) => <span className={`nexus-tag nexus-tag--${tone} ${className ?? ""}`}>{children}</span>
