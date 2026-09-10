import React from "react"
import { SectionLabel } from "./SectionLabel"

// Glass surface panel — the app's replacement for AntD's `Card` inside content.
// Renders the mock's header (micro label on the left, optional control on the
// right) and a padded body.
export const Panel: React.FC<{
    label?: React.ReactNode
    right?: React.ReactNode
    className?: string
    bodyClassName?: string
    children: React.ReactNode
}> = ({ label, right, className, bodyClassName, children }) => (
    <section className={`nexus-glass rounded-2xl ${className ?? ""}`}>
        {(label || right) && (
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 sm:px-5">
                {label ? <SectionLabel>{label}</SectionLabel> : <span />}
                {right}
            </header>
        )}
        <div className={`px-4 pt-3 pb-4 sm:px-5 sm:pb-5 ${bodyClassName ?? ""}`}>{children}</div>
    </section>
)
