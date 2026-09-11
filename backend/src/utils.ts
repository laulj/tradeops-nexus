import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import NodeCache from "node-cache"
import { normalizePairings } from "./databaseRouter"

export const EXCHANGE_NAME = ["bybit", "gate", "binance", "osm", "inj", "dydx", "hl", "bolt", "suil"] as const
export type EXCHANGE_NAME = typeof EXCHANGE_NAME
// Aggregate responses are expensive to build (unpaginated joins plus sorts), so
// the TTL matches the client's 5-minute React Query staleTime; ingestion writes
// clear the affected account's entries early (see invalidateUserCache).
export const aggCache = new NodeCache({ stdTTL: 300 }) // Cache for 5 minutes

export type pairing = {
    baseSymbol: string
    quoteSymbol: string
}
export const generateCacheKey = (params: {
    endpoint: string
    type: "spot" | "spotFuture" | "fundingRate"
    username: string
    address: string
    interval: string
    pairings: pairing[]
    page?: string
    limit?: string
    timestampBegin?: string
    timestampEnd?: string
}): string => {
    const { endpoint, type, username, address, interval, pairings, page, limit, timestampBegin, timestampEnd } = params

    // 1. Create a deterministic raw string
    const rawKey = [
        type,
        username,
        address,
        interval,
        normalizePairings(pairings),
        page ?? "",
        limit ?? "",
        timestampBegin ?? "",
        timestampEnd ?? "",
        // Add others: params.startDate, params.endDate
    ].join("|") // Use a delimiter that doesn't appear in your data

    // 2. Hash it to keep the key short and safe
    const hash = keccak256(utf8ToBytes(rawKey))
    //   crypto.createHash('sha256').update(rawKey).digest('hex');
    // 3. Add a semantic prefix for easy invalidation/monitoring. The username is
    // kept in the clear so one account's entries can be dropped precisely.
    return `${endpoint}:${username}:${hash}`
}

/** Drop every cached aggregate for one account (used after an ingestion write). */
export const invalidateUserCache = (username?: string) => {
    if (!username) return
    const marker = `:${username}:`
    for (const key of aggCache.keys()) if (key.includes(marker)) aggCache.del(key)
}
export function getGroupByExpression(interval: string, tableName: string) {
    const dateExpr = `datetime(${tableName}.timestamp / 1000, 'unixepoch')`
    switch (interval) {
        case "Daily":
            return {
                expr: `strftime("%Y-%m-%d", ${dateExpr})`,
                format: "%Y-%m-%d", // used for strftime placeholder
            }
        case "Weekly":
            return {
                expr: `strftime('%Y-%W', ${dateExpr})`,
                format: "%Y-%W",
            }
        case "Monthly":
            return {
                expr: `strftime('%Y-%m', ${dateExpr})`,
                format: "%Y-%m",
            }
        case "Quarterly":
            return {
                expr: `strftime('%Y', ${dateExpr}) || '-Q' || ((strftime('%m', ${dateExpr}) - 1) / 3 + 1)`,
                format: null, // no simple strftime format
            }
        case "Yearly":
            return {
                expr: `strftime('%Y', ${dateExpr})`,
                format: "%Y",
            }
        default:
            throw new Error("Invalid interval")
    }
}
export function parseYearWeek(yearWeekStr: string) {
    // 1. Split the string into Year and Week numbers
    const [year, week] = yearWeekStr.split("-").map(Number)

    // 2. Start at January 1st of that year
    const targetDate = new Date(year, 0, 1)

    // 3. Get the day of the week for Jan 1st (0 = Sunday, 1 = Monday, etc.)
    const dayOfWeek = targetDate.getDay()

    // 4. Calculate the offset to the first Monday of the year
    // %W convention states Week 01 is the first week containing a Monday.
    const daysToFirstMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7

    // 5. Add weeks and the Monday offset to January 1st
    // (week - 1) because we are already in the first week area
    const totalDaysOffset = daysToFirstMonday + (week - 1) * 7

    targetDate.setDate(targetDate.getDate() + totalDaysOffset)

    return targetDate
}

export const determineSpotFutureExchanges = (data: any, keys: string[]) => {
    let OPExchangeName: {
        ex1: { name: string; id: string; tokenIn: string; tokenOut: string } | undefined
        ex2: { name: string; id: string; tokenIn: string; tokenOut: string } | undefined
    } = {
        ex1: undefined,
        ex2: undefined,
    }
    let CPExchangeName: {
        ex1: { name: string; id: string; tokenIn: string; tokenOut: string } | undefined
        ex2: { name: string; id: string; tokenIn: string; tokenOut: string } | undefined
    } = {
        ex1: undefined,
        ex2: undefined,
    }
    for (const key of keys) {
        // console.log("init, key", key, JSON.stringify(OPExchangeName, null, " "))
        if (data[`OP${key}Id`] !== null) {
            if (!OPExchangeName.ex1 || (OPExchangeName.ex1 && OPExchangeName.ex1["id"] === data[`OP${key}Id`]))
                OPExchangeName.ex1 = {
                    name: key,
                    id: data[`OP${key}Id`],
                    tokenIn: data[`OP${key}TokenIn`],
                    tokenOut: data[`OP${key}TokenOut`],
                }
            else
                OPExchangeName.ex2 = {
                    name: key,
                    id: data[`OP${key}Id`],
                    tokenIn: data[`OP${key}TokenIn`],
                    tokenOut: data[`OP${key}TokenOut`],
                }
        }

        if (data[`CP${key}Id`] !== null) {
            if (!CPExchangeName.ex1 || (CPExchangeName.ex1 && CPExchangeName.ex1["id"] === data[`CP${key}Id`]))
                CPExchangeName.ex1 = {
                    name: key,
                    id: data[`CP${key}Id`],
                    tokenIn: data[`CP${key}TokenIn`],
                    tokenOut: data[`CP${key}TokenOut`],
                }
            else
                CPExchangeName.ex2 = {
                    name: key,
                    id: data[`CP${key}Id`],
                    tokenIn: data[`CP${key}TokenIn`],
                    tokenOut: data[`CP${key}TokenOut`],
                }
        }
    }

    return { OPExchangeName, CPExchangeName }
}
export const determineFRExchangesData = (data: any, keys: string[]) => {
    let OPExchangeName: {
        ex1:
            | {
                  name: string
                  id: string
                  tokenIn: string
                  tokenOut: string
                  price: string
                  orderFee: string
                  fundingFee: string
              }
            | undefined
        ex2:
            | {
                  name: string
                  id: string
                  tokenIn: string
                  tokenOut: string
                  price: string
                  orderFee: string
                  fundingFee: string
              }
            | undefined
    } = {
        ex1: undefined,
        ex2: undefined,
    }
    let CPExchangeName: {
        ex1:
            | {
                  name: string
                  id: string
                  tokenIn: string
                  tokenOut: string
                  price: string
                  orderFee: string
                  fundingFee: string
              }
            | undefined
        ex2:
            | {
                  name: string
                  id: string
                  tokenIn: string
                  tokenOut: string
                  price: string
                  orderFee: string
                  fundingFee: string
              }
            | undefined
    } = {
        ex1: undefined,
        ex2: undefined,
    }
    for (const key of keys) {
        // console.log("init, key", key, JSON.stringify(OPExchangeName, null, " "))
        if (data[`OP${key}Id`] !== null) {
            if (!OPExchangeName.ex1 || (OPExchangeName.ex1 && OPExchangeName.ex1["id"] === data[`OP${key}Id`]))
                OPExchangeName.ex1 = {
                    name: key,
                    id: data[`OP${key}Id`],
                    tokenIn: data[`OP${key}TokenIn`],
                    tokenOut: data[`OP${key}TokenOut`],
                    price: data[`OP${key}Price`],
                    orderFee: data[`OP${key}OrderFee`],
                    fundingFee: data[`OP${key}FundingFee`],
                }
            else
                OPExchangeName.ex2 = {
                    name: key,
                    id: data[`OP${key}Id`],
                    tokenIn: data[`OP${key}TokenIn`],
                    tokenOut: data[`OP${key}TokenOut`],
                    price: data[`OP${key}Price`],
                    orderFee: data[`OP${key}OrderFee`],
                    fundingFee: data[`OP${key}FundingFee`],
                }
        }

        if (data[`CP${key}Id`] !== null) {
            if (!CPExchangeName.ex1 || (CPExchangeName.ex1 && CPExchangeName.ex1["id"] === data[`CP${key}Id`]))
                CPExchangeName.ex1 = {
                    name: key,
                    id: data[`CP${key}Id`],
                    tokenIn: data[`CP${key}TokenIn`],
                    tokenOut: data[`CP${key}TokenOut`],
                    price: data[`CP${key}Price`],
                    orderFee: data[`CP${key}OrderFee`],
                    fundingFee: data[`CP${key}FundingFee`],
                }
            else
                CPExchangeName.ex2 = {
                    name: key,
                    id: data[`CP${key}Id`],
                    tokenIn: data[`CP${key}TokenIn`],
                    tokenOut: data[`CP${key}TokenOut`],
                    price: data[`CP${key}Price`],
                    orderFee: data[`CP${key}OrderFee`],
                    fundingFee: data[`CP${key}FundingFee`],
                }
        }
    }

    return { OPExchangeName, CPExchangeName }
}
