import { useState, type FC, useMemo } from "react"
import { Typography, Table, Input, Grid, Tooltip } from "antd"
import type { ColumnsType } from "antd/es/table"
import { type spotFutureProfitResponse } from "@/types"
import { truncateHash } from "../utils"

const { useBreakpoint } = Grid
const { Text } = Typography
type DataIndex = keyof spotFutureProfitResponse

export const SF_ProfitIntradayView: FC<{ profit: spotFutureProfitResponse[] }> = ({ profit }): React.ReactElement => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs
    const [searchText, setSearchText] = useState("")

    const breakpoint = isMobile

    const myProfits = useMemo(() => {
        return searchText
            ? (profit
                  .map((data) => {
                      if (
                          (data[("OP" + data.OPex1Name + "Id") as DataIndex] as string)
                              .toLowerCase()
                              .includes((searchText as string).toLowerCase()) ||
                          (data[("OP" + data.OPex2Name + "Id") as DataIndex] as string)
                              .toLowerCase()
                              .includes((searchText as string).toLowerCase()) ||
                          (data[("CP" + data.CPex1Name + "Id") as DataIndex] as string)
                              .toLowerCase()
                              .includes((searchText as string).toLowerCase()) ||
                          (data[("CP" + data.CPex2Name + "Id") as DataIndex] as string).toLowerCase().includes((searchText as string).toLowerCase())
                      )
                          return data
                  })
                  .filter((data) => data !== undefined) as spotFutureProfitResponse[])
            : profit
    }, [profit, searchText])

    const columns: ColumnsType<spotFutureProfitResponse> = [
        {
            title: "Time",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            render: (timestamp: string) => {
                if (!isNaN(new Date(Number(timestamp)).valueOf())) {
                    // const _timestamp = new Date(Number(timestamp)).toLocaleString("en-GB", { timeZone: "UTC" })
                    const _timestamp = new Date(Number(timestamp)).toLocaleString()
                    const date = _timestamp.split(",")[0].split("/")
                    // timestamp = date[2] + "-" + date[1] + "-" + date[0] + "," + _timestamp.split(",")[1]

                    return (
                        <div className="flex flex-row flex-wrap xs:flex-nowrap justify-start gap-x-2">
                            <div className="text-nowrap">{date[2] + "-" + date[0] + "-" + date[1] + ","}</div>
                            <div className="text-nowrap">{_timestamp.split(",")[1]}</div>
                        </div>
                    )
                }
            },
            width: "20%",
        },
        {
            title: "Base",
            dataIndex: "baseSymbol",
            key: "baseSymbol",
            align: "end",
        },
        {
            title: "Size",
            dataIndex: "qty",
            key: "qty",
            render: (qty: number) => (qty ?? 0).toLocaleString(),
            align: "end",
            width: isMobile ? 80 : 150,
        },
        {
            title: (
                <Tooltip title="Net Profit in USD">
                    <span>PNL (USD)</span>
                </Tooltip>
            ),
            dataIndex: "amount",
            key: "PNL",
            sorter: (a, b) => a.amount - b.amount,
            render: (amount: number) => amount?.toFixed(2),
            showSorterTooltip: false,
            align: "end",
            width: 120,
        },
        {
            title: "%",
            dataIndex: "ratio",
            key: "ratio",
            filters: [
                {
                    text: "Profitable",
                    value: "more than or equal to",
                },
                {
                    text: "Non. Profitable",
                    value: "less than",
                },
            ],
            onFilter: (value, profitR) => {
                if (value === "less than") return profitR.ratio < 0
                else return profitR.ratio >= 0
            },
            render: (ratio: number) => {
                const value = ratio * 100
                return <Text type={value > 0 ? "success" : value === 0 ? "warning" : "danger"}>{value?.toFixed(2)}</Text>
            },
            align: "end",
            width: 60,
        },
    ]
    interface expandedRowType {
        type: "OPEN" | "CLOSE"
        address: string
        timestamp: string
        futurePrice: number
        spotPrice: number
        UUID: string

        // Post-computed attributes
        key?: React.Key
        baseSymbol?: string
        dexName?: string
        cexName?: string
        orderId?: string
        txHash?: string

        bybitId: string | null
        bybitTokenIn: string | null
        bybitTokenOut: string | null
        gateId: string | null
        gateTokenIn: string | null
        gateTokenOut: string | null
        binanceId: string | null
        binanceTokenIn: string | null
        binanceTokenOut: string | null
        hlId: string | null
        hlTokenIn: string | null
        hlTokenOut: string | null
        osmId: string | null
        osmTokenIn: string | null
        osmTokenOut: string | null
        injId: string | null
        injTokenIn: string | null
        injTokenOut: string | null
        dydxId: string | null
        dydxTokenIn: string | null
        dydxTokenOut: string | null

        amount: number
        ratio: number
        qty: number
        orderFee: number
        fundingFee: number
    }

    const expandColumns: ColumnsType<expandedRowType> = [
        {
            title: "Type",
            dataIndex: "type",
            key: "type",
            ellipsis: false,
            width: "3%",
        },
        {
            title: "UUID",
            dataIndex: "UUID",
            key: "UUID",
            ellipsis: true,
            render: (id: string) => {
                return <div className=" max-w-[12em] justify-self-end truncate">{truncateHash(id)}</div>
            },
            width: "5%",
            hidden: breakpoint,
        },
        {
            title: "EX 1",
            dataIndex: "cexName",
            key: "cexName",
            ellipsis: true,

            sortDirections: ["descend", "ascend"],
            align: "center",
            width: "4%",
        },
        {
            title: "ID 1",
            dataIndex: "orderId",
            key: "orderId",
            ellipsis: true,

            sortDirections: ["descend", "ascend"],
            render: (id: string) => {
                return <div className=" max-w-[12em] justify-self-end truncate">{truncateHash(id)}</div>
            },
            align: "end",
            width: "5%",
            hidden: breakpoint,
        },
        {
            title: "EX 2",
            dataIndex: "dexName",
            key: "dexName",
            ellipsis: true,

            sortDirections: ["descend", "ascend"],
            align: "center",
            width: "4%",
        },
        {
            title: "ID 2",
            dataIndex: "txHash",
            key: "txHash",
            ellipsis: true,
            align: "end",

            render: (id: string) => {
                return <div className=" max-w-[12em] justify-self-end truncate">{truncateHash(id)}</div>
            },
            width: "5%",
            hidden: breakpoint,
        },
        {
            title: () => <div className="text-nowrap">Spot Price</div>,
            dataIndex: "spotPrice",
            key: "spotPrice",
            sorter: (a, b) => a.spotPrice - b.spotPrice,
            render: (spotPrice: number) => spotPrice?.toPrecision(6),
            align: "end",
            width: "5%",
        },
        {
            title: () => <div className="text-nowrap">Future Price</div>,
            dataIndex: "futurePrice",
            key: "futurePrice",
            sorter: (a, b) => a.futurePrice - b.futurePrice,
            render: (futurePrice: number) => futurePrice?.toPrecision(6),
            align: "end",
            width: "6%",
        },
        {
            title: "Fee",
            dataIndex: "orderFee",
            key: "orderFee",
            sorter: (a, b) => a.orderFee - b.orderFee,
            render: (orderFee: number) => (orderFee ?? 0).toFixed(3),
            align: "end",
            width: "4%",
        },
        {
            title: (
                <Tooltip title="Positive funding indicate earned fees, vice versa.">
                    <span>Funding</span>
                </Tooltip>
            ),
            dataIndex: "fundingFee",
            key: "fundingFee",
            sorter: (a, b) => a.fundingFee - b.fundingFee,
            render: (fundingFee: number) => (fundingFee ?? 0).toFixed(4),
            showSorterTooltip: false,
            align: "end",
            width: "4%",
        },
    ]

    const expandedRowRender = (data: spotFutureProfitResponse) => {
        const dataSource: expandedRowType[] = [
            {
                type: "OPEN",
                address: data.address,
                timestamp: data.timestamp,
                futurePrice: data.openingFP,
                spotPrice: data.openingSP,
                UUID: data.openingUUID,

                // Post-computed attributes
                key: data.key + "expandedOPENRow",
                baseSymbol: data.baseSymbol,
                dexName: data.OPex1Name,
                cexName: data.OPex2Name,
                orderId: data.OPex1Id,
                txHash: data.OPex2Id,

                bybitId: data.OPbybitId,
                bybitTokenIn: data.OPbybitTokenIn,
                bybitTokenOut: data.OPbybitTokenOut,
                gateId: data.OPgateId,
                gateTokenIn: data.OPgateTokenIn,
                gateTokenOut: data.OPgateTokenOut,
                binanceId: data.OPbinanceId,
                binanceTokenIn: data.OPbinanceTokenIn,
                binanceTokenOut: data.OPbinanceTokenOut,
                hlId: data.OPhlId,
                hlTokenIn: data.OPhlTokenIn,
                hlTokenOut: data.OPhlTokenOut,
                osmId: data.OPosmId,
                osmTokenIn: data.OPosmTokenIn,
                osmTokenOut: data.OPosmTokenOut,
                injId: data.OPinjId,
                injTokenIn: data.OPinjTokenIn,
                injTokenOut: data.OPinjTokenOut,
                dydxId: data.OPdydxId,
                dydxTokenIn: data.OPdydxTokenIn,
                dydxTokenOut: data.OPdydxTokenOut,

                amount: data.amount,
                ratio: data.ratio,
                qty: data.qty,
                orderFee: data.openingOrderFee,
                fundingFee: 0,
            },
            {
                type: "CLOSE",
                address: data.address,
                timestamp: data.timestamp,
                futurePrice: data.closingFP,
                spotPrice: data.closingSP,
                UUID: data.closingUUID,

                // Post-computed attributes
                key: data.key + "expandedCLOSERow",
                baseSymbol: data.baseSymbol,
                dexName: data.CPex1Name,
                cexName: data.CPex2Name,
                orderId: data.CPex1Id,
                txHash: data.CPex2Id,

                bybitId: data.CPbybitId,
                bybitTokenIn: data.CPbybitTokenIn,
                bybitTokenOut: data.CPbybitTokenOut,
                gateId: data.CPgateId,
                gateTokenIn: data.CPgateTokenIn,
                gateTokenOut: data.CPgateTokenOut,
                binanceId: data.CPbinanceId,
                binanceTokenIn: data.CPbinanceTokenIn,
                binanceTokenOut: data.CPbinanceTokenOut,
                hlId: data.CPhlId,
                hlTokenIn: data.CPhlTokenIn,
                hlTokenOut: data.CPhlTokenOut,
                osmId: data.CPosmId,
                osmTokenIn: data.CPosmTokenIn,
                osmTokenOut: data.CPosmTokenOut,
                injId: data.CPinjId,
                injTokenIn: data.CPinjTokenIn,
                injTokenOut: data.CPinjTokenOut,
                dydxId: data.CPdydxId,
                dydxTokenIn: data.CPdydxTokenIn,
                dydxTokenOut: data.CPdydxTokenOut,

                amount: data.amount,
                ratio: data.ratio,
                qty: data.qty,
                orderFee: data.closingOrderFee,
                fundingFee: data.closingFundingFee,
            },
        ]
        return (
            <Table<expandedRowType>
                size="small"
                columns={expandColumns}
                dataSource={dataSource}
                loading={!dataSource}
                pagination={false}
                scroll={{
                    x: "max-content",
                }}
            />
        )
    }

    const { Search } = Input
    return (
        <div className="flex flex-col gap-y-2">
            <Search
                size="small"
                placeholder="Search txHash or orderId..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                enterButton
                className="self-end"
                style={{ width: isMobile ? "100%" : 300 }}
            />

            <Table<spotFutureProfitResponse>
                // rowKey="key"
                sticky
                size="small"
                dataSource={myProfits}
                expandable={{
                    expandedRowRender,
                    columnWidth: 20,
                }}
                columns={columns}
                loading={!myProfits}
                pagination={false}
                scroll={{ x: "max-content" }}
                rowClassName={`!text-nowrap font-metric ${isMobile ? "!text-xs" : "!text-md"}`}
            />
        </div>
    )
}
