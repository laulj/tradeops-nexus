import React from "react"

export interface PillOption<T extends string> {
    value: T
    label: React.ReactNode
}

// Gold-active segmented control matching the landing desks' tab pills.
export function SegmentedPill<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
}: {
    options: readonly PillOption<T>[]
    value: T
    onChange: (value: T) => void
    ariaLabel?: string
    className?: string
}) {
    return (
        <div role="tablist" aria-label={ariaLabel} className={`nexus-pill ${className ?? ""}`}>
            {options.map((option) => {
                const active = option.value === value
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-active={active}
                        className="nexus-pill-btn"
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
