import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ONE_HOUR_STALE_TIME } from "@/types"
import { getAddresses } from "@/api/backend"

const fetchAddresses = async () => {
    // Retrieve addresses from backend
    return await getAddresses()
}

export const useAddressesQuery = () =>
    useQuery({
        queryKey: ["addresses"],
        queryFn: () => fetchAddresses(),
        placeholderData: keepPreviousData,
        staleTime: ONE_HOUR_STALE_TIME,
    })
