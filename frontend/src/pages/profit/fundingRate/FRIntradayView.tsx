import { useState, type FC, useMemo } from "react"
import { Typography, Table, Input, Grid } from "antd"
import type { ColumnsType } from "antd/es/table"

import { type fundingRateProfitResponse } from "@/types"
import { truncateHash } from "../utils"
const { useBreakpoint } = Grid
const { Text } = Typography
type DataIndex = keyof fundingRateProfitResponse

export const FR_ProfitIntradayView: FC<{ profit: fundingRateProfitResponse[] }> = ({ profit }): React.ReactElement => {
    const [searchText, setSearchText] = useState("")
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs
    // console.log("FR", profit)
    const breakpoint = screens.xl

    const myProfits = useMemo(() => {
        if (searchText)
            return profit
                .map((data) => {
                    if (
                        data.openingUUID.toLowerCase().includes(searchText.toLowerCase()) ||
                        data.closingUUID.toLowerCase().includes(searchText.toLowerCase()) ||
                        (data[("OP" + data.OPex1Name + "Id") as DataIndex] as string).toLowerCase().includes((searchText as string).toLowerCase()) ||
                        (data[("OP" + data.OPex2Name + "Id") as DataIndex] as string).toLowerCase().includes((searchText as string).toLowerCase()) ||
                        (data[("CP" + data.CPex1Name + "Id") as DataIndex] as string).toLowerCase().includes((searchText as string).toLowerCase()) ||
                        (data[("CP" + data.CPex2Name + "Id") as DataIndex] as string).toLowerCase().includes((searchText as string).toLowerCase())
                    )
                        return data
                })
                .filter((data) => data !== undefined) as fundingRateProfitResponse[]
        else return profit
    }, [profit, searchText])

    const columns: ColumnsType<fundingRateProfitResponse> = [
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
                    timestamp = date[2] + "-" + date[1] + "-" + date[0] + "," + _timestamp.split(",")[1]
                }

                return timestamp
            },
        },
        {
            title: "Symbol",
            dataIndex: "baseSymbol",
            key: "coin",
            align: "end",
            width: breakpoint ? "10%" : "15%",
        },
        {
            title: "Size (Unit)",
            dataIndex: "qty",
            key: "qty",
            sorter: (a, b) => a.qty - b.qty,
            render: (qty: number) => (qty ?? 0).toLocaleString(),
            align: "end",
            width: "15%",
        },
        {
            title: "Size (USD)",
            sorter: (a, b) => a.qty - b.qty,
            render: (data: fundingRateProfitResponse) => (data.OPex1Price * data.qty).toFixed(2),
            align: "end",
            width: "15%",
        },

        {
            title: "PNL",
            dataIndex: "amount",
            key: "amount",
            sorter: (a, b) => a.amount - b.amount,
            //sortDirections: ["", "ascend"],
            render: (amount: number) => amount?.toFixed(2),
            align: "end",
            width: "15%",
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
            width: "10%",
        },
    ]
    interface expandedRowType {
        type: "OPEN" | "CLOSE"
        address: string
        timestamp: string
        UUID: string

        // Post-computed attributes
        key?: React.Key
        coin?: string
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
    }

    const expandColumns: ColumnsType<expandedRowType> = [
        {
            title: "Type",
            dataIndex: "type",
            key: "type",
            ellipsis: false,

            width: "4%",
        },
        {
            title: "UUID",
            dataIndex: "UUID",
            key: "UUID",
            ellipsis: true,
            render: (id: string) => {
                return (
                    <div className=" max-w-[12em] justify-self-end truncate">
                        <Text
                            copyable={{ text: id }} // Copies the ACTUAL full ID, not the visual text
                            style={{ maxWidth: "100%" }}
                        >
                            {truncateHash(id)}
                        </Text>
                    </div>
                )
            },
            width: "5%",
            hidden: !breakpoint,
        },
        {
            title: "EX1",
            dataIndex: "ex1Name",
            key: "ex1Name",
            ellipsis: true,

            sortDirections: ["descend", "ascend"],
            align: "center",
            width: "4%",
        },
        {
            title: "Id",
            dataIndex: "ex1OrderId",
            key: "ex1OrderId",
            ellipsis: true,
            render: (id: string) => {
                return (
                    <div className=" max-w-[12em] justify-self-end truncate">
                        {" "}
                        <Text
                            copyable={{ text: id }} // Copies the ACTUAL full ID, not the visual text
                            style={{ maxWidth: "100%" }}
                        >
                            {truncateHash(id)}
                        </Text>
                    </div>
                )
            },
            sortDirections: ["descend", "ascend"],
            align: "end",
            width: "5%",
            hidden: !breakpoint,
        },
        {
            title: "Price",
            dataIndex: "ex1Price",
            key: "ex1Price",

            render: (ex1Price: number) => (ex1Price ?? 0).toPrecision(6),

            align: "end",
            width: "5%",
        },
        {
            title: "Funding",
            dataIndex: "ex1FundingFee",
            key: "ex1FundingFee",
            sorter: (a, b) => a.ex1FundingFee - b.ex1FundingFee,
            render: (fundingFee: number) => {
                const _fundingFee = fundingFee ? fundingFee * -1 : 0
                return <Text type={_fundingFee > 0 ? "success" : _fundingFee === 0 ? "warning" : "danger"}>{_fundingFee?.toFixed(4)}</Text>
            },
            align: "end",
            width: "6%",
        },
        {
            title: "Fee",
            dataIndex: "ex1OrderFee",
            key: "ex1OrderFee",
            sorter: (a, b) => a.ex1OrderFee - b.ex1OrderFee,
            render: (fee: number) => (fee ?? 0).toFixed(4),
            align: "end",
            width: "6%",
        },
        {
            title: "EX2",
            dataIndex: "ex2Name",
            key: "ex2Name",
            ellipsis: true,
            sortDirections: ["descend", "ascend"],
            align: "center",
            width: "4%",
        },
        {
            title: "Id",
            dataIndex: "ex2OrderId",
            key: "ex2OrderId",
            ellipsis: true,
            align: "end",
            render: (id: string) => {
                return (
                    <div className=" max-w-[12em] justify-self-end truncate">
                        {" "}
                        <Text
                            copyable={{ text: id }} // Copies the ACTUAL full ID, not the visual text
                            style={{ maxWidth: "100%" }}
                        >
                            {truncateHash(id)}
                        </Text>
                    </div>
                )
            },
            width: "5%",
            hidden: !breakpoint,
        },
        {
            title: "Price",
            dataIndex: "ex2Price",
            key: "ex2Price",
            align: "end",
            width: "10%",
            responsive: ["xl"],
            render: (ex2Price: number) => (ex2Price ?? 0).toPrecision(6),
        },
        {
            title: "Funding",
            dataIndex: "ex2FundingFee",
            key: "ex2FundingFee",
            sorter: (a, b) => a.ex2FundingFee - b.ex2FundingFee,
            render: (fundingFee: number) => {
                const _fundingFee = fundingFee ? fundingFee * -1 : 0
                return <Text type={_fundingFee > 0 ? "success" : _fundingFee === 0 ? "warning" : "danger"}>{_fundingFee?.toFixed(4)}</Text>
            },
            align: "end",
            width: "6%",
        },
        {
            title: "Fee",
            dataIndex: "ex2OrderFee",
            key: "ex2OrderFee",
            sorter: (a, b) => a.ex2OrderFee - b.ex2OrderFee,
            render: (fee: number) => (fee ?? 0).toFixed(4),
            align: "end",
            width: "6%",
        },
    ]

    const expandedRowRender = (data: fundingRateProfitResponse) => {
        const dataSource: expandedRowType[] = [
            {
                type: "OPEN",
                address: data.address,
                timestamp: data.timestamp,
                UUID: data.openingUUID,

                // Post-computed attributes
                key: data.key + "expandedOPENRow",
                coin: data.baseSymbol,
                ex1Name: data.OPex1Name,
                ex1OrderId: data.OPex1Id,
                ex1FundingFee: data.OPex1FundingFee,
                ex1Price: data.OPex1Price,
                ex1OrderFee: data.OPex1OrderFee,

                ex2Name: data.OPex2Name,
                ex2OrderId: data.OPex2Id,
                ex2FundingFee: data.OPex2FundingFee,
                ex2Price: data.OPex2Price,
                ex2OrderFee: data.OPex2OrderFee,

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
            },
            {
                type: "CLOSE",
                address: data.address,
                timestamp: data.timestamp,
                UUID: data.closingUUID,

                // Post-computed attributes
                key: data.key + "expandedCLOSERow",
                coin: data.baseSymbol,
                ex1Name: data.CPex1Name,
                ex1OrderId: data.CPex1Id,
                ex1FundingFee: data.CPex1FundingFee,
                ex1Price: data.CPex1Price,
                ex1OrderFee: data.CPex1OrderFee,

                ex2Name: data.CPex2Name,
                ex2OrderId: data.CPex2Id,
                ex2FundingFee: data.CPex2FundingFee,
                ex2Price: data.CPex2Price,
                ex2OrderFee: data.CPex2OrderFee,

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
            },
        ]
        return (
            // <div size="large">
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
            // </Space>
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

            <Table<fundingRateProfitResponse>
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
