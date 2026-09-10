import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { tradeTypes, views, type aggregatedProfitResp } from "@/types"
import { fetchAggregatedData, fetchRawData } from "@/api/backend"

type uniqueSymQuery = {
    spot: string[]
    spotFuture: string[]
    fundingRate: string[]
}
const convertToPairing = (data: string[]) =>
    data.map((baseSymbol) => ({ baseSymbol: baseSymbol === "ALL" ? undefined : baseSymbol, quoteSymbol: "USDC" }))
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
    const total: {
        [key: string]: aggregatedProfitResp[]
    } = {}
    let totalTxs = 0
    for (const data of [spot, spotFuture, fundingR]) {
        if (data) totalTxs += +data?.pagination.total
        for (const key in data!["data"]) {
            if (!total[key]) total[key] = []

            total[key].push(...data!["data"][key])
        }
    }
    return {
        [tradeTypes.total]: total,
        [tradeTypes.spot]: spot?.data ?? {},
        [tradeTypes.spotFuture]: spotFuture?.data ?? {},
        [tradeTypes.fundingRate]: fundingR?.data ?? {},
        pagination: {
            current: spot?.pagination.current || spotFuture?.pagination.current || fundingR?.pagination.current,
            pageSize: spot?.pagination.pageSize || spotFuture?.pagination.pageSize || fundingR?.pagination.pageSize,
            total: totalTxs,
        },
    }
}

export const useProfitQuery = (pairingByType: uniqueSymQuery, activeAddress: string, view: views, isSymbolsReady: boolean) => {
    const profitQuery = useQuery({
        queryKey: ["aggregatedProfits", activeAddress, view],
        queryFn: () => getProfitAggregatedTotal(pairingByType, activeAddress, view),
        placeholderData: keepPreviousData,
        staleTime: 5 * 60 * 1000,
        enabled: isSymbolsReady,
    })

    return { ...profitQuery, isLoading: isSymbolsReady || profitQuery.isLoading }
}
