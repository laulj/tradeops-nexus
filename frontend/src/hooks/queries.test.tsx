import { describe, expect, it, vi, beforeEach } from "vitest"
import type { ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
    getAddresses,
    getBalanceBatch,
    getFundingRateSymbols,
    getSpotFutureSymbols,
    getSpotSymbols,
} from "@/api/backend"
import { useAddressesQuery } from "@/hooks/useAddresses"
import { useBalanceQuery } from "@/hooks/useBalance"
import { useSymbolQuery } from "@/hooks/useSymbols"
import { tradeTypes } from "@/types"

vi.mock("@/api/backend", () => ({
    getSpotSymbols: vi.fn(),
    getSpotFutureSymbols: vi.fn(),
    getFundingRateSymbols: vi.fn(),
    getAddresses: vi.fn(),
    getBalanceBatch: vi.fn(),
}))

const createWrapper = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
}

beforeEach(() => {
    vi.mocked(getSpotSymbols).mockReset()
    vi.mocked(getSpotFutureSymbols).mockReset()
    vi.mocked(getFundingRateSymbols).mockReset()
    vi.mocked(getAddresses).mockReset()
    vi.mocked(getBalanceBatch).mockReset()
})

describe("useSymbolQuery", () => {
    it("loads the spot symbols from the backend", async () => {
        vi.mocked(getSpotSymbols).mockResolvedValue(["USDC", "ETH"])

        const { result } = renderHook(() => useSymbolQuery(tradeTypes.spot), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(["USDC", "ETH"])
        expect(getSpotSymbols).toHaveBeenCalledTimes(1)
    })

    it("combines symbols from all markets for the total view", async () => {
        vi.mocked(getSpotSymbols).mockResolvedValue(["USDC"])
        vi.mocked(getSpotFutureSymbols).mockResolvedValue(["BTC"])
        vi.mocked(getFundingRateSymbols).mockResolvedValue(["ETH"])

        const { result } = renderHook(() => useSymbolQuery(tradeTypes.total), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(expect.arrayContaining(["USDC", "BTC", "ETH"]))
    })
})

describe("useAddressesQuery", () => {
    it("loads the wallet addresses", async () => {
        vi.mocked(getAddresses).mockResolvedValue(["addr1", "addr2"])

        const { result } = renderHook(() => useAddressesQuery(), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(["addr1", "addr2"])
    })
})

describe("useBalanceQuery", () => {
    it("fetches balances for explicitly provided symbols", async () => {
        const balances = { USDC: [{ address: "a", timestamp: "1", amount: 10 }] }
        vi.mocked(getBalanceBatch).mockResolvedValue(balances)

        const { result } = renderHook(() => useBalanceQuery(["USDC"]), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(balances)
        expect(getBalanceBatch).toHaveBeenCalledWith(["USDC"])
    })

    it("resolves symbols internally when none are provided", async () => {
        vi.mocked(getSpotSymbols).mockResolvedValue(["USDC"])
        vi.mocked(getSpotFutureSymbols).mockResolvedValue(["BTC"])
        vi.mocked(getFundingRateSymbols).mockResolvedValue(["ETH"])
        vi.mocked(getBalanceBatch).mockResolvedValue({})

        const { result } = renderHook(() => useBalanceQuery(), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(getBalanceBatch).toHaveBeenCalledWith(expect.arrayContaining(["USDC", "BTC", "ETH"]))
    })
})
