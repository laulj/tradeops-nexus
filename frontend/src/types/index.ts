import type { PaginationConfig } from "antd/es/pagination"

export const ONE_MIN_STALE_TIME = 60 * 60 * 1000
export const ONE_HOUR_STALE_TIME = 60 * 60 * 60 * 1000

export const views = {
    Intraday: "Intraday",
    Daily: "Daily",
    Weekly: "Weekly",
    Monthly: "Monthly",
    Quarterly: "Quarterly",
    Yearly: "Yearly",
} as const
export type views = (typeof views)[keyof typeof views]

export const fundingRateInterval = {
    Hourly: "Hourly",
    "4Hours": "4Hours",
    "8Hours": "8Hours",
    Day: "Day",
    Week: "Week",
    Year: "Year",
} as const
export type fundingRateInterval = (typeof fundingRateInterval)[keyof typeof fundingRateInterval]
export const tradeTypes = {
    total: "total",
    spot: "spot",
    spotFuture: "spotFuture",
    fundingRate: "fundingRate",
} as const
export type tradeTypes = (typeof tradeTypes)[keyof typeof tradeTypes]
export type pairing = {
    baseSymbol?: string
    quoteSymbol: string
}

export interface profitInt {
    ["total"]: { [key: string]: aggregatedProfitResp[] }
    [tradeTypes.spot]: { [key: string]: aggregatedProfitResp[] }
    [tradeTypes.spotFuture]: { [key: string]: aggregatedProfitResp[] }
    [tradeTypes.fundingRate]: { [key: string]: aggregatedProfitResp[] }
    pagination?: PaginationConfig
}
export interface balanceResponse {
    key?: string
    address: string
    timestamp: string
    amount: number
}

export type apiDataResp<T extends views> = T extends "Intraday" ? rawProfitResp : aggregatedProfitResp
export interface rawProfitResp extends aggregatedProfitResp {
    orderId: string
    txHash: string
}
export interface aggregatedProfitResp {
    key: string
    address: string
    timestamp: string
    baseSymbol: string
    quoteSymbol: string
    amount: number
    ratio: number
}

export const CEXNames = ["bybit", "gate", "binance", "hl"]
export const DEXNames = ["osm", "dydx", "inj", "hl", "bolt", "suil"]
export const EXNames = ["bybit", "gate", "binance", "hl", "osm", "dydx", "inj", "bolt", "suil"]
export interface spotFutureProfitResponse {
    address: string
    timestamp: string
    openingSP: number
    openingFP: number
    closingFP: number
    closingSP: number
    closingUUID: string
    openingUUID: string

    // Post-computed attributes
    key?: React.Key
    baseSymbol?: string
    OPex1Name?: string
    OPex2Name?: string
    OPex1Id?: string
    OPex2Id?: string
    CPex1Name?: string
    CPex2Name?: string
    CPex1Id?: string
    CPex2Id?: string

    OPbybitId: string | null
    OPbybitTokenIn: string | null
    OPbybitTokenOut: string | null
    OPgateId: string | null
    OPgateTokenIn: string | null
    OPgateTokenOut: string | null
    OPbinanceId: string | null
    OPbinanceTokenIn: string | null
    OPbinanceTokenOut: string | null
    OPhlId: string | null
    OPhlTokenIn: string | null
    OPhlTokenOut: string | null
    OPosmId: string | null
    OPosmTokenIn: string | null
    OPosmTokenOut: string | null
    OPinjId: string | null
    OPinjTokenIn: string | null
    OPinjTokenOut: string | null
    OPdydxId: string | null
    OPdydxTokenIn: string | null
    OPdydxTokenOut: string | null
    OPboltId: string | null
    OPboltTokenIn: string | null
    OPboltTokenOut: string | null
    OPsuilId: string | null
    OPsuilTokenIn: string | null
    OPsuilTokenOut: string | null

    CPbybitId: string | null
    CPbybitTokenIn: string | null
    CPbybitTokenOut: string | null
    CPgateId: string | null
    CPgateTokenIn: string | null
    CPgateTokenOut: string | null
    CPbinanceId: string | null
    CPbinanceTokenIn: string | null
    CPbinanceTokenOut: string | null
    CPhlId: string | null
    CPhlTokenIn: string | null
    CPhlTokenOut: string | null
    CPosmId: string | null
    CPosmTokenIn: string | null
    CPosmTokenOut: string | null
    CPinjId: string | null
    CPinjTokenIn: string | null
    CPinjTokenOut: string | null
    CPdydxId: string | null
    CPdydxTokenIn: string | null
    CPdydxTokenOut: string | null
    CPboltId: string | null
    CPboltTokenIn: string | null
    CPboltTokenOut: string | null
    CPsuilId: string | null
    CPsuilTokenIn: string | null
    CPsuilTokenOut: string | null

    amount: number
    ratio: number

    qty: number
    openingOrderFee: number
    closingOrderFee: number
    closingFundingFee: number
}
export interface spotFutureOP {
    timestamp: string
    txHash: string
    uuid: string
    address: string

    key: string
    orderId: string
    cexName: string
    coin: string
    dexName: string

    binanceId: string | null
    binanceTokenIn: string | null
    binanceTokenOut: string | null

    bybitId: string | null
    bybitTokenIn: string | null
    bybitTokenOut: string | null

    dydxId: string | null
    dydxTokenIn: string | null
    dydxTokenOut: string | null

    gateId: string | null
    gateTokenIn: string | null
    gateTokenOut: string | null

    injId: string | null
    injTokenIn: string | null
    injTokenOut: string | null

    osmId: string | null
    osmTokenIn: string | null
    osmTokenOut: string | null

    hlId: string | null
    hlTokenIn: string | null
    hlTokenOut: string | null

    boltId: string | null
    boltTokenIn: string | null
    boltTokenOut: string | null

    suilId: string | null
    suilTokenIn: string | null
    suilTokenOut: string | null

    qty: number
    spotPrice: number
    futurePrice: number
    orderFee: number
    fundingFee: number
}

export interface fundingRateProfitResponse extends Omit<
    spotFutureProfitResponse,
    | "OPdexName"
    | "OPcexName"
    | "OPorderId"
    | "OPtxHash"
    | "CPdexName"
    | "CPcexName"
    | "CPorderId"
    | "CPtxHash"
    | "openingSP"
    | "openingFP"
    | "closingFP"
    | "closingSP"
    | "openingOrderFee"
    | "closingOrderFee"
    | "closingFundingFee"
> {
    /* OP */
    OPex1Name: string
    OPex1Id: string
    OPex1FundingFee: number
    OPex1Price: number
    OPex1OrderFee: number

    OPex2Name: string
    OPex2Id: string
    OPex2FundingFee: number
    OPex2Price: number
    OPex2OrderFee: number

    OPbinancePrice: number | null
    OPbinanceOrderFee: number | null
    OPbinanceFundingFee: number | null

    OPbybitPrice: number | null
    OPbybitOrderFee: number | null
    OPbybitFundingFee: number | null

    OPdydxPrice: number | null
    OPdydxOrderFee: number | null
    OPdydxFundingFee: number | null

    OPhlPrice: number | null
    OPhlOrderFee: number | null
    OPhlFundingFee: number | null

    OPgatePrice: number | null
    OPgateOrderFee: number | null
    OPgateFundingFee: number | null

    OPinjPrice: number | null
    OPinjOrderFee: number | null
    OPinjFundingFee: number | null

    OPosmPrice: number | null
    OPosmOrderFee: number | null
    OPosmFundingFee: number | null

    OPboltPrice: number | null
    OPboltOrderFee: number | null
    OPboltFundingFee: number | null

    OPsuilPrice: number | null
    OPsuilOrderFee: number | null
    OPsuilFundingFee: number | null

    /* CP */
    CPex1Name: string
    CPex1Id: string
    CPex1FundingFee: number
    CPex1Price: number
    CPex1OrderFee: number

    CPex2Name: string
    CPex2Id: string
    CPex2FundingFee: number
    CPex2Price: number
    CPex2OrderFee: number

    CPbinancePrice: number | null
    CPbinanceOrderFee: number | null
    CPbinanceFundingFee: number | null

    CPbybitPrice: number | null
    CPbybitOrderFee: number | null
    CPbybitFundingFee: number | null

    CPdydxPrice: number | null
    CPdydxOrderFee: number | null
    CPdydxFundingFee: number | null

    CPhlPrice: number | null
    CPhlOrderFee: number | null
    CPhlFundingFee: number | null

    CPgatePrice: number | null
    CPgateOrderFee: number | null
    CPgateFundingFee: number | null

    CPinjPrice: number | null
    CPinjOrderFee: number | null
    CPinjFundingFee: number | null

    CPosmPrice: number | null
    CPosmOrderFee: number | null
    CPosmFundingFee: number | null

    CPboltPrice: number | null
    CPboltOrderFee: number | null
    CPboltFundingFee: number | null

    CPsuilPrice: number | null
    CPsuilOrderFee: number | null
    CPsuilFundingFee: number | null
}

export interface fundingRateOP extends Omit<
    spotFutureOP,
    "spotPrice" | "futurePrice" | "orderFee" | "fundingFee" | "cexName" | "dexName" | "txHash" | "orderId"
> {
    ex1Name: string
    ex1OrderId: string
    ex1FundingFee: number
    ex1Price: number
    ex1OrderFee: number

    ex2Name: string
    ex2OrderId: string
    ex2FundingFee: number
    ex2Price: number
    ex2OrderFee: number

    binancePrice: number | null
    binanceOrderFee: number | null
    binanceFundingFee: number | null

    bybitPrice: number | null
    bybitOrderFee: number | null
    bybitFundingFee: number | null

    dydxPrice: number | null
    dydxOrderFee: number | null
    dydxFundingFee: number | null

    hlPrice: number | null
    hlOrderFee: number | null
    hlFundingFee: number | null

    gatePrice: number | null
    gateOrderFee: number | null
    gateFundingFee: number | null

    injPrice: number | null
    injOrderFee: number | null
    injFundingFee: number | null

    osmPrice: number | null
    osmOrderFee: number | null
    osmFundingFee: number | null

    boltPrice: number | null
    boltOrderFee: number | null
    boltFundingFee: number | null

    suilPrice: number | null
    suilOrderFee: number | null
    suilFundingFee: number | null
}

/* FR Table */
type ExcludeSame<T extends string> = T extends `${infer A}-${infer B}` ? (A extends B ? never : T) : never
export type FR_EXCHANGE_PAIR = ExcludeSame<`${CEX_EXCHANGE_TYPE}-${CEX_EXCHANGE_TYPE}`>
export const EXCHANGE_TYPE = {
    HL: "HYPERLIQUID",
    BB: "BYBIT",
    BIN: "BINANCE",
    GT: "GATE",
    OSM: "OSMOSIS",
    BOLT: "BOLT",
    SUIL: "SUILEND",
} as const
export type EXCHANGE_TYPE = (typeof EXCHANGE_TYPE)[keyof typeof EXCHANGE_TYPE]
export const CEX_EXCHANGE_TYPE = {
    HL: "HYPERLIQUID",
    BB: "BYBIT",
    BIN: "BINANCE",
    GT: "GATE",
    BOLT: "BOLT",
} as const
export type CEX_EXCHANGE_TYPE = (typeof CEX_EXCHANGE_TYPE)[keyof typeof CEX_EXCHANGE_TYPE]
export const DEX_EXCHANGE_TYPE = {
    HL: "HYPERLIQUID",
    OSM: "OSMOSIS",
    BOLT: "BOLT",
    SUIL: "SUILEND",
} as const
export type DEX_EXCHANGE_TYPE = (typeof DEX_EXCHANGE_TYPE)[keyof typeof DEX_EXCHANGE_TYPE]
export interface FRComparisonTableData {
    key: string
    pair: FR_EXCHANGE_PAIR
    symbol: string
    direction: "same" | "opposite"
    difference: number
    hourly: number

    nextFundingIntervalMs: number
    estimatedFR: number
    costRate: number
    estimatedProfitRatio: number
    minRunningHrAssumed: number

    fundingInfo: {
        name: EXCHANGE_TYPE
        funding: number
        nextFundingTime: number
        intervalHr: number
    }[]

    TimeToNextFunding: number
}
export interface formattedFRComparisonTableData {
    key: string
    symbol: string
    pair: {
        pair: FR_EXCHANGE_PAIR
        direction: "same" | "opposite"
        difference: number
        hourly: number

        nextFundingIntervalMs: number
        estimatedFR: number
        costRate: number
        estimatedProfitRatio: number
        minRunningHrAssumed: number

        fundingInfo: {
            name: EXCHANGE_TYPE
            funding: number
            nextFundingTime: number
            intervalHr: number
        }[]

        TimeToNextFunding: number
    }[]
}

export const backendStatus = {
    Good: "Good",
    Halted: "Halted",
    Stopped: "Stopped",
}
export type backendStatus = (typeof backendStatus)[keyof typeof backendStatus]
