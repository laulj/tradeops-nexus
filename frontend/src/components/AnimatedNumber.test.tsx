import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AnimatedNumber from "@/components/AnimatedNumber"

type FrameCallback = (now: number) => void

let pendingFrame: FrameCallback | null = null

beforeEach(() => {
    pendingFrame = null
    // Deterministic clock so animation timing doesn't depend on wall time
    vi.stubGlobal("performance", { ...window.performance, now: () => 0 })
    vi.stubGlobal("requestAnimationFrame", (cb: FrameCallback) => {
        pendingFrame = cb
        return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const flushFrames = (...times: number[]) =>
    act(() => {
        for (const time of times) {
            pendingFrame?.(time)
        }
    })

describe("AnimatedNumber", () => {
    it("renders the initial value", () => {
        render(<AnimatedNumber value={100} />)
        expect(screen.getByText("100")).toBeInTheDocument()
    })

    it("animates to the new value and settles exactly on the target", () => {
        const { rerender } = render(<AnimatedNumber value={100} />)
        rerender(<AnimatedNumber value={200} />)

        // first frame starts the animation (progress 0), a later frame completes it
        flushFrames(0, 1000)

        expect(screen.getByText("200")).toBeInTheDocument()
    })

    it("cancels the pending animation on unmount", () => {
        const cancelSpy = vi.fn()
        vi.stubGlobal("cancelAnimationFrame", cancelSpy)

        const { rerender, unmount } = render(<AnimatedNumber value={100} />)
        rerender(<AnimatedNumber value={200} />) // schedules a frame

        unmount()

        expect(cancelSpy).toHaveBeenCalled()
    })
})
