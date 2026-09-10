// ── Landing-page arbitrage sample data ────────────────────────────────────
// Curated, plausible snapshot values mirroring the shapes the real desks use
// (funding per venue with per-venue pay cycles; spot<->future basis). These are
// display values only — the live monitor is fed by the external market server.

export interface FundingRateRow {
    venue: string
    intervalHr: number
    funding: number // decimal per cycle (positive => longs pay shorts)
    delta: number // change vs the previous reading (decimal, same cycle basis)
    trend: number[] // recent per-cycle readings for the sparkline
}

export const FUNDING_SYMBOLS = ["BTC", "ETH", "SOL"] as const

export const fundingDesk: Record<(typeof FUNDING_SYMBOLS)[number], FundingRateRow[]> = {
    BTC: [
        { venue: "Bybit", intervalHr: 8, funding: 0.000105, delta: 0.000012, trend: [0.000081, 0.000088, 0.00009, 0.000102, 0.000096, 0.000105, 0.000114, 0.000105, 0.000112, 0.000121, 0.000113, 0.000105] },
        { venue: "Binance", intervalHr: 8, funding: 0.000089, delta: 0.000006, trend: [0.000072, 0.000075, 0.00008, 0.000084, 0.000081, 0.000088, 0.00009, 0.000087, 0.000093, 0.000095, 0.000092, 0.000089] },
        { venue: "Gate.io", intervalHr: 8, funding: 0.000042, delta: -0.000004, trend: [0.000051, 0.000055, 0.000049, 0.000052, 0.000046, 0.000048, 0.000043, 0.000045, 0.00004, 0.000044, 0.000039, 0.000042] },
        { venue: "Hyperliquid", intervalHr: 1, funding: -0.0000032, delta: 0.0000004, trend: [-0.0000028, -0.0000031, -0.0000034, -0.0000029, -0.000003, -0.0000036, -0.0000032, -0.0000033, -0.0000031, -0.0000035, -0.0000032, -0.0000032] },
    ],
    ETH: [
        { venue: "Bybit", intervalHr: 8, funding: 0.000076, delta: 0.000009, trend: [0.000058, 0.000061, 0.000066, 0.00007, 0.000068, 0.000074, 0.000071, 0.000078, 0.000082, 0.00008, 0.000077, 0.000076] },
        { venue: "Binance", intervalHr: 8, funding: 0.000064, delta: 0.000003, trend: [0.000049, 0.000052, 0.000055, 0.000058, 0.000054, 0.00006, 0.000063, 0.000061, 0.000066, 0.000068, 0.000065, 0.000064] },
        { venue: "Gate.io", intervalHr: 8, funding: -0.000021, delta: 0.000005, trend: [-0.000028, -0.000031, -0.000027, -0.000023, -0.000026, -0.000019, -0.000022, -0.000018, -0.00002, -0.000017, -0.000021, -0.000021] },
        { venue: "Hyperliquid", intervalHr: 1, funding: 0.0000044, delta: 0.0000007, trend: [0.0000036, 0.0000039, 0.0000041, 0.0000038, 0.0000044, 0.0000047, 0.0000043, 0.0000046, 0.0000048, 0.0000045, 0.0000042, 0.0000044] },
    ],
    SOL: [
        { venue: "Bybit", intervalHr: 8, funding: 0.000212, delta: 0.000031, trend: [0.000148, 0.000159, 0.000171, 0.00018, 0.000174, 0.000192, 0.000205, 0.000198, 0.000214, 0.00022, 0.000209, 0.000212] },
        { venue: "Binance", intervalHr: 8, funding: 0.00018, delta: 0.000018, trend: [0.00013, 0.000136, 0.000148, 0.000152, 0.000146, 0.00016, 0.000171, 0.000168, 0.000176, 0.000185, 0.000182, 0.00018] },
        { venue: "Gate.io", intervalHr: 8, funding: 0.00012, delta: -0.000011, trend: [0.000148, 0.000152, 0.000141, 0.000138, 0.000144, 0.000136, 0.00013, 0.000134, 0.000127, 0.000129, 0.000122, 0.00012] },
        { venue: "Hyperliquid", intervalHr: 1, funding: 0.0000125, delta: 0.0000006, trend: [0.0000101, 0.0000108, 0.0000112, 0.0000119, 0.0000115, 0.0000123, 0.0000128, 0.0000121, 0.000013, 0.0000134, 0.0000129, 0.0000125] },
    ],
}

export type BasisDirection = "contango" | "backwardation"

export interface BasisRow {
    symbol: string
    spotVenue: string
    perpVenue: string
    basis: number // (perp - spot) / spot, decimal
    direction: BasisDirection
    costRate: number // modelled one-way round-trip cost, decimal
    trend: number[]
}

export const basisDesk: BasisRow[] = [
    {
        symbol: "BTC",
        spotVenue: "Bybit",
        perpVenue: "Binance",
        basis: 0.0042,
        direction: "contango",
        costRate: 0.0008,
        trend: [0.0031, 0.0034, 0.0036, 0.0033, 0.0039, 0.0042, 0.0046, 0.0044, 0.0048, 0.0051, 0.0046, 0.0042],
    },
    {
        symbol: "ETH",
        spotVenue: "Bybit",
        perpVenue: "Gate.io",
        basis: 0.0021,
        direction: "contango",
        costRate: 0.0008,
        trend: [0.0014, 0.0016, 0.0019, 0.0017, 0.0022, 0.0024, 0.0021, 0.0026, 0.0028, 0.0024, 0.0022, 0.0021],
    },
    {
        symbol: "SOL",
        spotVenue: "Bybit",
        perpVenue: "Hyperliquid",
        basis: -0.0024,
        direction: "backwardation",
        costRate: 0.0008,
        trend: [-0.0012, -0.0015, -0.0018, -0.0016, -0.0021, -0.0024, -0.0022, -0.0028, -0.0031, -0.0027, -0.0025, -0.0024],
    },
    {
        symbol: "ARB",
        spotVenue: "Bybit",
        perpVenue: "Gate.io",
        basis: -0.0008,
        direction: "backwardation",
        costRate: 0.0011,
        trend: [-0.0004, -0.0006, -0.0009, -0.0007, -0.001, -0.0012, -0.0011, -0.0009, -0.0011, -0.0008, -0.0008, -0.0008],
    },
]

// Modeled round-trip fee for the funding window callout (both legs).
export const MODEL_ROUND_TRIP_FEE = 0.0008 // ≈ 8 bps notional
