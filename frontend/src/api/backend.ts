import { HTTPMethod, apiClient } from "@/api/client"
import {
    CEXNames,
    DEXNames,
    tradeTypes,
    type balanceResponse,
    type spotFutureOP,
    type FRComparisonTableData,
    type fundingRateOP,
    EXNames,
    type pairing,
    type rawProfitResp,
    type aggregatedProfitResp,
    views,
} from "@/types"
import type { TablePaginationConfig } from "antd"
import { backendStatus } from "@/types"

// Backend base URL. Defaults to same-origin ("/") so the app never hard-codes
// an insecure HTTP endpoint. Override at build time with VITE_API_BASE_URL
// (e.g. "https://api.example.com/"). During `vite dev` / `vite preview`, the
// /login /logout /status /data prefixes are proxied to the backend (see
// vite.config.ts).
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
export const baseUrl = rawBaseUrl ? (rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`) : "/"

export const getStatus = async (data: string[]) => {
    const queryUrl = baseUrl + "status"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        const response = await apiClient<{
            [key: string]: { [key: string]: backendStatus }
        }>(queryUrl, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
            data: {
                method: HTTPMethod.POST,
                data,
            },
        })
        return response
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const getUptime = async (address: string, symbol: string) => {
    const queryUrl = baseUrl + "status/uptime"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        const response = await apiClient<{
            [key: string]: { start: string; end: string }
        }>(queryUrl, {
            data: {
                method: HTTPMethod.POST,
                address,
                symbol,
            },
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })
        return response
    } catch (error) {
        console.log(queryUrl, error)
    }
}

// ── Admin: user management ────────────────────────────────────────────────
export type UserInfo = {
    username: string
    created_at: number
    demo_populated: number
}

export const getUsers = async (): Promise<UserInfo[] | undefined> => {
    const queryUrl = baseUrl + "users"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        const response = await apiClient<{ users: UserInfo[] }>(queryUrl, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })
        return response.users
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const deleteUser = async (username: string): Promise<boolean> => {
    const queryUrl = baseUrl + "users/" + encodeURIComponent(username)
    const token = localStorage.getItem("accessToken")
    if (!token) return false

    try {
        await apiClient(queryUrl, {
            data: { method: HTTPMethod.DELETE },
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })
        return true
    } catch (error) {
        console.log(queryUrl, error)
        return false
    }
}

export const getBalanceBatch = async (symbols: string[]): Promise<{ [key: string]: balanceResponse[] } | undefined> => {
    const queryUrl = baseUrl + "data/balance/symbol/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined
    try {
        return await apiClient<{ [key: string]: balanceResponse[] }>(queryUrl, {
            data: { symbols },
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        })
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const getRawProfitDetailsBatch = async (
    pairings: pairing[],
    page: number = 1,
    limit: number = 50,
    address?: string,
    timestamp_begin?: number,
    timestamp_end?: number,
): Promise<{ data: { [key: string]: rawProfitResp[] }; pagination: { current: number; pageSize: number; total: number } } | undefined> => {
    const queryUrl = baseUrl + "data/profits-details/pairing/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        return await apiClient<{ data: { [key: string]: rawProfitResp[] }; pagination: { current: number; pageSize: number; total: number } }>(
            queryUrl,
            {
                data: { pairings, address, timestamp_begin, timestamp_end, page, limit },
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            },
        )
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const getAggregatedProfitDetailsBatch = async (
    pairings: pairing[],
    interval: views,
    page?: number,
    limit?: number,
    address?: string,
    timestamp_begin?: number,
    timestamp_end?: number,
): Promise<{ data: { [key: string]: aggregatedProfitResp[] }; pagination: { current: number; pageSize: number; total: number } } | undefined> => {
    const queryUrl = baseUrl + "data/profits-details/pairing/aggregated/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        return await apiClient<{ data: { [key: string]: aggregatedProfitResp[] }; pagination: { current: number; pageSize: number; total: number } }>(
            queryUrl,
            {
                data: { pairings, address, interval, timestamp_begin, timestamp_end, page, limit },
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            },
        )
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

// Fetch all unique addresses

export const getAddresses = async (): Promise<string[]> => {
    // if (cachedAddresses) return cachedAddresses // ✅ Return cached data immediately
    const queryUrl = baseUrl + "data/addresses"
    const token = localStorage.getItem("accessToken")
    if (!token) return []

    try {
        const response = await apiClient<{ addresses: string[] }>(queryUrl, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })
        return response.addresses
    } catch (error) {
        console.log(queryUrl, error)
        return []
    }
}

export const getSpotSymbols = async (): Promise<string[]> => {
    // if (cachedSymbols) return cachedSymbols // ✅ Return cached data immediately
    const queryUrl = baseUrl + "data/symbols"
    const token = localStorage.getItem("accessToken")
    if (!token) return []
    try {
        const response = await apiClient<{ symbols: string[] }>(queryUrl, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })

        return response.symbols || []
    } catch (error) {
        console.log(queryUrl, error)
        return []
    }
}

export const getSpotFutureSymbols = async (): Promise<string[]> => {
    const queryUrl = baseUrl + "data/spotFuture/symbols"
    const token = localStorage.getItem("accessToken")
    if (!token) return []

    try {
        const response = await apiClient<{ symbols: string[] }>(queryUrl, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })

        return response.symbols || []
    } catch (error) {
        console.log(queryUrl, error)
        return []
    }
}

export const getFundingRateSymbols = async (): Promise<string[]> => {
    const queryUrl = baseUrl + "data/fRate/symbols"
    const token = localStorage.getItem("accessToken")
    if (!token) return []

    try {
        const response = await apiClient<{ symbols: string[] }>(queryUrl, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })
        return response.symbols || []
    } catch (error) {
        console.log(queryUrl, error)
        return []
    }
}
// *****

export const getSpotFutureOpenedPositions = async (timestamp_begin?: number, timestamp_end?: number) => {
    const symbol = "USDC"
    const queryUrl = baseUrl + "data/spotFuture/openedPositions"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        let response = await apiClient<spotFutureOP[]>(queryUrl, {
            data: {
                timestamp_begin,
                timestamp_end,
            },
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })

        response = response.map((profit) => {
            let cexName = CEXNames.filter((name) => name !== "hl").find((name) => {
                if (profit[(name + "Id") as keyof typeof profit]) return name
            })
            let dexName = DEXNames.filter((name) => name !== "hl").find((name) => {
                if (profit[(name + "Id") as keyof typeof profit]) return name
            })
            if (!cexName)
                cexName = CEXNames.find((name) => {
                    if (profit[(name + "Id") as keyof typeof profit]) return name
                })
            if (!dexName)
                dexName = DEXNames.find((name) => {
                    if (profit[(name + "Id") as keyof typeof profit]) return name
                })

            if (!cexName || !dexName) throw new Error(`Could not derive cex or dex name from: ${JSON.stringify(profit, null, "  ")}`)
            if (profit[(dexName + "TokenIn") as keyof typeof profit] && profit[(dexName + "TokenIn") as keyof typeof profit] !== symbol)
                return {
                    ...profit,
                    coin: profit[(dexName + "TokenIn") as keyof typeof profit] as string,
                    cexName,
                    dexName,
                    txHash: profit[(dexName + "Id") as keyof typeof profit] as string,
                    orderId: profit[(cexName + "Id") as keyof typeof profit] as string,
                }
            else if (profit[(dexName + "TokenOut") as keyof typeof profit] && profit[(dexName + "TokenOut") as keyof typeof profit] !== symbol)
                return {
                    ...profit,
                    coin: profit[(dexName + "TokenOut") as keyof typeof profit] as string,
                    cexName,
                    dexName,
                    txHash: profit[(dexName + "Id") as keyof typeof profit] as string,
                    orderId: profit[(cexName + "Id") as keyof typeof profit] as string,
                }
            else if (profit[(cexName + "TokenIn") as keyof typeof profit] && profit[(cexName + "TokenIn") as keyof typeof profit] !== symbol)
                return {
                    ...profit,
                    coin: profit[(cexName + "TokenIn") as keyof typeof profit] as string,
                    cexName,
                    dexName,
                    txHash: profit[(dexName + "Id") as keyof typeof profit] as string,
                    orderId: profit[(cexName + "Id") as keyof typeof profit] as string,
                }
            else if (profit[(cexName + "TokenOut") as keyof typeof profit] && profit[(cexName + "TokenOut") as keyof typeof profit] !== symbol)
                return {
                    ...profit,
                    coin: profit[(cexName + "TokenOut") as keyof typeof profit] as string,
                    cexName,
                    dexName,
                    txHash: profit[(dexName + "Id") as keyof typeof profit] as string,
                    orderId: profit[(cexName + "Id") as keyof typeof profit] as string,
                }

            return profit
        })

        return response
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const removedSpotFutureOpenedPosition = async (openingId: string) => {
    const queryUrl = baseUrl + "data/spotFuture/openedPositions/update"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        const response = await fetch(queryUrl, {
            method: "PUT",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                {
                    id: 0,
                    timestamp: 0,
                    openingId,
                },
            ]),
        })
        if (response.status === 201) return await response.json()
        else return false
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const getRawSpotFutureProfitDetailsBatch = async (
    pairings: pairing[],
    page: number = 1,
    limit: number = 50,
    address?: string,
    timestamp_begin?: number,
    timestamp_end?: number,
): Promise<{ data: { [key: string]: rawProfitResp[] }; pagination: { current: number; pageSize: number; total: number } } | undefined> => {
    const queryUrl = baseUrl + "data/spotFuture/profits-details/pairing/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        const resp = await apiClient<{ data: { [key: string]: rawProfitResp[] }; pagination: { current: number; pageSize: number; total: number } }>(
            queryUrl,
            {
                data: { pairings, address, timestamp_begin, timestamp_end, page, limit },
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            },
        )

        return resp
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const getAggregatedSpotFutureProfitDetailsBatch = async (
    pairings: pairing[],
    interval: views,
    page: number = 1,
    limit: number = 50,
    address?: string,
    timestamp_begin?: number,
    timestamp_end?: number,
): Promise<{ data: { [key: string]: aggregatedProfitResp[] }; pagination: { current: number; pageSize: number; total: number } } | undefined> => {
    const queryUrl = baseUrl + "data/spotFuture/profits-details/pairing/aggregated/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        return await apiClient<{ data: { [key: string]: aggregatedProfitResp[] }; pagination: { current: number; pageSize: number; total: number } }>(
            queryUrl,
            {
                data: { pairings, address, interval, timestamp_begin, timestamp_end, page, limit },
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            },
        )
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const getFRTableData = async () => {
    const queryUrl = baseUrl + "data/fRate/fundingRateTableData"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        const response = await apiClient<FRComparisonTableData[]>(queryUrl, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
            data: {
                method: HTTPMethod.POST,
            },
        })
        return response
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const getFRateOpenedPositions = async (timestamp_begin?: number, timestamp_end?: number) => {
    const symbol = "USDC"
    const queryUrl = baseUrl + "data/fRate/openedPositions"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        let response = await apiClient<fundingRateOP[]>(queryUrl, {
            data: {
                timestamp_begin,
                timestamp_end,
            },
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        })

        response = response.map((profit) => {
            const ex1Name = EXNames.find((name) => {
                if (profit[(name + "Id") as keyof typeof profit]) return name
            })
            const ex2Name = EXNames.find((name) => {
                if (name !== ex1Name && profit[(name + "Id") as keyof typeof profit]) return name
            })

            if (!ex1Name || !ex2Name) throw new Error(`Could not derive EX1 or EX2 name from: ${JSON.stringify(profit, null, "  ")}`)

            const EX1Data = {
                    ex1Name,
                    ex1OrderId: profit[(ex1Name + "Id") as keyof typeof profit] as string,
                    ex1FundingFee: profit[(ex1Name + "FundingFee") as keyof typeof profit] as number,
                    ex1Price: profit[(ex1Name + "Price") as keyof typeof profit] as number,
                    ex1OrderFee: profit[(ex1Name + "OrderFee") as keyof typeof profit] as number,
                },
                EX2Data = {
                    ex2Name,
                    ex2OrderId: profit[(ex2Name + "Id") as keyof typeof profit] as string,
                    ex2FundingFee: profit[(ex2Name + "FundingFee") as keyof typeof profit] as number,
                    ex2Price: profit[(ex2Name + "Price") as keyof typeof profit] as number,
                    ex2OrderFee: profit[(ex2Name + "OrderFee") as keyof typeof profit] as number,
                }
            let coin = ""
            if (profit[(ex2Name + "TokenIn") as keyof typeof profit] && profit[(ex2Name + "TokenIn") as keyof typeof profit] !== symbol)
                coin = profit[(ex2Name + "TokenIn") as keyof typeof profit] as string
            else if (profit[(ex2Name + "TokenOut") as keyof typeof profit] && profit[(ex2Name + "TokenOut") as keyof typeof profit] !== symbol)
                coin = profit[(ex2Name + "TokenOut") as keyof typeof profit] as string
            else if (profit[(ex1Name + "TokenIn") as keyof typeof profit] && profit[(ex1Name + "TokenIn") as keyof typeof profit] !== symbol)
                coin = profit[(ex1Name + "TokenIn") as keyof typeof profit] as string
            else if (profit[(ex1Name + "TokenOut") as keyof typeof profit] && profit[(ex1Name + "TokenOut") as keyof typeof profit] !== symbol)
                coin = profit[(ex1Name + "TokenOut") as keyof typeof profit] as string

            return { ...profit, coin, ...EX1Data, ...EX2Data }
        })
        return response
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const removedFRateOpenedPosition = async (openingId: string) => {
    const queryUrl = baseUrl + "data/fRate/openedPositions/update"
    const token = localStorage.getItem("accessToken")
    if (!token) return

    try {
        const response = await fetch(queryUrl, {
            method: "PUT",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                {
                    id: 0,
                    timestamp: 0,
                    openingId,
                },
            ]),
        })
        if (response.status === 201) return await response.json()
        else return false
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const getRawFundingRProfitDetailsBatch = async (
    pairings: pairing[],
    page: number = 1,
    limit: number = 50,
    address?: string,
    timestamp_begin?: number,
    timestamp_end?: number,
): Promise<{ data: { [key: string]: rawProfitResp[] }; pagination: { current: number; pageSize: number; total: number } } | undefined> => {
    const queryUrl = baseUrl + "data/fRate/profits-details/pairing/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        const resp = await apiClient<{ data: { [key: string]: rawProfitResp[] }; pagination: { current: number; pageSize: number; total: number } }>(
            queryUrl,
            {
                data: { pairings, address, timestamp_begin, timestamp_end, page, limit },
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            },
        )

        return resp
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const getAggregatedFundingRProfitDetailsBatch = async (
    pairings: pairing[],
    interval: views,
    page: number = 1,
    limit: number = 50,
    address?: string,
    timestamp_begin?: number,
    timestamp_end?: number,
): Promise<{ data: { [key: string]: aggregatedProfitResp[] }; pagination: { current: number; pageSize: number; total: number } } | undefined> => {
    const queryUrl = baseUrl + "data/fRate/profits-details/pairing/aggregated/batch"
    const token = localStorage.getItem("accessToken")
    if (!token) return undefined

    try {
        return await apiClient<{ data: { [key: string]: aggregatedProfitResp[] }; pagination: { current: number; pageSize: number; total: number } }>(
            queryUrl,
            {
                data: { pairings, address, interval, timestamp_begin, timestamp_end, page, limit },
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            },
        )
    } catch (error) {
        console.log(queryUrl, error)
        return undefined
    }
}

export const downloadDatabase = async () => {
    const queryUrl = baseUrl
    const token = localStorage.getItem("accessToken")
    if (!token) return
    // Exporting the raw SQLite files is admin-only. This is a UI guard only — the
    // API enforces it as well (requireAdmin answers 403), so a forged localStorage
    // value still cannot download anything.
    if (localStorage.getItem("username") !== "admin") return

    try {
        fetch(queryUrl + "data/export", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        }).then((response) => {
            response.blob().then((blob: Blob) => {
                const fileURL = window.URL.createObjectURL(blob)
                const alink = document.createElement("a")
                alink.href = fileURL
                alink.download = `${new Date().toISOString()}-tx.db`
                alink.click()
            })
        })
        fetch(queryUrl + "data/spotFuture/export", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        }).then((response) => {
            response.blob().then((blob: Blob) => {
                const fileURL = window.URL.createObjectURL(blob)
                const alink = document.createElement("a")
                alink.href = fileURL
                alink.download = `${new Date().toISOString()}-spotFuture.db`
                alink.click()
            })
        })
        fetch(queryUrl + "data/fRate/export", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        }).then((response) => {
            response.blob().then((blob: Blob) => {
                const fileURL = window.URL.createObjectURL(blob)
                const alink = document.createElement("a")
                alink.href = fileURL
                alink.download = `${new Date().toISOString()}-fRate.db`
                alink.click()
            })
        })
    } catch (error) {
        console.log(queryUrl, error)
    }
}

export const fetchRawData = async (
    pairing: pairing[],
    activeAddress: string,
    tradeType: tradeTypes,
    viewType: views,
    pagination: TablePaginationConfig,
    calenderFilter: { startDate?: number; endDate?: number },
): Promise<{
    data: {
        [key: string]: rawProfitResp[]
    }
    pagination: { current: number; pageSize: number; total: number }
}> => {
    let resp: {
        data: {
            [key: string]: rawProfitResp[]
        }
        pagination: {
            current: number
            pageSize: number
            total: number
        }
    } = { data: {}, pagination: { current: pagination.current!, pageSize: pagination.pageSize!, total: pagination.total! } }
    if (viewType !== views.Intraday) return resp

    if (tradeType === tradeTypes.total || tradeType === tradeTypes.spot)
        resp = (await getRawProfitDetailsBatch(
            pairing,
            pagination.current,
            pagination.pageSize,
            activeAddress === "ALL" ? undefined : activeAddress,
            calenderFilter.startDate,
            calenderFilter.endDate,
        ))!
    else if (tradeType === tradeTypes.spotFuture)
        resp = (await getRawSpotFutureProfitDetailsBatch(
            pairing,
            pagination.current,
            pagination.pageSize,
            activeAddress === "ALL" ? undefined : activeAddress,
            calenderFilter.startDate,
            calenderFilter.endDate,
        ))!
    else if (tradeType === tradeTypes.fundingRate)
        resp = (await getRawFundingRProfitDetailsBatch(
            pairing,
            pagination.current,
            pagination.pageSize,
            activeAddress === "ALL" ? undefined : activeAddress,
            calenderFilter.startDate,
            calenderFilter.endDate,
        ))!
    // Return the full response, including pagination metadata
    return resp // { data: {...}, pagination: {...} }
}

export const fetchAggregatedData = async (
    pairing: pairing[],
    activeAddress: string,
    tradeType: tradeTypes,
    viewType: views,
    pagination: TablePaginationConfig,
    calenderFilter: { startDate?: number; endDate?: number },
) => {
    let resp: {
        data: {
            [key: string]: aggregatedProfitResp[]
        }
        pagination: {
            current: number
            pageSize: number
            total: number
        }
    } = { data: {}, pagination: { current: pagination.current!, pageSize: pagination.pageSize!, total: pagination.total! } }
    if (viewType === views.Intraday) return undefined

    if (tradeType === tradeTypes.total || tradeType === tradeTypes.spot)
        resp = (await getAggregatedProfitDetailsBatch(
            pairing,
            viewType,
            pagination.current,
            pagination.pageSize,
            activeAddress === "ALL" ? undefined : activeAddress,
            calenderFilter?.startDate,
            calenderFilter?.endDate,
        ))!
    else if (tradeType === tradeTypes.spotFuture) {
        resp = (await getAggregatedSpotFutureProfitDetailsBatch(
            pairing,
            viewType,
            pagination.current,
            pagination.pageSize,
            activeAddress === "ALL" ? undefined : activeAddress,
            calenderFilter?.startDate,
            calenderFilter?.endDate,
        ))!
    } else if (tradeType === tradeTypes.fundingRate) {
        resp = (await getAggregatedFundingRProfitDetailsBatch(
            pairing,
            viewType,
            pagination.current,
            pagination.pageSize,
            activeAddress === "ALL" ? undefined : activeAddress,
            calenderFilter?.startDate,
            calenderFilter?.endDate,
        ))!
    }
    return resp // { data: { [key: string]: aggregatedProfitResp[] }, pagination: {...} }
}
