import { describe, expect, it, beforeEach } from "vitest"
import { clearSessionExpiry, formatRemaining, readSessionExpiry, rememberSessionExpiry } from "./sessionExpiry"

// The countdown is the only thing telling a playground visitor that their data is
// temporary, so the deadline has to survive a remount and read honestly.

const minute = 60 * 1000

describe("session expiry storage", () => {
    beforeEach(() => localStorage.clear())

    it("round-trips a deadline", () => {
        rememberSessionExpiry(1_800_000_000_000)

        expect(readSessionExpiry()).toBe(1_800_000_000_000)
    })

    it("treats a permanent account as no deadline", () => {
        rememberSessionExpiry(1_800_000_000_000)
        rememberSessionExpiry(null)

        expect(readSessionExpiry()).toBeNull()
    })

    it("ignores nonsense values", () => {
        rememberSessionExpiry(Number.NaN)
        expect(readSessionExpiry()).toBeNull()

        localStorage.setItem("tradeopsNexus.sessionExpiresAt", "not-a-number")
        expect(readSessionExpiry()).toBeNull()
    })

    it("clears on demand", () => {
        rememberSessionExpiry(1_800_000_000_000)
        clearSessionExpiry()

        expect(readSessionExpiry()).toBeNull()
    })
})

describe("formatRemaining", () => {
    const now = 1_800_000_000_000

    it("counts down in minutes and seconds under an hour", () => {
        expect(formatRemaining(now + 9 * minute + 42_000, now)).toBe("9:42")
    })

    it("switches to hours above an hour", () => {
        expect(formatRemaining(now + 65 * minute, now)).toBe("1 h 05 m")
    })

    it("is empty once the deadline has passed", () => {
        expect(formatRemaining(now - 1, now)).toBe("")
    })
})
