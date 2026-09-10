import { describe, it, expect } from "vitest"
import {
    capitalize,
    calculateBalancesAcrossAccs,
    convertType,
    formatDollarClean,
    formatMStoReadableDuration,
    formattingTimeDurationFn,
    getOptions,
    normalizeToMs,
} from "@/utils/format"

describe("formatDollarClean", () => {
    it("formats whole numbers without trailing decimals", () => {
        expect(formatDollarClean(1000)).toBe("1,000")
        expect(formatDollarClean(0)).toBe("0")
        expect(formatDollarClean(-1234)).toBe("-1,234")
    })

    it("keeps two decimals for fractional values", () => {
        expect(formatDollarClean(1000.5)).toBe("1,000.50")
        expect(formatDollarClean(1234.567)).toBe("1,234.57")
        expect(formatDollarClean(-0.5)).toBe("-0.50")
    })
})

describe("normalizeToMs", () => {
    it("treats 10-digit numbers as seconds", () => {
        expect(normalizeToMs(1722470400)).toBe(1722470400000)
        expect(normalizeToMs("1722470400")).toBe(1722470400000)
    })

    it("passes through millisecond timestamps", () => {
        expect(normalizeToMs(1722470400000)).toBe(1722470400000)
    })

    it("parses ISO date strings", () => {
        expect(normalizeToMs("2024-08-01T00:00:00.000Z")).toBe(new Date("2024-08-01T00:00:00.000Z").valueOf())
    })

    it("returns NaN for invalid input", () => {
        expect(normalizeToMs("not-a-date")).toBeNaN()
        expect(normalizeToMs(undefined as unknown as string)).toBeNaN()
        expect(normalizeToMs(null as unknown as string)).toBeNaN()
    })
})

describe("formattingTimeDurationFn", () => {
    it("splits a duration into days/hours/mins/secs", () => {
        expect(formattingTimeDurationFn(3661000)).toEqual({ days: 0, hrs: 1, mins: 1, secs: 1 })
        expect(formattingTimeDurationFn(90061000)).toEqual({ days: 1, hrs: 1, mins: 1, secs: 1 })
        expect(formattingTimeDurationFn(0)).toEqual({ days: 0, hrs: 0, mins: 0, secs: 0 })
    })
})

describe("formatMStoReadableDuration", () => {
    it("formats zero and sub-second durations as 0s", () => {
        expect(formatMStoReadableDuration(0)).toBe("0s")
        expect(formatMStoReadableDuration(500)).toBe("0s")
    })

    it("joins non-zero units in order", () => {
        expect(formatMStoReadableDuration(90061000)).toBe("1d 1h 1m 1s")
        expect(formatMStoReadableDuration(3600000)).toBe("1h")
        expect(formatMStoReadableDuration(61000)).toBe("1m 1s")
    })
})

describe("convertType", () => {
    it("maps string literals to their JS equivalents", () => {
        expect(convertType("undefined")).toBeUndefined()
        expect(convertType("null")).toBeNull()
        expect(convertType("true")).toBe(true)
        expect(convertType("false")).toBe(false)
    })

    it("converts numeric strings to numbers and leaves others as-is", () => {
        expect(convertType("42")).toBe(42)
        expect(convertType("42.5")).toBe(42.5)
        expect(convertType("abc")).toBe("abc")
        expect(convertType("")).toBe("")
    })
})

describe("getOptions", () => {
    it("deduplicates and maps to value/label options", () => {
        expect(getOptions(["a", "b", "a"])).toEqual([
            { value: "a", label: "a" },
            { value: "b", label: "b" },
        ])
        expect(getOptions([])).toEqual([])
    })
})

describe("capitalize", () => {
    it("uppercases the first character only", () => {
        expect(capitalize("hello")).toBe("Hello")
        expect(capitalize("Hello")).toBe("Hello")
        expect(capitalize("hello world")).toBe("Hello world")
        expect(capitalize("")).toBe("")
    })
})

describe("calculateBalancesAcrossAccs", () => {
    it("sums the latest balance per unique address (ties resolve to the max amount)", () => {
        const result = calculateBalancesAcrossAccs([
            { address: "A", timestamp: "100", amount: 5 },
            { address: "A", timestamp: "200", amount: 9 },
            { address: "A", timestamp: "200", amount: 12 },
            { address: "B", timestamp: "100", amount: 3 },
        ])
        expect(result).toEqual({ amount: 15 })
    })

    it("returns zero for an empty dataset", () => {
        expect(calculateBalancesAcrossAccs([])).toEqual({ amount: 0 })
    })
})
