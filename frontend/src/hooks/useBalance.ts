import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { tradeTypes } from "@/types"
import { ONE_HOUR_STALE_TIME } from "@/types"
import { getBalanceBatch } from "@/api/backend"
import { useSymbolQuery } from "@/hooks/useSymbols"

export const useBalanceQuery = (symbols?: string[]) => {
    const symbolQuery = useSymbolQuery(tradeTypes.total)
    const resolvedSymbols = symbols ?? symbolQuery.data
    const isLoadingSymbols = symbols ? false : symbolQuery.isLoading

    const balanceQuery = useQuery({
        queryKey: ["balances", resolvedSymbols],
        queryFn: () => getBalanceBatch(resolvedSymbols!),
        placeholderData: keepPreviousData,
        staleTime: ONE_HOUR_STALE_TIME,
        enabled: !isLoadingSymbols,
    })
    return { ...balanceQuery, isLoading: isLoadingSymbols || balanceQuery.isLoading }
}
