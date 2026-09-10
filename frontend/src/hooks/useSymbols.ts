import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { tradeTypes } from "@/types"
import { ONE_HOUR_STALE_TIME } from "@/types"
import { getFundingRateSymbols, getSpotFutureSymbols, getSpotSymbols } from "@/api/backend"
// Fetch Unique Symbols
const fetchUniqueSymbols = async (tradeType: tradeTypes) => {
    const fetchFn: { [k in tradeTypes]: () => Promise<string[]> } = {
        [tradeTypes.total]: async () => {
            return await Promise.all([...(await getSpotSymbols()), ...(await getSpotFutureSymbols()), ...(await getFundingRateSymbols())])
        },
        [tradeTypes.spot]: async () => await getSpotSymbols(),
        [tradeTypes.spotFuture]: async () => await getSpotFutureSymbols(),
        [tradeTypes.fundingRate]: async () => await getFundingRateSymbols(),
    }

    // 1. Fetch all available symbols from the backend
    const allSymbols = Array.from(new Set(await fetchFn[tradeType]())) ?? ["USDC"]

    return allSymbols
}

export const useSymbolQuery = (tradeType: tradeTypes) =>
    useQuery({
        queryKey: ["uniqueSymbols", tradeType],
        queryFn: () => fetchUniqueSymbols(tradeType),
        placeholderData: keepPreviousData,
        staleTime: ONE_HOUR_STALE_TIME,
    })
