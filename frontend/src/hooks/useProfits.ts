import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { tradeTypes, views, type aggregatedProfitResp } from "@/types"
import { fetchAggregatedData, fetchRawData, groupProfitByTimestamp, mergeProfitPages } from "@/api/backend"

// Symbol lists come from a separate query, so they are legitimately undefined
// until it resolves. Typing them optional keeps "not loaded yet" out of the type
// system's blind spot — it used to be papered over with `!` at the call site, which
// is how a first-render crash ("pairingByType[tradeType] is not iterable") reached
// the browser while typecheck, lint and the unit tests all stayed green.
type uniqueSymQuery = {
    spot?: string[]
    spotFuture?: string[]
    fundingRate?: string[]
}
const convertToPairing = (data?: string[]) =>
    (data ?? []).map((baseSymbol) => ({ baseSymbol: baseSymbol === "ALL" ? undefined : baseSymbol, quoteSymbol: "USDC" }))
const getProfitAggregatedTotal = async (pairingByType: uniqueSymQuery, activeAddress: string, view: views) => {
    const rawRequests = () => [
        fetchRawData(
            convertToPairing(pairingByType[tradeTypes.spot]),
            activeAddress, // activeAddress,
            tradeTypes.spot,
            view,
            { current: undefined, pageSize: undefined },
            {},
        ),
        fetchRawData(
            convertToPairing(pairingByType[tradeTypes.spotFuture]),
            activeAddress,
            tradeTypes.spotFuture,
            view,
            { current: undefined, pageSize: undefined },
            {},
        ),
        fetchRawData(
            convertToPairing(pairingByType[tradeTypes.fundingRate]),
            activeAddress,
            tradeTypes.fundingRate,
            view,
            { current: undefined, pageSize: undefined },
            {},
        ),
    ]
    const aggregatedRequests = () => [
        fetchAggregatedData(
            convertToPairing(pairingByType[tradeTypes.spot]),
            activeAddress, // activeAddress,
            tradeTypes.spot,
            view,
            { current: undefined, pageSize: undefined },
            {},
        ),
        fetchAggregatedData(
            convertToPairing(pairingByType[tradeTypes.spotFuture]),
            activeAddress,
            tradeTypes.spotFuture,
            view,
            { current: undefined, pageSize: undefined },
            {},
        ),
        fetchAggregatedData(
            convertToPairing(pairingByType[tradeTypes.fundingRate]),
            activeAddress,
            tradeTypes.fundingRate,
            view,
            { current: undefined, pageSize: undefined },
            {},
        ),
    ]
    const [spot, spotFuture, fundingR] = await Promise.all(view === views.Intraday ? rawRequests() : aggregatedRequests())
    // The three databases are merged by the same helpers the Profit page uses, so the
    // dashboard's total series and the Profit page's total table cannot disagree.
    const merged = mergeProfitPages<aggregatedProfitResp>({
        [tradeTypes.spot]: spot,
        [tradeTypes.spotFuture]: spotFuture,
        [tradeTypes.fundingRate]: fundingR,
    })
    // Raw fills are one row per fill and stay that way; aggregated rows are one row per
    // period per database, so the three sources have to be summed rather than listed.
    const total = view === views.Intraday ? merged : groupProfitByTimestamp(merged)
    return {
        [tradeTypes.total]: total.data,
        [tradeTypes.spot]: spot?.data ?? {},
        [tradeTypes.spotFuture]: spotFuture?.data ?? {},
        [tradeTypes.fundingRate]: fundingR?.data ?? {},
        pagination: total.pagination,
    }
}

// The pairings decide what a response contains, so they belong in the cache key —
// otherwise two callers asking for different symbol sets would share one entry.
// This is evaluated during render, so it has to tolerate symbols that have not
// loaded yet: fall back to an empty list rather than throwing, and produce the same
// key before and after they arrive so a load never refetches what it just fetched.
export const pairingSignature = (pairingByType: uniqueSymQuery): string =>
    [tradeTypes.spot, tradeTypes.spotFuture, tradeTypes.fundingRate]
        .map((tradeType) => {
            const symbols = pairingByType[tradeType]
            return `${tradeType}:${Array.isArray(symbols) ? [...symbols].sort().join(",") : ""}`
        })
        .join("|")

export const useProfitQuery = (pairingByType: uniqueSymQuery, activeAddress: string, view: views, isSymbolsReady: boolean) => {
    const profitQuery = useQuery({
        queryKey: ["aggregatedProfits", activeAddress, view, pairingSignature(pairingByType)],
        queryFn: () => getProfitAggregatedTotal(pairingByType, activeAddress, view),
        placeholderData: keepPreviousData,
        staleTime: 5 * 60 * 1000,
        enabled: isSymbolsReady,
    })

    return { ...profitQuery, isLoading: !isSymbolsReady || profitQuery.isLoading }
}

/**
 * Just the "how many fills" number behind the dashboard's "Total tx." tile. The
 * endpoints answer it from a COUNT(*), so this asks for no detail rows at all
 * (countOnly) instead of downloading rows the tile would only count. It is a
 * separate query from useProfitQuery on purpose: one number must never gate the
 * whole shell.
 */
const getTxCount = async (pairingByType: uniqueSymQuery, activeAddress: string) => {
    const noPaging = { current: 1, pageSize: 50 }
    const [spot, spotFuture, fundingRate] = await Promise.all([
        fetchRawData(convertToPairing(pairingByType[tradeTypes.spot]), activeAddress, tradeTypes.spot, views.Intraday, noPaging, {}, true),
        fetchRawData(
            convertToPairing(pairingByType[tradeTypes.spotFuture]),
            activeAddress,
            tradeTypes.spotFuture,
            views.Intraday,
            noPaging,
            {},
            true,
        ),
        fetchRawData(
            convertToPairing(pairingByType[tradeTypes.fundingRate]),
            activeAddress,
            tradeTypes.fundingRate,
            views.Intraday,
            noPaging,
            {},
            true,
        ),
    ])
    return (spot?.pagination.total ?? 0) + (spotFuture?.pagination.total ?? 0) + (fundingRate?.pagination.total ?? 0)
}

export const useTxCountQuery = (pairingByType: uniqueSymQuery, activeAddress: string, isSymbolsReady: boolean) => {
    const txCountQuery = useQuery({
        queryKey: ["txCount", activeAddress, pairingSignature(pairingByType)],
        queryFn: () => getTxCount(pairingByType, activeAddress),
        staleTime: 5 * 60 * 1000,
        enabled: isSymbolsReady,
    })

    return { ...txCountQuery, isLoading: !isSymbolsReady || txCountQuery.isLoading }
}
