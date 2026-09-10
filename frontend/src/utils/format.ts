import type { balanceResponse } from "@/types"

export const convertType = function (value: string) {
    if (!value) return value
    if (value === "undefined") return undefined
    if (value === "null") return null
    if (value === "true") return true
    if (value === "false") return false
    const v = Number(value)
    return isNaN(v) ? value : v
}
/**
 * Formats a numeric value into a clean US dollar string, removing trailing decimals if they are zero.
 * @param amount - The numeric dollar value to format
 * @returns A formatted string (e.g., 1000 -> "$1,000", 1000.5 -> "$1,000.50")
 */

export function formatDollarClean(amount: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "decimal",
        currency: "USD",
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(amount)
}

/**
 * Safe utility to parse either a Date string or a Unix timestamp (seconds or milliseconds)
 * Returns Unix epoch time in milliseconds, or NaN if invalid.
 */

export const normalizeToMs = (timestamp: string | number): number => {
    if (timestamp === undefined || timestamp === null) return NaN

    // 1. If it is purely numeric (or a numeric string like "1722470400"), treat as Unix
    if (!isNaN(Number(timestamp))) {
        const num = Number(timestamp)

        // Check if the number is in seconds (10 digits) or milliseconds (13 digits)
        // e.g., 1722470400 vs 1722470400000
        return num < 100000000000 ? num * 1000 : num
    }

    // 2. If it is a date string (like "2024-08-01" or ISO strings), parse using standard Date
    const parsedDate = new Date(timestamp)
    return parsedDate.valueOf()
}


export const formattingTimeDurationFn = (value: number) => {
    const seconds = (value / 1000) % 60
    const minutes = (value / 1000 / 60) % 60
    const hours = (value / 1000 / 60 / 60) % 24
    const days = value / 1000 / 60 / 60 / 24

    return {
        days: Math.floor(days),
        hrs: Math.floor(hours),
        mins: Math.floor(minutes),
        secs: Math.floor(seconds),
    }
}

export function formatMStoReadableDuration(x: number): string {
    const seconds = Math.floor(x / 1000)
    const days = Math.floor(seconds / (24 * 3600))
    const hours = Math.floor((seconds % (24 * 3600)) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts: string[] = []

    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    if (secs > 0) parts.push(`${secs}s`)

    // Return '0s' if all units are zero
    return parts.length > 0 ? parts.join(" ") : "0s"
}
// Custom interval hook

export const calculateBalancesAcrossAccs = (balanceData: balanceResponse[]) => {
    let total_amount = 0
    const uniqueAdress: Set<string> = new Set()
    balanceData.map(({ address }) => {
        if (!uniqueAdress.has(address)) uniqueAdress.add(address)
    })

    uniqueAdress.forEach((Uaddress) => {
        let uniqueLatestBalance = 0
        let latestTimestamp = ""

        balanceData.map(({ timestamp, address }) => {
            if (Uaddress === address) {
                if (Number(latestTimestamp) <= Number(timestamp)) latestTimestamp = timestamp
            }
        })

        balanceData.map(({ timestamp, address, amount }) => {
            if (Uaddress === address) {
                if (Number(latestTimestamp) === Number(timestamp)) if (uniqueLatestBalance < amount) uniqueLatestBalance = amount
            }
        })

        total_amount += uniqueLatestBalance
    })
    return { amount: total_amount }
}


export const getOptions = (opts: string[]) => {
    const uniqueOpts = new Set<string>(opts)
    opts = Array.from(uniqueOpts)
    const toreturn = opts
        .map((opt) => {
            return { value: opt, label: opt }
        })
        .filter((value) => value !== undefined)

    return toreturn
}


export function capitalize(str: string): string {
    if (!str) return str
    return str.charAt(0).toUpperCase() + str.slice(1)
}

