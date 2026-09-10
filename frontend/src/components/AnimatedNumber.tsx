import React, { useState, useEffect, useRef } from "react"

interface AnimatedNumberProps {
    value: number
    decimalPlaces?: number
}
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 4)
const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, decimalPlaces = 2 }) => {
    const [displayValue, setDisplayValue] = useState(value)
    const animationRef = useRef<number | null>(null)
    const prevValueRef = useRef(value)

    useEffect(() => {
        const start = performance.now()
        const duration = 500
        const from = prevValueRef.current
        const to = value

        if (from === to) return

        const animate = (now: number) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = easeOutCubic(progress)
            const current = Number((from + (to - from) * eased).toFixed(decimalPlaces))

            setDisplayValue(current)

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate)
            } else {
                prevValueRef.current = to
                setDisplayValue(value)
            }
        }

        animationRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationRef.current !== null) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [value])

    return <div style={{ transition: "color 0.3s ease" }}>{displayValue}</div>
}

export default AnimatedNumber
