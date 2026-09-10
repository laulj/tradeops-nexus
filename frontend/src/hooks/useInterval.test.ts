import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useInterval } from "@/hooks/useInterval"

afterEach(() => {
    vi.useRealTimers()
})

describe("useInterval", () => {
    it("invokes the callback repeatedly at the given interval", () => {
        vi.useFakeTimers()
        const callback = vi.fn()
        renderHook(() => useInterval(callback, 1000))

        expect(callback).not.toHaveBeenCalled()
        vi.advanceTimersByTime(2500)
        expect(callback).toHaveBeenCalledTimes(2)
    })

    it("always invokes the latest callback after re-render", () => {
        vi.useFakeTimers()
        const first = vi.fn()
        const second = vi.fn()
        const { rerender } = renderHook(({ cb }) => useInterval(cb, 1000), {
            initialProps: { cb: first },
        })

        rerender({ cb: second })
        vi.advanceTimersByTime(1000)

        expect(second).toHaveBeenCalledTimes(1)
        expect(first).not.toHaveBeenCalled()
    })

    it("clears the interval on unmount", () => {
        vi.useFakeTimers()
        const callback = vi.fn()
        const { unmount } = renderHook(() => useInterval(callback, 1000))

        unmount()
        vi.advanceTimersByTime(5000)

        expect(callback).not.toHaveBeenCalled()
    })
})
