import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetchAggregatedData, fetchRawData, groupProfitByTimestamp, mergeProfitPages } from "@/api/backend"
import { tradeTypes, views, type aggregatedProfitResp, type rawProfitResp } from "@/types"

// ── Fixtures ───────────────────────────────────────────────────────────────
// One URL per profit database. "total" is not an endpoint: it is the merge of the
// other three, which is exactly what these tests pin down.
const AGGREGATED_URLS = {
    [tradeTypes.spot]: "/data/profits-details/pairing/aggregated/batch",
    [tradeTypes.spotFuture]: "/data/spotFuture/profits-details/pairing/aggregated/batch",
    [tradeTypes.fundingRate]: "/data/fRate/profits-details/pairing/aggregated/batch",
} as const

const RAW_URLS = {
    [tradeTypes.spot]: "/data/profits-details/pairing/batch",
    [tradeTypes.spotFuture]: "/data/spotFuture/profits-details/pairing/batch",
    [tradeTypes.fundingRate]: "/data/fRate/profits-details/pairing/batch",
} as const

const jsonResponse = (body: unknown, status = 200, ok = status >= 200 && status < 300): Response =>
    ({ ok, status, json: vi.fn().mockResolvedValue(body) }) as unknown as Response

const profitRow = (key: string, amount = 1, ratio = 0.1, timestamp = "2025-01-01"): aggregatedProfitResp => ({
    key,
    address: "0xabc",
    timestamp,
    baseSymbol: "ETH",
    quoteSymbol: "USDC",
    amount,
    ratio,
})

const page = <T extends aggregatedProfitResp>(rows: T[], total: number, current = 1, pageSize = 50) => ({
    data: { ETH: rows },
    pagination: { current, pageSize, total },
})

/**
 * Answers each mapped URL. A URL the test did not map means the caller reached an
 * endpoint it should not have, so it 404s — which the getters turn into `undefined`,
 * the same path a symbol missing from one database takes in production.
 */
const stubFetch = (responses: [string, unknown][]) => {
    const byUrl = new Map(responses)
    // Typed with the real fetch signature so the recorded calls keep their second
    // argument, while the implementation only needs the URL to route a body.
    const fetchMock = vi.fn<(url: string, config?: RequestInit) => Promise<Response>>()
    fetchMock.mockImplementation((url) => {
        const body = byUrl.get(url)
        if (body === undefined) return Promise.resolve(jsonResponse({ message: "unexpected url" }, 404, false))
        return Promise.resolve(jsonResponse(body))
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
}

const bodiesOf = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.map(([, config]) => JSON.parse(String(config?.body)))
const urlsOf = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.map(([url]) => url)

beforeEach(() => {
    localStorage.setItem("accessToken", "tok")
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("mergeProfitPages", () => {
    it("concatenates the sources, tags every key with its source and sums the totals", () => {
        const merged = mergeProfitPages({
            [tradeTypes.spot]: page([profitRow("ETH_USDC_0", 10)], 7, 4),
            [tradeTypes.spotFuture]: page([profitRow("ETH_USDC_0", 20)], 2, 4),
            [tradeTypes.fundingRate]: page([profitRow("ETH_USDC_0", 30)], 3, 4),
        })

        expect(merged.data.ETH.map((row) => row.amount)).toEqual([10, 20, 30])
        // Identical keys come out of every database, so a table would otherwise repeat rowKeys.
        expect(merged.data.ETH.map((row) => row.key)).toEqual(["spot_ETH_USDC_0", "spotFuture_ETH_USDC_0", "fundingRate_ETH_USDC_0"])
        expect(new Set(merged.data.ETH.map((row) => row.key)).size).toBe(3)
        expect(merged.pagination).toEqual({ current: 4, pageSize: 50, total: 12 })
    })

    it("skips a source that failed instead of dereferencing it", () => {
        // Regression: the inline merge this replaces read `data!["data"]` and threw as
        // soon as one of the three requests failed (a symbol missing from that database).
        const merged = mergeProfitPages({
            [tradeTypes.spot]: page([profitRow("ETH_USDC_0")], 5),
            [tradeTypes.spotFuture]: undefined,
            [tradeTypes.fundingRate]: undefined,
        })

        expect(merged.data.ETH).toHaveLength(1)
        expect(merged.pagination).toEqual({ current: 1, pageSize: 50, total: 5 })
    })

    it("reports no rows and no page when every source failed", () => {
        expect(mergeProfitPages({})).toEqual({ data: {}, pagination: { current: undefined, pageSize: undefined, total: 0 } })
    })

    it("normalizes a row before tagging it", () => {
        const merged = mergeProfitPages({ [tradeTypes.spot]: page([profitRow("ETH_USDC_0", 2)], 1) }, (row) => ({
            ...row,
            amount: row.amount * 2,
        }))

        expect(merged.data.ETH[0]).toMatchObject({ key: "spot_ETH_USDC_0", amount: 4 })
    })
})

describe("groupProfitByTimestamp", () => {
    it("sums one bucket per period and weights the ratio by the amounts behind it", () => {
        const grouped = groupProfitByTimestamp(
            mergeProfitPages({
                [tradeTypes.spot]: page([profitRow("ETH_USDC_0", 10, 0.01)], 3),
                [tradeTypes.spotFuture]: page([profitRow("ETH_USDC_0", 20, 0.02)], 2),
                [tradeTypes.fundingRate]: page([profitRow("ETH_USDC_0", 30, 0.03)], 5),
            }),
        )

        expect(grouped.data.ETH).toHaveLength(1)
        // A plain mean would say 0.02; the backend weights by amount (SUM(amount*ratio)/SUM(amount)),
        // because the same return over three times the volume is not the same average.
        expect(grouped.data.ETH[0]).toMatchObject({ key: "ETH_2025-01-01", timestamp: "2025-01-01", amount: 60, ratio: 0.0233 })
        // Pagination still counts the source rows the three databases reported.
        expect(grouped.pagination.total).toBe(10)
    })

    it("keeps different periods apart and leaves a single-source bucket untouched", () => {
        const grouped = groupProfitByTimestamp(
            mergeProfitPages({
                [tradeTypes.spot]: page([profitRow("ETH_USDC_0", 10, 0.01, "2025-01-01"), profitRow("ETH_USDC_1", 5, 0.05, "2025-01-02")], 2),
                [tradeTypes.spotFuture]: page([profitRow("ETH_USDC_0", 20, 0.02, "2025-01-02")], 1),
            }),
        )

        expect(grouped.data.ETH.map((row) => row.timestamp)).toEqual(["2025-01-01", "2025-01-02"])
        expect(grouped.data.ETH.map((row) => row.key)).toEqual(["ETH_2025-01-01", "ETH_2025-01-02"])
        expect(grouped.data.ETH.map((row) => row.amount)).toEqual([10, 25])
        expect(grouped.data.ETH[0].ratio).toBe(0.01) // spot alone: unchanged, not re-weighted
        expect(grouped.data.ETH[1].ratio).toBe(0.026) // (5*0.05 + 20*0.02) / 25
    })

    it("reports a zero ratio when a bucket's amounts cancel out", () => {
        const grouped = groupProfitByTimestamp(
            mergeProfitPages({
                [tradeTypes.spot]: page([profitRow("ETH_USDC_0", 10, 0.5)], 1),
                [tradeTypes.spotFuture]: page([profitRow("ETH_USDC_0", -10, 0.5)], 1),
            }),
        )

        expect(grouped.data.ETH[0]).toMatchObject({ amount: 0, ratio: 0 })
    })

    it("rounds the accumulated sums to four decimals", () => {
        const grouped = groupProfitByTimestamp(
            mergeProfitPages({
                [tradeTypes.spot]: page([profitRow("ETH_USDC_0", 0.1)], 1),
                [tradeTypes.spotFuture]: page([profitRow("ETH_USDC_0", 0.2)], 1),
            }),
        )

        // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
        expect(grouped.data.ETH[0].amount).toBe(0.3)
    })

    it("groups each symbol independently and passes pagination through", () => {
        const grouped = groupProfitByTimestamp({
            data: {
                ETH: [profitRow("ETH_USDC_0", 10), profitRow("ETH_USDC_1", 30)],
                BTC: [{ ...profitRow("BTC_USDC_0", 20), baseSymbol: "BTC" }],
            },
            pagination: { current: 2, pageSize: 25, total: 4 },
        })

        expect(grouped.data.ETH.map((row) => row.key)).toEqual(["ETH_2025-01-01"])
        expect(grouped.data.ETH[0].amount).toBe(40)
        expect(grouped.data.BTC.map((row) => row.key)).toEqual(["BTC_2025-01-01"])
        expect(grouped.data.BTC[0].amount).toBe(20)
        expect(grouped.pagination).toEqual({ current: 2, pageSize: 25, total: 4 })
    })
})

describe("fetchAggregatedData", () => {
    it("merges the spot, perp-futures and funding-rate buckets for the total view", async () => {
        const fetchMock = stubFetch([
            [AGGREGATED_URLS.spot, page([profitRow("ETH_USDC_0", 10, 0.01)], 7, 4)],
            [AGGREGATED_URLS.spotFuture, page([profitRow("ETH_USDC_1", 20, 0.02)], 2, 4)],
            [AGGREGATED_URLS.fundingRate, page([profitRow("ETH_USDC_2", 30, 0.03)], 3, 4)],
        ])

        const resp = await fetchAggregatedData(
            [{ baseSymbol: "ETH", quoteSymbol: "USDC" }],
            "ALL",
            tradeTypes.total,
            views.Daily,
            { current: 4, pageSize: 50 },
            { startDate: 1, endDate: 2 },
        )

        expect(urlsOf(fetchMock)).toHaveLength(3)
        expect(new Set(urlsOf(fetchMock))).toEqual(new Set(Object.values(AGGREGATED_URLS)))
        // One row per period with the three databases summed into it — not three partial rows
        // each holding a third of the day's PNL.
        expect(resp?.data.ETH).toHaveLength(1)
        expect(resp?.data.ETH[0]).toMatchObject({ key: "ETH_2025-01-01", timestamp: "2025-01-01", amount: 60, ratio: 0.0233 })
        expect(resp?.pagination).toEqual({ current: 4, pageSize: 50, total: 12 })
        // Every source is asked the same question: same bucket, same page, same window.
        for (const body of bodiesOf(fetchMock)) {
            expect(body).toMatchObject({
                interval: views.Daily,
                page: 4,
                limit: 50,
                timestamp_begin: 1,
                timestamp_end: 2,
                pairings: [{ baseSymbol: "ETH", quoteSymbol: "USDC" }],
            })
            expect(body.address).toBeUndefined()
        }
    })

    it("keeps buckets the databases report for different periods apart", async () => {
        const fetchMock = stubFetch([
            [AGGREGATED_URLS.spot, page([profitRow("ETH_USDC_0", 10, 0.01, "2025-01-01")], 1)],
            [AGGREGATED_URLS.spotFuture, page([profitRow("ETH_USDC_0", 20, 0.02, "2025-01-02")], 1)],
            [AGGREGATED_URLS.fundingRate, { data: {}, pagination: { current: 1, pageSize: 50, total: 0 } }],
        ])

        const resp = await fetchAggregatedData([{ quoteSymbol: "USDC" }], "ALL", tradeTypes.total, views.Daily, { current: 1, pageSize: 50 }, {})

        expect(urlsOf(fetchMock)).toHaveLength(3)
        expect(resp?.data.ETH.map((row) => [row.timestamp, row.amount])).toEqual([
            ["2025-01-01", 10],
            ["2025-01-02", 20],
        ])
        expect(resp?.pagination.total).toBe(2)
    })

    it("still asks a single endpoint for the spot view", async () => {
        const fetchMock = stubFetch([[AGGREGATED_URLS.spot, page([profitRow("ETH_USDC_0", 10)], 7)]])

        const resp = await fetchAggregatedData(
            [{ quoteSymbol: "USDC" }],
            "ALL",
            tradeTypes.spot,
            views.Daily,
            { current: 1, pageSize: 50 },
            {},
        )

        expect(urlsOf(fetchMock)).toEqual([AGGREGATED_URLS.spot])
        expect(resp?.data.ETH).toHaveLength(1)
        expect(resp?.pagination.total).toBe(7)
    })

    it("returns undefined for the intraday view, which the raw fetcher owns", async () => {
        const fetchMock = stubFetch([])

        const resp = await fetchAggregatedData([{ quoteSymbol: "USDC" }], "ALL", tradeTypes.total, views.Intraday, { current: 1, pageSize: 50 }, {})

        expect(resp).toBeUndefined()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("keeps the requested page when every source fails", async () => {
        // Both logs are silenced: three 404s would otherwise each print an Axios-style
        // error and the getter's own console.log with the URL.
        const log = vi.spyOn(console, "log").mockImplementation(() => {})
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const fetchMock = stubFetch([])

        const resp = await fetchAggregatedData([{ quoteSymbol: "USDC" }], "ALL", tradeTypes.total, views.Daily, { current: 3, pageSize: 25 }, {})

        expect(urlsOf(fetchMock)).toHaveLength(3)
        expect(resp?.data).toEqual({})
        expect(resp?.pagination).toEqual({ current: 3, pageSize: 25, total: 0 })
        log.mockRestore()
        error.mockRestore()
    })
})

describe("fetchRawData", () => {
    // Perp-futures and funding-rate fills carry exchange-leg ids, not orderId/txHash.
    const legRow = (key: string, amount: number) =>
        ({ key, address: "0xabc", timestamp: "1750000000000", baseSymbol: "ETH", quoteSymbol: "USDC", amount, ratio: 0.2 }) as unknown as rawProfitResp

    it("merges raw fills and keeps every row a valid rawProfitResp", async () => {
        const fetchMock = stubFetch([
            [RAW_URLS.spot, page<rawProfitResp>([{ ...profitRow("ETH_USDC_0", 10), orderId: "1", txHash: "0xaa" }], 7, 4)],
            [RAW_URLS.spotFuture, page([legRow("ETH_USDC_1", 20)], 2, 4)],
            [RAW_URLS.fundingRate, page([legRow("ETH_USDC_2", 30)], 3, 4)],
        ])

        const resp = await fetchRawData([{ quoteSymbol: "USDC" }], "ALL", tradeTypes.total, views.Intraday, { current: 4, pageSize: 50 }, {})

        expect(urlsOf(fetchMock)).toHaveLength(3)
        expect(new Set(urlsOf(fetchMock))).toEqual(new Set(Object.values(RAW_URLS)))
        const rows = resp.data.ETH
        expect(rows.map((row) => row.amount)).toEqual([10, 20, 30])
        // ProfitIntradayView renders and filters on these two columns, so a missing id
        // has to be an empty string rather than undefined.
        expect(rows.map((row) => row.orderId)).toEqual(["1", "", ""])
        expect(rows.map((row) => row.txHash)).toEqual(["0xaa", "", ""])
        expect(rows.map((row) => row.key)).toEqual(["spot_ETH_USDC_0", "spotFuture_ETH_USDC_1", "fundingRate_ETH_USDC_2"])
        expect(resp.pagination).toEqual({ current: 4, pageSize: 50, total: 12 })
    })

    it("still asks one endpoint per non-total trade type and forwards countOnly", async () => {
        const fetchMock = stubFetch([[RAW_URLS.spotFuture, page([legRow("ETH_USDC_0", 20)], 2)]])

        const resp = await fetchRawData([{ quoteSymbol: "USDC" }], "ALL", tradeTypes.spotFuture, views.Intraday, { current: 1, pageSize: 50 }, {}, true)

        expect(urlsOf(fetchMock)).toEqual([RAW_URLS.spotFuture])
        expect(bodiesOf(fetchMock)[0].countOnly).toBe(true)
        expect(resp.data.ETH).toHaveLength(1)
        expect(resp.pagination.total).toBe(2)
    })

    it("returns the empty result without requesting anything outside the intraday view", async () => {
        const fetchMock = stubFetch([])

        const resp = await fetchRawData([{ quoteSymbol: "USDC" }], "ALL", tradeTypes.total, views.Daily, { current: 1, pageSize: 50 }, {})

        expect(fetchMock).not.toHaveBeenCalled()
        expect(resp.data).toEqual({})
    })
})
