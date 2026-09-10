import React, { type FC } from "react"
import { Typography, Table } from "antd"
import type { ColumnsType } from "antd/es/table"
import { EXCHANGE_TYPE, fundingRateInterval, type formattedFRComparisonTableData } from "@/types"
import AnimatedNumber from "@/components/AnimatedNumber"

const { Text } = Typography

export const TableView: FC<{ FRData: formattedFRComparisonTableData[]; viewType: fundingRateInterval; isFetching: boolean }> = ({
    FRData,
    viewType,
    isFetching,
}): React.ReactElement => {
    const decimalPlaces = viewType === fundingRateInterval.Year ? 2 : 5

    const columns: ColumnsType<formattedFRComparisonTableData> = [
        {
            title: "Symbol",
            dataIndex: "symbol",
            key: "symbol",
            ellipsis: true,
            align: "start",
            width: 100,
        },

        {
            title: "HL",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}fundingInfo`,
            sorter: (a, b) => {
                const pairsA = a.pair
                const pairsB = b.pair
                const fundingPairA = pairsA.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.HL)) return true
                    else return false
                })
                const fundingPairB = pairsB.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.HL)) return true
                    else return false
                })

                if (!fundingPairA && !fundingPairB) return 0
                else if (!fundingPairA) return 1
                else if (!fundingPairB) return -1
                else {
                    const fundingA = fundingPairA!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.HL)
                    const fundingB = fundingPairB!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.HL)
                    return Number(fundingB!.funding) - Number(fundingA!.funding)
                }
            },
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.HL)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.HL)
                const value = fundingInfo ? Number(fundingInfo.funding) * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber value={Number(value.toFixed(decimalPlaces))} decimalPlaces={decimalPlaces}></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },

        {
            title: "Bybit",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.BB}fundingInfo`,
            sorter: (a, b) => {
                const pairsA = a.pair
                const pairsB = b.pair
                const fundingPairA = pairsA.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })
                const fundingPairB = pairsB.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })

                if (!fundingPairA && !fundingPairB) return 0
                else if (!fundingPairA) return 1
                else if (!fundingPairB) return -1
                else {
                    const fundingA = fundingPairA!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                    const fundingB = fundingPairB!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                    return Number(fundingB!.funding) - Number(fundingA!.funding)
                }
            },
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                const value = fundingInfo ? Number(fundingInfo.funding) * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber value={Number(value.toFixed(decimalPlaces))} decimalPlaces={decimalPlaces}></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },
        {
            title: "Binance",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.BIN}fundingInfo`,
            sorter: (a, b) => {
                const pairsA = a.pair
                const pairsB = b.pair
                const fundingPairA = pairsA.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BIN)) return true
                    else return false
                })
                const fundingPairB = pairsB.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BIN)) return true
                    else return false
                })
                if (!fundingPairA && !fundingPairB) return 0
                else if (!fundingPairA) return 1
                else if (!fundingPairB) return -1
                else {
                    const fundingA = fundingPairA!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BIN)
                    const fundingB = fundingPairB!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BIN)
                    return Number(fundingB!.funding) - Number(fundingA!.funding)
                }
            },
            // sortDirections: ["descend"],
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BIN)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BIN)
                const value = fundingInfo ? Number(fundingInfo.funding) * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber value={Number(value.toFixed(decimalPlaces))} decimalPlaces={decimalPlaces}></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },
        {
            title: "Gate",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.GT}fundingInfo`,
            sorter: (a, b) => {
                const pairsA = a.pair
                const pairsB = b.pair
                const fundingPairA = pairsA.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.GT)) return true
                    else return false
                })
                const fundingPairB = pairsB.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.GT)) return true
                    else return false
                })

                if (!fundingPairA && !fundingPairB) return 0
                else if (!fundingPairA) return 1
                else if (!fundingPairB) return -1
                else {
                    const fundingA = fundingPairA!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.GT)
                    const fundingB = fundingPairB!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.GT)
                    return Number(fundingB!.funding) - Number(fundingA!.funding)
                }
            },
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.GT)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.GT)
                const value = fundingInfo ? Number(fundingInfo.funding) * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber value={Number(value.toFixed(decimalPlaces))} decimalPlaces={decimalPlaces}></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },
        {
            title: "Next",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.BB}fundingInfo`,
            sorter: (a, b) => {
                const pairsA = a.pair
                const pairsB = b.pair
                const fundingPairA = pairsA.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })
                const fundingPairB = pairsB.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })

                if (!fundingPairA && !fundingPairB) return 0
                else if (!fundingPairA) return -1
                else if (!fundingPairB) return 1
                else {
                    const fundingA = fundingPairA!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                    const fundingB = fundingPairB!.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                    return Number(fundingA!.funding) - Number(fundingB!.funding)
                }
            },
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                const value = fundingInfo ? new Date(Number(fundingInfo.nextFundingTime)).toLocaleString().split(",")[1] : "--"
                return value
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },

        /* Hr */
        {
            title: "Hr",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.BB}fundingInfo`,
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BB)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BB)
                const value = fundingInfo ? Number(fundingInfo.intervalHr) : "--"
                return value
            },
            align: "end",
            // width: isMobile ? widht2 : "5%",
            // hidden: !isMobile,
        },
        {
            title: "Hr",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.BIN}fundingInfo`,
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.BIN)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.BIN)
                const value = fundingInfo ? Number(fundingInfo.intervalHr) : "--"
                return value
            },
            align: "end",
            // width: isMobile ? widht2 : "5%",
            // hidden: !isMobile,
        },
        {
            title: "Hr",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.GT}fundingInfo`,
            render: (FI: formattedFRComparisonTableData["pair"]) => {
                const pair = FI.find((pair) => {
                    const EXs = pair.pair.split("-")
                    if (EXs.includes(EXCHANGE_TYPE.GT)) return true
                    else return false
                })
                const fundingInfo = pair?.fundingInfo.find((f) => f.name === EXCHANGE_TYPE.GT)
                const value = fundingInfo ? Number(fundingInfo.intervalHr) : "--"
                return value
            },
            align: "end",
            // width: isMobile ? widht2 : "5%",
            // hidden: !isMobile,
        },

        /* HL-CEX */
        {
            title: "HL-Bybit",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.BB}hourly`,
            sorter: (a, b) => {
                const pairA = a.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                const pairB = b.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                if (!pairA && !pairB) return 0
                else if (!pairA) return 1
                else if (!pairB) return -1
                return pairB!.hourly - pairA!.hourly
            },
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                // const isPair = data.pair.
                const value = pair ? pair.hourly * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber
                                value={Number(value.toFixed(decimalPlaces))}
                                // decimalPlaces={decimalPlaces}
                            ></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },
        {
            title: "HL-Binance",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.BIN}hourly`,
            sorter: (a, b) => {
                const pairA = a.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                const pairB = b.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                if (!pairA && !pairB) return 0
                else if (!pairA) return 1
                else if (!pairB) return -1
                return pairB!.hourly - pairA!.hourly
            },
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                // const isPair = data.pair.
                const value = pair ? pair.hourly * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber
                                value={Number(value.toFixed(decimalPlaces))}
                                // decimalPlaces={decimalPlaces}
                            ></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },
        {
            title: "HL-Gate",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.GT}hourly`,
            sorter: (a, b) => {
                const pairA = a.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                const pairB = b.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                if (!pairA && !pairB) return 0
                else if (!pairA) return 1
                else if (!pairB) return -1
                return pairB!.hourly - pairA!.hourly
            },
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                // const isPair = data.pair.
                const value = pair ? pair.hourly * 100 : -1000
                return (
                    <Text type={value > 0 ? "success" : value === -1000 ? "secondary" : "danger"}>
                        {value !== -1000 ? (
                            <AnimatedNumber
                                value={Number(value.toFixed(decimalPlaces))}
                                // decimalPlaces={decimalPlaces}
                            ></AnimatedNumber>
                        ) : (
                            "--"
                        )}
                    </Text>
                )
            },
            align: "end",
            // width: isMobile ? width1 : "5%",
        },

        /* Int - minRunningHourAssumed */
        {
            title: "Int",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.BB}minRunningHrAssumed`,
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                const hr = pair ? pair.minRunningHrAssumed : "--"
                return hr
            },
            align: "end",
            // width: isMobile ? "1%" : "2%",
        },
        {
            title: "Int",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.BIN}minRunningHrAssumed`,
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                const hr = pair ? pair.minRunningHrAssumed : "--"
                return hr
            },
            align: "end",
            // width: isMobile ? "1%" : "2%",
        },
        {
            title: "Int",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.GT}minRunningHrAssumed`,
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                const hr = pair ? pair.minRunningHrAssumed : "--"
                return hr
            },
            align: "end",
            // width: isMobile ? "1%" : "2%",
        },

        /* PR */
        {
            title: "PR",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.BB}estimatedProfitRatio`,
            align: "end",
            // width: isMobile ? "2%" : "4%",
            sorter: (a, b) => {
                const pairA = a.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                const pairB = b.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                if (!pairA && !pairB) return 0
                else if (!pairA) return 1
                else if (!pairB) return -1
                return Number(pairB!.estimatedProfitRatio) - Number(pairA!.estimatedProfitRatio)
            },
            // sortDirections: ["ascend", "descend"],
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BB),
                )
                const estimatedProfitRatio = pair ? pair.estimatedProfitRatio : "--"
                return (
                    <Text
                        type={
                            estimatedProfitRatio === "--"
                                ? "secondary"
                                : estimatedProfitRatio > 0
                                  ? "success"
                                  : estimatedProfitRatio === 0
                                    ? "secondary"
                                    : "danger"
                        }
                    >
                        {estimatedProfitRatio === "--" ? (
                            estimatedProfitRatio
                        ) : (
                            <AnimatedNumber
                                value={Number(estimatedProfitRatio.toFixed(decimalPlaces))}
                                decimalPlaces={decimalPlaces}
                            ></AnimatedNumber>
                        )}
                    </Text>
                )
            },
        },
        {
            title: "PR",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.BIN}estimatedProfitRatio`,
            align: "end",
            // width: isMobile ? "2%" : "4%",
            sorter: (a, b) => {
                const pairA = a.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                const pairB = b.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                if (!pairA && !pairB) return 0
                else if (!pairA) return 1
                else if (!pairB) return -1
                return Number(pairB!.estimatedProfitRatio) - Number(pairA!.estimatedProfitRatio)
            },
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.BIN),
                )
                const estimatedProfitRatio = pair ? pair.estimatedProfitRatio : "--"
                return (
                    <Text
                        type={
                            estimatedProfitRatio === "--"
                                ? "secondary"
                                : estimatedProfitRatio > 0
                                  ? "success"
                                  : estimatedProfitRatio === 0
                                    ? "secondary"
                                    : "danger"
                        }
                    >
                        {estimatedProfitRatio === "--" ? (
                            estimatedProfitRatio
                        ) : (
                            <AnimatedNumber
                                value={Number(estimatedProfitRatio.toFixed(decimalPlaces))}
                                decimalPlaces={decimalPlaces}
                            ></AnimatedNumber>
                        )}
                    </Text>
                )
            },
        },
        {
            title: "PR",
            dataIndex: "pair",
            key: `${EXCHANGE_TYPE.HL}-${EXCHANGE_TYPE.GT}estimatedProfitRatio`,
            align: "end",
            // width: isMobile ? "2%" : "4%",
            sorter: (a, b) => {
                const pairA = a.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                const pairB = b.pair.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                if (!pairA && !pairB) return 0
                else if (!pairA) return 1
                else if (!pairB) return -1
                return Number(pairB!.estimatedProfitRatio) - Number(pairA!.estimatedProfitRatio)
            },
            render: (data: formattedFRComparisonTableData["pair"]) => {
                const pair = data.find(
                    (pairInfo) => pairInfo.pair.split("-").includes(EXCHANGE_TYPE.HL) && pairInfo.pair.split("-").includes(EXCHANGE_TYPE.GT),
                )
                const estimatedProfitRatio = pair ? pair.estimatedProfitRatio : "--"
                return (
                    <Text
                        type={
                            estimatedProfitRatio === "--"
                                ? "secondary"
                                : estimatedProfitRatio > 0
                                  ? "success"
                                  : estimatedProfitRatio === 0
                                    ? "secondary"
                                    : "danger"
                        }
                    >
                        {estimatedProfitRatio === "--" ? (
                            estimatedProfitRatio
                        ) : (
                            <AnimatedNumber
                                value={Number(estimatedProfitRatio.toFixed(decimalPlaces))}
                                decimalPlaces={decimalPlaces}
                            ></AnimatedNumber>
                        )}
                    </Text>
                )
            },
        },
        //sd//
        // {
        //     title: "Cost",
        //     dataIndex: "pair",
        //     key: `costRate`,
        //     sorter: (a, b) => {
        //         a.costRate - b.costRate
        //     },
        //     render: (cost: FRComparisonTableData["costRate"]) => (
        //         <AnimatedNumber value={Number(cost.toFixed(decimalPlaces))} decimalPlaces={decimalPlaces}></AnimatedNumber>
        //     ),

        //     align: "end",
        //     width: isMobile ? width1 : "5%",
        //     hidden: !isMobile,
        // },
    ]

    return (
        <Table
            size="small"
            dataSource={FRData}
            columns={columns}
            loading={isFetching}
            pagination={{ defaultPageSize: 10, pageSizeOptions: [5, 10, 25, 50] }}
            scroll={{
                x: "max-content",
            }}
        />
    )
}
