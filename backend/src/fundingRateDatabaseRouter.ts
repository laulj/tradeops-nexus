const path = require("path")
import express, { Request, Response, NextFunction } from "express"
import { Database } from "sqlite"
import {
    database,
    type arbFRPositionData,
    type spotFutureCoinProfitData,
    type FRdb_typed,
    type fRTxsData,
    type FRComparisonTableData,
    type fRTypedTxsData,
} from "./database"
import { insertAddressIfNotExists } from "./databaseRouter"
import { randomUUID } from "crypto"
import {
    aggCache,
    determineFRExchangesData,
    EXCHANGE_NAME,
    generateCacheKey,
    getGroupByExpression,
    pairing,
    parseYearWeek,
} from "./utils"
import { profitIntervalType } from "."

const CACHE_KEY_TYPE: "fundingRate" = "fundingRate"
// 1. Generate the SELECT fields dynamically
const exchangeSelectFields = EXCHANGE_NAME.map(
    (ex) =>
        `
        optx.${ex.toLowerCase()}Id AS OP${ex}Id, OP${ex}.tokenIn AS OP${ex}TokenIn, OP${ex}.tokenOut AS OP${ex}TokenOut, OP${ex}.price AS OP${ex}Price, OP${ex}.orderFee as OP${ex}OrderFee, OP${ex}.fundingFee AS OP${ex}FundingFee,
        cptx.${ex.toLowerCase()}Id AS CP${ex}Id, CP${ex}.tokenIn AS CP${ex}TokenIn, CP${ex}.tokenOut AS CP${ex}TokenOut, CP${ex}.price AS CP${ex}Price, CP${ex}.orderFee as CP${ex}OrderFee, CP${ex}.fundingFee AS CP${ex}FundingFee, 
        `,
).join("\n")

// 2. Generate the LEFT JOIN clauses dynamically
const exchangeJoins = EXCHANGE_NAME.map(
    (ex) => `LEFT JOIN ${ex.toLowerCase()}Txs AS OP${ex} ON OP${ex}.id = optx.${ex.toLowerCase()}Id\n
            LEFT JOIN ${ex.toLowerCase()}Txs AS CP${ex} ON CP${ex}.id = cptx.${ex.toLowerCase()}Id`,
).join("\n")

export const fundingRateDataRouter = express.Router()

export const fundingRateDatabase_createTablesIfNotExists = async (
    symbol?: string,
    typedTxs?: { symbol: EXCHANGE_NAME },
    db?: Database,
) => {
    if (!db) db = database.fundingRateDB as Database
    let sqlStrings: string[] = []

    if (symbol) {
        symbol = symbol.toLowerCase()
        sqlStrings.push(
            `
            CREATE TABLE IF NOT EXISTS ${symbol}Txs (
            positionId INTEGER UNIQUE,
            amount REAL NOT NULL,
            ratio REAL NOT NULL,
            username TEXT NOT NULL DEFAULT 'admin',

            FOREIGN KEY (positionId) REFERENCES closedPositions (id) ON DELETE CASCADE
        );`,
        )
    }

    if (typedTxs)
        sqlStrings.push(`CREATE TABLE IF NOT EXISTS ${typedTxs.symbol}Txs (
                                id TEXT UNIQUE,
                                username TEXT NOT NULL DEFAULT 'admin',

                                price REAL NOT NULL,
                                orderFee REAL NOT NULL,
                                fundingFee REAL NOT NULL,
                                
                                tokenIn TEXT NOT NULL,
                                tokenOut TEXT NOT NULL,

                                FOREIGN KEY (id) REFERENCES transactions (${typedTxs.symbol}Id) ON DELETE CASCADE
                            );`)

    for (let i = 0; i < sqlStrings.length; i++) {
        try {
            await db.run(sqlStrings[i])
        } catch (err: any) {
            console.error(err)
            throw err
        }
    }
}
var FRData: FRComparisonTableData[] =
    // = []
    // const tm
    [
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "CELO",
            direction: "same",
            difference: 0.00035957740000000006,
            hourly: 0.00035957740000000006,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0005419992000000005,
            costRate: 0.002,
            estimatedProfitRatio: -0.0014580007999999995,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0002918275,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0006514049,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ENA",
            direction: "same",
            difference: 0.00017081270000000003,
            hourly: 0.00017081270000000003,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.00017081270000000003,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018291873,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0001832675,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000124548,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PROMPT",
            direction: "same",
            difference: 0.0001545039,
            hourly: 0.0001545039,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0001545039,
            costRate: 0.0031000000000000003,
            estimatedProfitRatio: -0.0029454961,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00025819,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0001036861,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "CFX",
            direction: "opposite",
            difference: 0.0000711582,
            hourly: 0.0000711582,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0002471328,
            costRate: 0.002,
            estimatedProfitRatio: -0.0017528672,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000586582,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ZETA",
            direction: "opposite",
            difference: 0.0000639557,
            hourly: 0.0000639557,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00011541140000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018845886,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1745992800000,
                    intervalHr: 2,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000514557,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MELANIA",
            direction: "same",
            difference: 0.00005602510000000001,
            hourly: 0.00005602510000000001,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.00005602510000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019439749,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000651875,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000091624,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "RUNE",
            direction: "opposite",
            difference: 0.0000522825,
            hourly: 0.0000522825,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00008978250000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019102175,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000397825,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SUPER",
            direction: "opposite",
            difference: 0.0000500872,
            hourly: 0.0000500872,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0001628488,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018371512,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000375872,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "REZ",
            direction: "opposite",
            difference: 0.0000498191,
            hourly: 0.0000498191,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0001617764,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018382236000000001,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000373191,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "POL",
            direction: "opposite",
            difference: 0.0000485922,
            hourly: 0.0000485922,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0001568688,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018431312,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000360922,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "COMP",
            direction: "same",
            difference: 0.000047623050000000005,
            hourly: 0.000047623050000000005,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00021298559999999994,
            costRate: 0.002,
            estimatedProfitRatio: -0.0017870144,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00007424625,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0001218693,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ARB",
            direction: "opposite",
            difference: 0.0000468208,
            hourly: 0.0000468208,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0001497832,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018502168,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000343208,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ALGO",
            direction: "same",
            difference: 0.000039535150000000004,
            hourly: 0.000039535150000000004,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0002342512,
            costRate: 0.002,
            estimatedProfitRatio: -0.0017657488,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00001025375,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000497889,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "IO",
            direction: "opposite",
            difference: 0.0000389293,
            hourly: 0.0000389293,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00011821720000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018817828,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000264293,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BCH",
            direction: "opposite",
            difference: 0.0000386237,
            hourly: 0.0000386237,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000559673,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019440327,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000328425,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000057812,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "AR",
            direction: "opposite",
            difference: 0.0000358607,
            hourly: 0.0000358607,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00010594280000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018940572,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000233607,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MAV",
            direction: "opposite",
            difference: 0.0000341736,
            hourly: 0.0000341736,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000991944,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019008056,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000216736,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "GMT",
            direction: "opposite",
            difference: 0.00003262675,
            hourly: 0.00003262675,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00009659574999999999,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019034042500000001,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00001130375,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.000021323,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ACE",
            direction: "opposite",
            difference: 0.0000320887,
            hourly: 0.0000320887,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00009085480000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019091452,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000195887,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "FARTCOIN",
            direction: "same",
            difference: 0.0000316817,
            hourly: 0.0000316817,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0002534536,
            costRate: 0.002,
            estimatedProfitRatio: -0.0017465464,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000441817,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BERA",
            direction: "same",
            difference: 0.000030437699999999995,
            hourly: 0.000030437699999999995,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00012175079999999998,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018782492,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.000033985,
                    nextFundingTime: 1745992800000,
                    intervalHr: 2,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000644227,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ZEREBRO",
            direction: "same",
            difference: 0.000030270299999999997,
            hourly: 0.000030270299999999997,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00024216239999999998,
            costRate: 0.002,
            estimatedProfitRatio: -0.0017578376000000001,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000285475,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000588178,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PYTH",
            direction: "opposite",
            difference: 0.0000302424,
            hourly: 0.0000302424,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00008346960000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019165304,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000177424,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "DYM",
            direction: "same",
            difference: 0.0000295014,
            hourly: 0.0000295014,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000295014,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019704986,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000376675,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000081661,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ZRO",
            direction: "opposite",
            difference: 0.0000293211,
            hourly: 0.0000293211,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00007978440000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019202156,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000168211,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "TNSR",
            direction: "opposite",
            difference: 0.0000289529,
            hourly: 0.0000289529,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000783116,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019216884,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000164529,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "RENDER",
            direction: "opposite",
            difference: 0.0000277305,
            hourly: 0.0000277305,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000073422,
            costRate: 0.002,
            estimatedProfitRatio: -0.001926578,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000152305,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "DOT",
            direction: "opposite",
            difference: 0.000027543750000000002,
            hourly: 0.000027543750000000002,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00006504375,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019349562500000001,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00001504375,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BNB",
            direction: "opposite",
            difference: 0.0000271112,
            hourly: 0.0000271112,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0001010198,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018989802,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.000002475,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000246362,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "VVV",
            direction: "opposite",
            difference: 0.000027110000000000003,
            hourly: 0.000027110000000000003,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00006461,
            costRate: 0.0031000000000000003,
            estimatedProfitRatio: -0.0030353900000000002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00001461,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "LINK",
            direction: "opposite",
            difference: 0.0000266625,
            hourly: 0.0000266625,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00006416250000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019358375,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000141625,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BLAST",
            direction: "same",
            difference: 0.000023379399999999995,
            hourly: 0.000023379399999999995,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0019644248,
            costRate: 0.002,
            estimatedProfitRatio: -0.0000355752,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0002689325,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0002923119,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "NEAR",
            direction: "opposite",
            difference: 0.0000230225,
            hourly: 0.0000230225,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000605225,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019394775,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000105225,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SPX",
            direction: "opposite",
            difference: 0.000022824599999999998,
            hourly: 0.000022824599999999998,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000053798399999999996,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019462016,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000103246,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ADA",
            direction: "opposite",
            difference: 0.0000226467,
            hourly: 0.0000226467,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00006126180000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019387382,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.000009775,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000128717,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ONDO",
            direction: "opposite",
            difference: 0.0000222229,
            hourly: 0.0000222229,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000561916,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019438084000000001,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000109,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000113229,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SUSHI",
            direction: "opposite",
            difference: 0.0000217925,
            hourly: 0.0000217925,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000592925,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019407075,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000092925,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MOVE",
            direction: "opposite",
            difference: 0.000020355399999999998,
            hourly: 0.000020355399999999998,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000028210799999999998,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019717892,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1745992800000,
                    intervalHr: 2,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000078554,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "AIXBT",
            direction: "opposite",
            difference: 0.0000186102,
            hourly: 0.0000186102,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000036940800000000004,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019630592,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000061102,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "UMA",
            direction: "opposite",
            difference: 0.000017825,
            hourly: 0.000017825,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000055325,
            costRate: 0.002,
            estimatedProfitRatio: -0.001944675,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.000005325,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SOL",
            direction: "opposite",
            difference: 0.000017345,
            hourly: 0.000017345,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000054845,
            costRate: 0.002,
            estimatedProfitRatio: -0.001945155,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.000004845,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "LTC",
            direction: "opposite",
            difference: 0.00001695125,
            hourly: 0.00001695125,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00005445125,
            costRate: 0.002,
            estimatedProfitRatio: -0.00194554875,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00000445125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PNUT",
            direction: "opposite",
            difference: 0.0000168456,
            hourly: 0.0000168456,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000029882400000000004,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019701176,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000043456,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "RSR",
            direction: "opposite",
            difference: 0.0000158408,
            hourly: 0.0000158408,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000258632,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019741368,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000033408,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "DOGE",
            direction: "opposite",
            difference: 0.000014972500000000001,
            hourly: 0.000014972500000000001,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000524725,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019475275,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000024725,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ETH",
            direction: "opposite",
            difference: 0.00001433,
            hourly: 0.00001433,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000051830000000000004,
            costRate: 0.002,
            estimatedProfitRatio: -0.00194817,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00000183,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "POLYX",
            direction: "same",
            difference: 0.0000124635,
            hourly: 0.0000124635,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000124635,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019875365,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 3.65e-8,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "TON",
            direction: "same",
            difference: 0.0000120138,
            hourly: 0.0000120138,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000120138,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019879862000000002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 4.862e-7,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "AVAX",
            direction: "same",
            difference: 0.000011818750000000001,
            hourly: 0.000011818750000000001,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000891,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019109,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 6.8125e-7,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ETC",
            direction: "same",
            difference: 0.000010121400000000001,
            hourly: 0.000010121400000000001,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0001562488,
            costRate: 0.002,
            estimatedProfitRatio: -0.0018437512,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000296525,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000397739,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "TRX",
            direction: "same",
            difference: 0.000010100000000000002,
            hourly: 0.000010100000000000002,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000616,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019384,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000024,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "OM",
            direction: "same",
            difference: 0.000008903900000000001,
            hourly: 0.000008903900000000001,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.000008903900000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019910961,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000035961,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BTC",
            direction: "same",
            difference: 0.00000873125,
            hourly: 0.00000873125,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000397,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019603,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000376875,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "AAVE",
            direction: "same",
            difference: 0.00000780875,
            hourly: 0.00000780875,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000024940000000000002,
            costRate: 0.002,
            estimatedProfitRatio: -0.00197506,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000469125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BANANA",
            direction: "same",
            difference: 0.0000077131,
            hourly: 0.0000077131,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000077131,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019922869,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000047869,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "FIL",
            direction: "same",
            difference: 0.0000075175000000000004,
            hourly: 0.0000075175000000000004,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000020280000000000002,
            costRate: 0.002,
            estimatedProfitRatio: -0.00197972,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000049825,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SNX",
            direction: "same",
            difference: 0.000007207800000000001,
            hourly: 0.000007207800000000001,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.000007207800000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019927922000000002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000052922,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MKR",
            direction: "same",
            difference: 0.000006840000000000001,
            hourly: 0.000006840000000000001,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000009440000000000004,
            costRate: 0.002,
            estimatedProfitRatio: -0.00199056,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000566,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "TAO",
            direction: "same",
            difference: 0.0000068179,
            hourly: 0.0000068179,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000068179,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019931821,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000056821,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "TRB",
            direction: "same",
            difference: 0.0000061681,
            hourly: 0.0000061681,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000061681,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019938319,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000063319,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SAND",
            direction: "same",
            difference: 0.000006113999999999999,
            hourly: 0.000006113999999999999,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.000006113999999999999,
            costRate: 0.002,
            estimatedProfitRatio: -0.001993886,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00001209,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.000005976,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "NEO",
            direction: "same",
            difference: 0.0000059386000000000044,
            hourly: 0.0000059386000000000044,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00029811119999999995,
            costRate: 0.002,
            estimatedProfitRatio: -0.0017018888000000002,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.0000432025,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000491411,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "STX",
            direction: "same",
            difference: 0.000005935700000000001,
            hourly: 0.000005935700000000001,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.000005935700000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019940643,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000065643,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "STG",
            direction: "same",
            difference: 0.000005903750000000001,
            hourly: 0.000005903750000000001,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000005539999999999991,
            costRate: 0.002,
            estimatedProfitRatio: -0.00199446,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000659625,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "APT",
            direction: "same",
            difference: 0.00000559085,
            hourly: 0.00000559085,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.00000559085,
            costRate: 0.002,
            estimatedProfitRatio: -0.00199440915,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000940875,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000038179,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ATOM",
            direction: "same",
            difference: 0.00000525875,
            hourly: 0.00000525875,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00001586,
            costRate: 0.002,
            estimatedProfitRatio: -0.00198414,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000724125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "NOT",
            direction: "same",
            difference: 0.000004674600000000001,
            hourly: 0.000004674600000000001,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.000004674600000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019953254,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000078254,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "CAKE",
            direction: "same",
            difference: 0.000004271200000000001,
            hourly: 0.000004271200000000001,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.000004271200000000001,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019957288,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000082288,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SEI",
            direction: "same",
            difference: 0.0000035871499999999996,
            hourly: 0.0000035871499999999996,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000007387199999999996,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019926128,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00000266375,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000062509,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SUI",
            direction: "same",
            difference: 0.0000031340499999999997,
            hourly: 0.0000031340499999999997,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000031340499999999997,
            costRate: 0.002,
            estimatedProfitRatio: -0.00199686595,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: -0.00000607625,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: -0.0000029422,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BOME",
            direction: "same",
            difference: 0.0000023470000000000006,
            hourly: 0.0000023470000000000006,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.000018776000000000005,
            costRate: 0.002,
            estimatedProfitRatio: -0.001981224,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000556,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.000007907,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "KAITO",
            direction: "same",
            difference: 0.0000023077,
            hourly: 0.0000023077,
            nextFundingIntervalMs: 1745992800000,
            estimatedFR: 0.0000023077,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019976923000000002,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1745992800000,
                    intervalHr: 2,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000101923,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 3958189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MNT",
            direction: "same",
            difference: 0.0000022075000000000005,
            hourly: 0.0000022075000000000005,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00006468,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019353200000000001,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000102925,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "APE",
            direction: "same",
            difference: 0.0000021337500000000014,
            hourly: 0.0000021337500000000014,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00006585999999999998,
            costRate: 0.002,
            estimatedProfitRatio: -0.00193414,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00001036625,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "GMX",
            direction: "same",
            difference: 0.0000019798499999999998,
            hourly: 0.0000019798499999999998,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0.0000019798499999999998,
            costRate: 0.002,
            estimatedProfitRatio: -0.00199802015,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.00000467375,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000026939,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "XRP",
            direction: "same",
            difference: 0.0000017000000000000007,
            hourly: 0.0000017000000000000007,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.0000728,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019272,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000108,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "CRV",
            direction: "same",
            difference: 0.0000015525000000000008,
            hourly: 0.0000015525000000000008,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0.00007515999999999999,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019248400000000001,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000109475,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "STRK",
            direction: "same",
            difference: 2.5000000000000608e-8,
            hourly: 2.5000000000000608e-8,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 2.0000000000000486e-7,
            costRate: 0.002,
            estimatedProfitRatio: -0.0019998,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.000012475,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "AI16Z",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ALT",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ANIME",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1745992800000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1745992800000,
                    intervalHr: 2,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 3958189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ARK",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BIGTIME",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BLUR",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BRETT",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "BSV",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "CHILLGUY",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "DYDX",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ENS",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ETHFI",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "FXS",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "GALA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "GAS",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1745992800000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1745992800000,
                    intervalHr: 2,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 3958189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "GOAT",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "GRIFFAIN",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "HBAR",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "HYPER",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "IMX",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "INJ",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "IOTA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "JTO",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "JUP",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "KAS",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "LDO",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MANTA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MAVIA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MEME",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MERL",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MEW",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MINA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MOODENG",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "MORPHO",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "NEIROETH",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "OGN",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "OMNI",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "OP",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ORDI",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PAXG",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PENDLE",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PENGU",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "PEOPLE",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "POPCAT",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "REQ",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "SAGA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "S",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "TIA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "UNI",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "USTC",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "VINE",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "VIRTUAL",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "WCT",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1745989200000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 2,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 358189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "WIF",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "WLD",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "W",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "XAI",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "XLM",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "YGG",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ZEN",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 8,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 8,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ZK",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
        {
            pair: "BYBIT-HYPERLIQUID",
            symbol: "ZORA",
            direction: "same",
            difference: 0,
            hourly: 0,
            nextFundingIntervalMs: 1746000000000,
            estimatedFR: 0,
            costRate: 0.002,
            estimatedProfitRatio: -0.002,
            minRunningHrAssumed: 4,
            fundingInfo: [
                {
                    name: "BYBIT",
                    funding: 0.0000125,
                    nextFundingTime: 1746000000000,
                    intervalHr: 4,
                },
                {
                    name: "HYPERLIQUID",
                    funding: 0.0000125,
                    nextFundingTime: 1745989200000,
                    intervalHr: 1,
                },
            ],
            TimeToNextFunding: 11158189,
        },
    ]

// a middleware function with no mount path. This code is executed for every request to the router
fundingRateDataRouter.use((req: Request, res: Response, next: NextFunction) => {
    const db = database.fundingRateDB
    if (!db) res.status(500).send()

    next()
})

fundingRateDataRouter.post("/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!
    const data: arbFRPositionData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await insertAddressIfNotExists(db, _data.address, username)

            let openingId = ""
            let closingId = ""

            let closingTimestamp = 0
            let error = new Error()

            const promises = _data.txs.map(async ({ timestamp, type, qty, typedTxs }) => {
                let sqlStrings: string[] = []

                if (type === "CLOSE") {
                    closingTimestamp = timestamp
                    closingId = randomUUID()
                } else {
                    openingId = randomUUID()
                }

                await fundingRateDatabase_createTablesIfNotExists(undefined, { symbol: typedTxs[0].typedSymbol })
                await fundingRateDatabase_createTablesIfNotExists(undefined, { symbol: typedTxs[1].typedSymbol })

                const txs = await db.all(
                    `SELECT * FROM transactions AS tx WHERE tx.${typedTxs[0].typedSymbol}Id = "${typedTxs[0].id}" AND tx.${typedTxs[1].typedSymbol}Id = "${typedTxs[1].id}" AND tx.username = "${username}";`,
                )
                if (txs.length === 0) {
                    // Tx not exists, insert it
                    sqlStrings.push(
                        `INSERT INTO transactions (uuid, timestamp, address, ${typedTxs[0].typedSymbol}Id, ${
                            typedTxs[1].typedSymbol
                        }Id, qty, username) VALUES ("${type === "CLOSE" ? closingId : openingId}", ${timestamp}, "${
                            _data.address
                        }", "${typedTxs[0].id}", "${typedTxs[1].id}", ${qty}, "${username}");`,
                    )

                    // Exchange Txs
                    for (let j = 0; j < typedTxs.length; j++) {
                        const typedTx = typedTxs[j]
                        const { price, orderFee, fundingFee } = typedTx
                        sqlStrings.push(
                            `INSERT INTO ${typedTx.typedSymbol}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES ("${typedTx.id}", ${price}, ${orderFee}, ${fundingFee},"${typedTx.tokenIn.symbol}", "${typedTx.tokenOut.symbol}", "${username}");`,
                        )
                    }

                    for (let i = 0; i < sqlStrings.length; i++) {
                        try {
                            await db.run(sqlStrings[i])
                            console.log(`Inserted! ${sqlStrings[i]}`)
                        } catch (err: any) {
                            console.error(err)
                        }
                    }
                } else {
                    console.log(`skipping... tx exists, tx type: ${type} --`, JSON.stringify(_data.txs, null, "  "))

                    if (type === "CLOSE") {
                        // closingTimestamp = txs[0].timestamp
                        // closingId = txs[0].uuid

                        // Closing tx should not exists on the database before insertion
                        error.name = "FAILED TO INSERT CLOSED TX"
                        error.message = `Skipping close tx, which should not have occur. pos.tx:${JSON.stringify(
                            _data.txs,
                            null,
                            "  ",
                        )}`
                        throw error
                    } else {
                        openingId = txs[0].uuid
                    }
                }
            })
            await Promise.all(promises)

            if (closingTimestamp === 0) throw new Error(`Missing closingTimestamp: ${closingTimestamp}`)
            console.log("openingId:", openingId)
            console.log("closingId:", closingId)

            await db.run(
                `INSERT INTO closedPositions (timestamp, openingId, closingId, username) VALUES (${closingTimestamp}, '${openingId}', '${closingId}', '${username}');`,
            )

            const closedPositions = await db.all(
                `SELECT * FROM closedPositions AS pos WHERE pos.openingId = "${openingId}" AND pos.closingId = "${closingId}" AND pos.username = '${username}';`,
            )
            console.log("closedPositions:", closedPositions)
            if (closedPositions.length === 0 || closedPositions.length > 1)
                throw new Error(
                    `failed to extract closedPosition id: \nopeningId:${JSON.stringify(
                        openingId,
                        null,
                        "  ",
                    )},\nclosingId:${JSON.stringify(closingId, null, "  ")}`,
                )

            // Insert specific Coin Txs
            const specificTx = Object.keys(_data.profit)
            for await (const symbol of specificTx) {
                await fundingRateDatabase_createTablesIfNotExists(symbol)

                const _sqlString = `INSERT INTO ${symbol.toLowerCase()}Txs (positionId, amount, ratio, username) VALUES (${
                    closedPositions[0].id
                }, ${_data.profit[symbol].amount}, ${_data.profit[symbol].ratio}, '${username}');`

                await db.run(_sqlString)
            }

            // Removing the corresponding openedPosition
            console.log(`Removing openedPosition with openingId: ${openingId}`)
            await database.removedOpenedPosition(openingId, username, database.fundingRateDB!)
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/accounts/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database

    const addresses = req.body.address as string[]

    if (!addresses || addresses.length === 0) res.status(400).send("Missing params")

    try {
        for (const address of addresses) {
            try {
                await insertAddressIfNotExists(db, address, req.user!)
            } catch (err: any) {
                console.log(`${address} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/tx/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!
    const data: spotFutureCoinProfitData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const tx = data[i]
            if (!tx) continue

            // Insert specific Txs
            await fundingRateDatabase_createTablesIfNotExists(tx.symbol)
            let _sqlString = `INSERT INTO ${tx.symbol}Txs (positionId, amount, ratio, username) VALUES (${tx.positionId}, ${tx.amount}, ${tx.ratio}, '${username}');`

            try {
                await db.run(_sqlString)
            } catch (err: any) {
                console.log(`${_sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/txs", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!

    try {
        const txRows = await db.all(
            `SELECT uuid, timestamp, address, qty, futurePrice, spotPrice, orderFee, fundingFee,
                    bybitId, bybit.tokenIn AS bybitTokenIn, bybit.tokenOut AS bybitTokenOut, bybit.price AS bybitPrice, bybit.orderFee as bybitOrderFee, bybit.fundingFee AS bybitFundingFee, 
                    gateId, gate.tokenIn AS gateTokenIn, gate.tokenOut AS gateTokenOut, gate.price AS gatePrice, gate.orderFee as gateOrderFee, gate.fundingFee AS gateFundingFee,
                    binanceId, binance.tokenIn AS binanceTokenIn, binance.tokenOut AS binanceTokenOut, binance.price AS binancePrice, binance.orderFee as binanceOrderFee, binance.fundingFee AS binanceFundingFee,
                    hlId, hl.tokenIn AS hlTokenIn, hl.tokenOut AS hlTokenOut, hl.price AS hlPrice, hl.orderFee as hlOrderFee, hl.fundingFee AS hlFundingFee,
                    osmId, osm.tokenIn AS osmTokenIn, osm.tokenOut AS osmTokenOut, osm.price AS osmPrice, osm.orderFee as osmOrderFee, osm.fundingFee AS osmFundingFee,
                    injId, inj.tokenIn AS injTokenIn, inj.tokenOut AS injTokenOut, inj.price AS injPrice, inj.orderFee as injOrderFee, inj.fundingFee AS injFundingFee,
                    dydxId, dydx.tokenIn AS dydxTokenIn, dydx.tokenOut AS dydxTokenOut, dydx.price AS dydxPrice, dydx.orderFee as dydxOrderFee, dydx.fundingFee AS dydxFundingFee,
                    boltId, bolt.tokenIn AS boltTokenIn, bolt.tokenOut AS boltTokenOut, bolt.price AS boltPrice, bolt.orderFee as boltOrderFee, bolt.fundingFee AS boltFundingFee,
                    suilId, suil.tokenIn AS suilTokenIn, suil.tokenOut AS suilTokenOut, suil.price AS suilPrice, suil.orderFee as suilOrderFee, suil.fundingFee AS suilFundingFee
                    FROM transactions AS tx

                    LEFT JOIN bybitTxs AS bybit ON bybit.id = tx.bybitId
                    LEFT JOIN gateTxs AS gate ON gate.id = tx.gateId
                    LEFT JOIN binanceTxs AS binance ON binance.id = tx.binanceId

                    LEFT JOIN hlTxs AS hl ON hl.id = tx.hlId
                    LEFT JOIN osmTxs AS osm ON osm.id = tx.osmId
                    LEFT JOIN injTxs AS inj ON gate.id = tx.injId
                    LEFT JOIN dydxTxs AS dydx ON dydx.id = tx.dydxId
                    LEFT JOIN boltTxs AS bolt ON bolt.id = tx.boltId
                    LEFT JOIN suilTxs AS suil ON suil.id = tx.suilId
            WHERE tx.username = "${username}"
            ${
                req.body.timestamp_begin
                    ? `AND timestamp BETWEEN ${req.body.timestamp_begin} AND ${req.body.timestamp_end || Date.now()}`
                    : ""
            }
            ORDER BY timestamp DESC
            ;`,
        )

        res.status(200).json(txRows)
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/txs/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!
    const data: fRTxsData[] = req.body.data
    // console.log("txs/update data:", data)
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        let isError = false
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await insertAddressIfNotExists(db, _data.address, username)

            let sqlString: string = `INSERT INTO transactions (uuid, timestamp, address, ${_data.EX1.name}Id, ${_data.EX2.name}Id, qty, username) VALUES ("${_data.uuid}", ${_data.timestamp}, "${_data.address}", "${_data.EX1.id}", "${_data.EX2.id}", ${_data.qty}, "${username}");`

            try {
                await db.run(sqlString)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
                isError = true
            }
        }

        if (!isError) res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/txs/updateFR", async (req: Request, res: Response) => {
    // const db = database.fundingRateDB as Database
    const data: {
        typedSymbol: "bybit" | "gate" | "binance" | "osm" | "inj" | "dydx" | "hl" | "bolt" | "suil"
        openingId: string
        fundingFee: number
    }[] = req.body.data
    // console.log("txs/update data:", data)
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        let isError = false
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue
            try {
                await database.FRupdateTransactionFR(
                    _data.typedSymbol as unknown as EXCHANGE_NAME,
                    _data.openingId,
                    _data.fundingFee,
                    req.user!,
                    database.fundingRateDB!,
                )
            } catch (err: any) {
                // console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
                isError = true
            }
        }

        if (!isError) res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/closedPositions/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!
    const data: FRdb_typed["closedPositions"][] = req.body.data
    // console.log("txs/update data:", data)
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlString: string = `INSERT INTO closedPositions (timestamp, openingId, closingId, username) VALUES (${_data.timestamp}, '${_data.openingId}', '${_data.closingId}', '${username}');`

            try {
                await db.run(sqlString)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/openedPositions", async (req: Request, res: Response) => {
    try {
        const db = database.fundingRateDB as Database
        const username = req.user!

        const openedPositions = await db.all(
            `
                SELECT tx.uuid, tx.timestamp, tx.address, tx.qty, 
                    bybitId, bybit.tokenIn AS bybitTokenIn, bybit.tokenOut AS bybitTokenOut, bybit.price AS bybitPrice, bybit.orderFee as bybitOrderFee, bybit.fundingFee AS bybitFundingFee, 
                    gateId, gate.tokenIn AS gateTokenIn, gate.tokenOut AS gateTokenOut, gate.price AS gatePrice, gate.orderFee as gateOrderFee, gate.fundingFee AS gateFundingFee,
                    binanceId, binance.tokenIn AS binanceTokenIn, binance.tokenOut AS binanceTokenOut, binance.price AS binancePrice, binance.orderFee as binanceOrderFee, binance.fundingFee AS binanceFundingFee,
                    hlId, hl.tokenIn AS hlTokenIn, hl.tokenOut AS hlTokenOut, hl.price AS hlPrice, hl.orderFee as hlOrderFee, hl.fundingFee AS hlFundingFee,
                    osmId, osm.tokenIn AS osmTokenIn, osm.tokenOut AS osmTokenOut, osm.price AS osmPrice, osm.orderFee as osmOrderFee, osm.fundingFee AS osmFundingFee,
                    injId, inj.tokenIn AS injTokenIn, inj.tokenOut AS injTokenOut, inj.price AS injPrice, inj.orderFee as injOrderFee, inj.fundingFee AS injFundingFee,
                    dydxId, dydx.tokenIn AS dydxTokenIn, dydx.tokenOut AS dydxTokenOut, dydx.price AS dydxPrice, dydx.orderFee as dydxOrderFee, dydx.fundingFee AS dydxFundingFee,
                    boltId, bolt.tokenIn AS boltTokenIn, bolt.tokenOut AS boltTokenOut, bolt.price AS boltPrice, bolt.orderFee as boltOrderFee, bolt.fundingFee AS boltFundingFee,
                    suilId, suil.tokenIn AS suilTokenIn, suil.tokenOut AS suilTokenOut, suil.price AS suilPrice, suil.orderFee as suilOrderFee, suil.fundingFee AS suilFundingFee
                    FROM openedPositions as OP

                    LEFT JOIN transactions AS tx ON tx.uuid = OP.openingId
                    LEFT JOIN bybitTxs AS bybit ON bybit.id = tx.bybitId
                    LEFT JOIN gateTxs AS gate ON gate.id = tx.gateId
                    LEFT JOIN binanceTxs AS binance ON binance.id = tx.binanceId

                    LEFT JOIN hlTxs AS hl ON hl.id = tx.hlId
                    LEFT JOIN osmTxs AS osm ON osm.id = tx.osmId
                    LEFT JOIN injTxs AS inj ON gate.id = tx.injId
                    LEFT JOIN dydxTxs AS dydx ON dydx.id = tx.dydxId
                    LEFT JOIN boltTxs AS bolt ON bolt.id = tx.boltId
                    LEFT JOIN suilTxs AS suil ON suil.id = tx.suilId

                    WHERE (tx.bybitId IS NOT NULL OR tx.gateId IS NOT NULL OR tx.binanceId IS NOT NULL OR tx.hlId IS NOT NULL OR tx.osmId IS NOT NULL OR tx.injId IS NOT NULL OR tx.dydxId IS NOT NULL OR tx.boltId IS NOT NULL OR tx.suilId IS NOT NULL)
            AND tx.username = "${username}"
            ${
                req.body.timestamp_begin
                    ? `AND tx.timestamp BETWEEN ${req.body.timestamp_begin} AND ${req.body.timestamp_end || Date.now()}`
                    : ""
            }
            ORDER BY tx.timestamp DESC;`,
        )

        res.status(200).json(openedPositions)
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/openedPositions/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!

    const data: FRdb_typed["openedPositions"][] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlString: string = `INSERT INTO openedPositions (timestamp, openingId, username) VALUES (${_data.timestamp}, '${_data.openingId}', '${username}');`
            try {
                await db.run(sqlString)
            } catch (err: any) {
                console.log(`${sqlString} Insertion Failed!`)
                console.error(err)
                res.status(500).send()
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.put("/openedPositions/update", async (req: Request, res: Response) => {
    // const db = database.fundingRateDB as Database
    console.log("openedPositions/update data:", req.method, req.body)

    const data: FRdb_typed["openedPositions"][] = req.body
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            await database.removedOpenedPosition(_data.openingId, req.user!, database.fundingRateDB!)
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/typedTxs/update", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!
    const data: fRTypedTxsData[] = req.body.data

    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")

    try {
        for (let i = 0; i < data.length; i++) {
            const _data = data[i]
            if (!_data) continue

            let sqlStrings: string[] = []

            await fundingRateDatabase_createTablesIfNotExists(undefined, {
                symbol: _data.typed as EXCHANGE_NAME,
            })
            sqlStrings.push(
                `INSERT INTO ${_data.typed}Txs (id, price, orderFee, fundingFee, tokenIn, tokenOut, username) VALUES ('${_data.id}', ${_data.price}, ${_data.orderFee}, ${_data.fundingFee}, '${_data.tokenIn}', '${_data.tokenOut}', '${username}');`,
            )

            for (let i = 0; i < sqlStrings.length; i++) {
                try {
                    await db.run(sqlStrings[i])
                } catch (err: any) {
                    console.log(`${sqlStrings[i]} Insertion Failed!`)
                    console.error(err)
                    res.status(500).send()
                }
            }
        }

        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.post("/typedTx", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!

    try {
        // All exchange (typed) transaction rows owned by the caller.
        const rows: any[] = []
        for (const ex of EXCHANGE_NAME) {
            const txs = await db.all(`SELECT * FROM ${ex}Txs WHERE username = ?`, [username])
            for (const tx of txs) rows.push({ ...tx, exchange: ex })
        }
        return res.status(200).json(rows)
    } catch (err: any) {
        console.error(err)
        return res.status(500).send()
    }
})

fundingRateDataRouter.post("/profits-details/pairing/batch", async (req: Request, res: Response) => {
    try {
        const db = database.fundingRateDB as Database
        const username = req.user!
        // console.log("fundingRDataRouter -- req.body.pairings", req.body.pairings)
        const pairings = req.body.pairings as pairing[] | undefined
        const address = req.body.address

        // ── Pagination parameters ──────────────────────────────────────────────
        const page = Math.max(1, parseInt(req.body.page) || 1)
        const limit = Math.min(100, parseInt(req.body.limit) || 50)
        const offset = (page - 1) * limit

        // ── Timestamp filters (optional) ──────────────────────────────────────
        const timestampBegin = req.body.timestamp_begin
        const timestampEnd = req.body.timestamp_end

        if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
            return res.status(400).send("Missing or invalid symbols array")
        }
        // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
        const exchangeNames = EXCHANGE_NAME.map((e) => `'${e}Txs'`).join(", ")
        const validTables = await db.all(
            `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN (${exchangeNames}, 'transactions')`,
        )
        const validSymbols = validTables.map((row: any) => row.name.replace(/Txs$/, "").toLowerCase())
        const filteredPairings = Array.from(pairings)
            .filter((data, i) => {
                const { baseSymbol, quoteSymbol } = data
                if (
                    (baseSymbol && !validSymbols.includes(baseSymbol.toLowerCase())) ||
                    !validSymbols.includes(quoteSymbol.toLowerCase()) ||
                    baseSymbol === quoteSymbol
                ) {
                    return undefined
                }
                return data
            })
            .filter((s) => s !== undefined)
        if (filteredPairings.length === 0) {
            return res.status(400).send("No valid pairings provided")
        }
        const params = {
            endpoint: `${CACHE_KEY_TYPE}:profits-details:pairing:aggregated:batch`,
            type: CACHE_KEY_TYPE,
            username: username,
            address: address,
            interval: "raw",
            pairings: filteredPairings,
            page: page.toString(),
            limit: limit.toString(),
            timestampBegin,
            timestampEnd,
        }
        // console.log("fundingRDataRouter -- params: ", params)
        const cacheKey = generateCacheKey(params)
        const cached = aggCache.get(cacheKey)
        if (cached) return res.status(200).json(cached)

        // ── 3. Run queries for each pairing in parallel ──────────────────────
        const results: { [key: string]: profitIntervalType[] } = {}
        let totalCount = 0
        // await fundingRateDatabase_createTablesIfNotExists(symbol)
        await Promise.all(
            filteredPairings.map(async ({ baseSymbol, quoteSymbol }) => {
                const base = baseSymbol ? baseSymbol.toUpperCase() : "ALL"
                const quote = quoteSymbol.toLowerCase()
                try {
                    // await spotFutureDatabase_createTablesIfNotExists(symbol)
                    // ----- Build base WHERE conditions (shared by data & count) -----
                    let whereConditions: string[] = ["cp.timestamp IS NOT NULL", "cp.username = ?"]
                    let whereParams: any[] = [username]
                    // console.log("base quote", base, quote)

                    if (base !== "ALL") {
                        let tokenInConditions: string[] = []
                        for (const ex of EXCHANGE_NAME) {
                            tokenInConditions.push(`OP${ex}.tokenIn = ? OR OP${ex}.tokenOut = ?`)

                            whereParams.push(...[base, base])
                        }
                        const tokenInSql = "(" + tokenInConditions.join(" OR ") + ")"

                        let tokenOutConditions: string[] = []
                        for (const ex of EXCHANGE_NAME) {
                            tokenOutConditions.push(`CP${ex}.tokenIn = ? OR CP${ex}.tokenOut = ?`)

                            whereParams.push(...[base, base])
                        }
                        const tokenOutSql = tokenOutConditions.join(" OR ")

                        whereConditions.push(tokenInSql + " AND " + tokenOutSql)
                    }
                    if (address) {
                        whereConditions.push("optx.address = ?")
                        whereParams.push(address)
                    }
                    if (timestampBegin) {
                        whereConditions.push("cp.timestamp >= ?")
                        whereParams.push(timestampBegin)
                    }
                    if (timestampEnd) {
                        whereConditions.push("cp.timestamp <= ?")
                        whereParams.push(timestampEnd)
                    }

                    const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : ""
                    let dataSql = `
                        SELECT cp.closingId AS closingUUID, cp.openingId AS openingUUID, cp.timestamp, optx.address, optx.qty,
            
                            ${exchangeSelectFields}
                            
                            ${quote}.amount, ${quote}.ratio

                            FROM closedPositions AS cp
                            LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                            LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                            ${exchangeJoins}
                            
                            INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id

                            ${whereClause}
                            ORDER BY cp.timestamp DESC
                            LIMIT ? OFFSET ? ;
                        `
                    const dataParams = [...whereParams, limit, offset]
                    // console.log("data sql", dataSql, whereParams)
                    const dataRows = await db.all(dataSql, dataParams)

                    // ----- Count query (no pagination) -----
                    let countSql = `
                        SELECT COUNT(*) AS total
                            FROM closedPositions AS cp
                            LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                            LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                            ${exchangeJoins}
                            
                            INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                            ${whereClause};
                    `
                    const countResult = await db.get(countSql, whereParams)
                    // console.log("spotFuture -- countResult: ", countResult)
                    const count = countResult?.total || 0
                    totalCount += count

                    // ----- Map rows to output format -----
                    results[base] = dataRows
                        .map((row: any, index: number) => {
                            if (!row.timestamp) return undefined
                            const _quote = quote.toUpperCase()

                            const exchanges = determineFRExchangesData(
                                row,
                                EXCHANGE_NAME.map((e) => e),
                            )

                            if (
                                !exchanges.OPExchangeName.ex1 ||
                                !exchanges.OPExchangeName.ex2 ||
                                !exchanges.CPExchangeName.ex1 ||
                                !exchanges.CPExchangeName.ex2
                            ) {
                                // console.error(`Corrupted data, missing exchanges:`, row, "detected exs:", exchanges)
                                return undefined
                            }
                            const _base: string = (
                                (exchanges.OPExchangeName.ex1.tokenIn === _quote
                                    ? exchanges.OPExchangeName.ex1.tokenOut
                                    : exchanges.OPExchangeName.ex1.tokenIn) ??
                                (exchanges.OPExchangeName.ex2.tokenIn === _quote
                                    ? exchanges.OPExchangeName.ex2.tokenOut
                                    : exchanges.OPExchangeName.ex2.tokenIn)
                            )?.toUpperCase()
                            if (!_base) {
                                // console.error(`Corrupted data, missing base symbol:`, row, "detected exs:", exchanges)
                                return undefined
                            }
                            return {
                                ...row,
                                key: `${_base}_${_quote}_${index}`,
                                OPex1Id: exchanges.OPExchangeName.ex1.id,
                                OPex1Name: exchanges.OPExchangeName.ex1.name,
                                OPex1Price: exchanges.OPExchangeName.ex1.price,
                                OPex1OrderFee: exchanges.OPExchangeName.ex1.orderFee,
                                OPex1FundingFee: exchanges.OPExchangeName.ex1.fundingFee,

                                OPex2Id: exchanges.OPExchangeName.ex2.id,
                                OPex2Name: exchanges.OPExchangeName.ex2.name,
                                OPex2Price: exchanges.OPExchangeName.ex2.price,
                                OPex2OrderFee: exchanges.OPExchangeName.ex2.orderFee,
                                OPex2FundingFee: exchanges.OPExchangeName.ex2.fundingFee,

                                CPex1Id: exchanges.CPExchangeName.ex1.id,
                                CPex1Name: exchanges.CPExchangeName.ex1.name,
                                CPex1Price: exchanges.CPExchangeName.ex1.price,
                                CPex1OrderFee: exchanges.CPExchangeName.ex1.orderFee,
                                CPex1FundingFee: exchanges.CPExchangeName.ex1.fundingFee,

                                CPex2Id: exchanges.CPExchangeName.ex2.id,
                                CPex2Name: exchanges.CPExchangeName.ex2.name,
                                CPex2Price: exchanges.CPExchangeName.ex2.price,
                                CPex2OrderFee: exchanges.CPExchangeName.ex2.orderFee,
                                CPex2FundingFee: exchanges.CPExchangeName.ex2.fundingFee,

                                baseSymbol: _base,
                                quoteSymbol: _quote,
                            }
                        })
                        .filter((item) => item !== undefined)
                } catch (err: any) {
                    console.error(err)

                    throw new Error("Invalid symbol or database query failed")
                }
            }),
        )

        // ── 4. Cache and respond ──────────────────────────────────────────────
        const response = {
            data: results,
            pagination: {
                current: page,
                pageSize: limit,
                total: totalCount,
            },
        }
        // console.log("fundingR -- response", response)
        aggCache.set(cacheKey, response)
        return res.status(200).json(response)
    } catch (err: any) {
        console.error(err)

        return res.status(500).send("Invalid symbol")
    }
})

fundingRateDataRouter.post("/profits-details/pairing/aggregated/batch", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!

    // console.log("fundingRateDataRouter -- req.body.pairings", req.body.pairings)
    const pairings = req.body.pairings as pairing[] | undefined
    const interval = req.body.interval
    const address = req.body.address
    const usePagination = req.body.page && req.body.page != undefined ? true : false
    // ── Pagination parameters ──────────────────────────────────────────────
    const page = Math.max(1, parseInt(usePagination ? req.body.page : 1) || 1)
    const limit = Math.min(500, parseInt(usePagination ? req.body.limit : 50) || 50)
    const offset = (page - 1) * limit

    // ── Timestamp filters (optional) ──────────────────────────────────────
    const timestampBegin = req.body.timestamp_begin
    const timestampEnd = req.body.timestamp_end

    if (!pairings || !Array.isArray(pairings) || pairings.length === 0) {
        return res.status(400).send("Missing or invalid symbols array")
    }
    // ─── Build the date format string ──────────────────────────────────────
    let groupExpr: { expr: string; format: string | null }
    try {
        groupExpr = getGroupByExpression(interval, "cp")
    } catch {
        return res.status(400).send("Invalid interval")
    }

    // ─── 1. Validate ALL symbols at once ──────────────────────────────────────
    const exchangeNames = EXCHANGE_NAME.map((e) => `'${e}Txs'`).join(", ")
    const validTables = await db.all(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%Txs' AND name NOT IN (${exchangeNames}, 'transactions')`,
    )
    const validSymbols = validTables.map((row: any) => row.name.replace(/Txs$/, "").toLowerCase())
    const filteredPairings = Array.from(pairings)
        .filter((data, i) => {
            const { baseSymbol, quoteSymbol } = data
            if (
                (baseSymbol && !validSymbols.includes(baseSymbol.toLowerCase())) ||
                !validSymbols.includes(quoteSymbol.toLowerCase())
                // ||baseSymbol === quoteSymbol
            ) {
                return undefined
            }
            return data
        })
        .filter((s) => s !== undefined)
    if (filteredPairings.length === 0) {
        return res.status(400).send("No valid pairings provided")
    }
    const params = {
        endpoint: `${CACHE_KEY_TYPE}:profits-details:pairing:aggregated:batch`,
        type: CACHE_KEY_TYPE,
        username,
        address,
        interval,
        pairings: filteredPairings,
        page: page.toString(),
        limit: limit.toString(),
        timestampBegin,
        timestampEnd,
    }
    // console.log("fundingRateDataRouter agg batch params: ", params)
    const cacheKey = generateCacheKey(params)
    const cached = aggCache.get(cacheKey)
    if (cached) return res.status(200).json(cached)

    // ── 3. Run queries for each pairing in parallel ──────────────────────
    const results: { [key: string]: profitIntervalType[] } = {}
    let totalCount = 0
    try {
        await Promise.all(
            filteredPairings.map(async ({ baseSymbol, quoteSymbol }) => {
                const base = baseSymbol ? baseSymbol.toUpperCase() : "ALL"
                const quote = quoteSymbol.toLowerCase()

                // await spotFutureDatabase_createTablesIfNotExists(symbol)
                // ----- Build base WHERE conditions (shared by data & count) -----
                let whereConditions: string[] = ["cp.timestamp IS NOT NULL", "cp.username = ?"],
                    whereParams: any[] = [username]
                let endConditions: string[] = [],
                    endParams: any[] = []
                // console.log("base quote", base, quote)

                /* Filter by base token, i.e. TokenA/ Quote */
                if (base !== "ALL") {
                    let tokenInConditions: string[] = []
                    for (const ex of EXCHANGE_NAME) {
                        tokenInConditions.push(`OP${ex}.tokenIn = ? OR OP${ex}.tokenOut = ?`)

                        whereParams.push(...[base, base])
                    }
                    const tokenInSql = "(" + tokenInConditions.join(" OR ") + ")"

                    let tokenOutConditions: string[] = []
                    for (const ex of EXCHANGE_NAME) {
                        tokenOutConditions.push(`CP${ex}.tokenIn = ? OR CP${ex}.tokenOut = ?`)

                        whereParams.push(...[base, base])
                    }
                    const tokenOutSql = "(" + tokenInConditions.join(" OR ") + ")"

                    whereConditions.push(tokenInSql + " AND " + tokenOutSql)
                }
                if (address) {
                    whereConditions.push("cptx.address = ?")
                    whereParams.push(address)
                }
                if (timestampBegin) {
                    whereConditions.push("cp.timestamp >= ?")
                    whereParams.push(timestampBegin)
                }
                if (timestampEnd) {
                    whereConditions.push("cp.timestamp <= ?")
                    whereParams.push(timestampEnd)
                }
                if (usePagination) {
                    endConditions.push("LIMIT ? OFFSET ?")
                    endParams.push(...[limit, offset])
                }

                const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : ""
                let dataSql = `
                        SELECT 
                        ${groupExpr.expr} AS timestamp,
                        SUM(${quote}.amount) AS amount,
                        COALESCE(
                            SUM(${quote}.amount * ${quote}.ratio) / NULLIF(SUM(${quote}.amount), 0),
                            0
                        ) AS ratio

                        FROM closedPositions AS cp
                        LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                        LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                        ${exchangeJoins}
                        
                        INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                        ${whereClause}
                        GROUP BY 1
                        ORDER BY cp.timestamp DESC
                       ${endConditions}
                    `
                const dataParams = [...whereParams, ...endParams]
                // console.log("data sql", dataSql, whereParams)
                const dataRows = await db.all(dataSql + ";", dataParams)

                // console.log("dataRows:", dataRows.length, dataRows[0], dataRows[dataRows.length - 1])

                // always return array in random order (asc/ desc) since javascript doesn't care, i.e. 'ORDER BY' becomes meaningless
                // res.status(200).json(symbol_profits)

                // ----- Count query (no pagination) -----
                let countSql = `
                SELECT COUNT(DISTINCT ${groupExpr.expr}) AS total
                    FROM closedPositions AS cp
                    LEFT JOIN transactions AS optx ON cp.openingId = optx.uuid
                    LEFT JOIN transactions AS cptx ON cp.closingId = cptx.uuid

                    ${exchangeJoins}
                    
                    INNER JOIN ${quote}Txs AS ${quote} on ${quote}.positionId = cp.id
                    ${whereClause};
                `
                const countResult = await db.get(countSql, whereParams)
                // console.log("spotFuture -- countResult: ", countResult)
                const count = countResult?.total || 0
                totalCount += count

                // ----- Map rows to output format -----
                results[base] = dataRows
                    .map((row: any, index: number) => {
                        let timestamp = row.timestamp
                        if (!timestamp) return undefined
                        const _quote = quote.toUpperCase()

                        const _base: string = base.toUpperCase()

                        // with the sv-SE (Sweden) locale, it natively outputs the YYYY-MM-DD format
                        if (interval === "Weekly") timestamp = parseYearWeek(timestamp).toLocaleDateString("sv-SE")
                        return {
                            ...row,
                            key: `${_base}_${_quote}_${index}`,
                            timestamp,
                            baseSymbol: _base,
                            quoteSymbol: _quote,
                            address: address,
                        }
                    })
                    .filter((item) => item !== undefined)
            }),
        )
    } catch (err: any) {
        console.error(err)

        return res.status(400).send("Invalid symbol or database query failed")
    }
    // ── 4. Cache and respond ──────────────────────────────────────────────
    const response = {
        data: results,
        pagination: {
            current: page,
            pageSize: limit,
            total: totalCount,
        },
    }
    // console.log("spotFuture -- response", response)
    aggCache.set(cacheKey, response)
    res.status(200).json(response)
})

fundingRateDataRouter.post("/fundingRateTableData", async (req: Request, res: Response) => {
    // console.log("FRData", FRData)
    try {
        // console.log("Before sending response, checking headersSent:", res.headersSent)

        // Check if headers were already sent
        if (res.headersSent) {
            console.error("Headers already sent! Cannot send another response.")
            return // Exit the function early if headers were already sent
        }

        // console.log("Sending response with FRData:", FRData)

        // Send the response
        res.status(200).json(FRData)

        return // Prevent further code execution after sending the response
    } catch (err: any) {
        console.error("Error occurred: ", err)

        // Ensure headers haven't been sent before sending error
        if (!res.headersSent) {
            console.log("Sending error response...")
            res.status(500).send() // Send the error response
        } else {
            console.error("Headers already sent, cannot send another response.")
        }

        return
    }
})

fundingRateDataRouter.post("/fundingRateTableData/update", async (req: Request, res: Response) => {
    const data: FRComparisonTableData[] = req.body.data
    if (!Array.isArray(data) || data.length === 0) res.status(400).send("Missing data")
    // console.log("data", data)
    // console.log("data", JSON.stringify(data, null, "  "))
    try {
        FRData = data
        // if (FRData.length > 10) FRData.pop()
        // console.log(FRData)
        // console.log("JSON", JSON.stringify(FRData, null, "  "))
        res.status(201).json("Updated!")
    } catch (err: any) {
        console.error(err)
        res.status(500).send()
    }
})

fundingRateDataRouter.get("/symbols", async (req: Request, res: Response) => {
    const db = database.fundingRateDB as Database
    const username = req.user!
    const exchangeNames = EXCHANGE_NAME.map((e) => `'${e}Txs'`).join(", ")
    try {
        const sql = `SELECT DISTINCT 
                substr(name, 1, length(name) - 3) AS symbol
             FROM sqlite_master 
             WHERE type='table' 
               AND name LIKE '%Txs'
               AND name NOT IN (${exchangeNames}, 'transactions')
             ORDER BY symbol;`
        // console.log("sql", sql)
        const rows = await db.all(sql)
        // Only expose tables that contain data rows owned by this user
        const userRows: any[] = []
        for (const row of rows) {
            const owned = await db.get(`SELECT 1 FROM "${row.symbol}Txs" WHERE username = ? LIMIT 1`, [username])
            if (owned) userRows.push(row)
        }
        const symbols = userRows.map((row: any) => row.symbol.toUpperCase())

        const sorted = symbols.sort((a, b) => {
            if (a === "USDC") return -1
            if (b === "USDC") return 1
            return a.localeCompare(b)
        })
        return res.status(200).json({ symbols: sorted })
    } catch (err: any) {
        console.error(err)
        return res.status(500).send("Failed to fetch symbols")
    }
})

fundingRateDataRouter.post("/export", function (req: Request, res: Response) {
    const options = {
        root: path.join(path.dirname(__dirname) + "/db"),
    }

    const fileName = "fRate.db"

    try {
        res.status(201).download(options.root + "/" + fileName, function (err) {
            if (err) {
                console.error("Error sending file:", err)
            } else {
                console.log("Sent:", options, fileName)
            }
        })
    } catch (err: any) {
        console.log(`caught error at data/export:`, err)
    }
})
