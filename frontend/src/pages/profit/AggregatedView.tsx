import { type FC } from "react"
import { Typography, Table, Grid, Tooltip } from "antd"
import type { ColumnsType } from "antd/es/table"
import { tradeTypes, type aggregatedProfitResp } from "@/types"

const { useBreakpoint } = Grid
const { Text } = Typography

export const AggregatedView: FC<{
    tradeType: tradeTypes
    profit: aggregatedProfitResp[]
    isLoading: boolean
}> = ({ tradeType, profit, isLoading }): React.ReactElement => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs

    const profitAggColumns: ColumnsType<aggregatedProfitResp> = [
        {
            title: "Time",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            sortDirections: ["descend", "ascend"],
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
            width: "40%",
        },
        {
            title: (
                <Tooltip title="Avg. Profit/Trade Size">
                    <span>%</span>
                </Tooltip>
            ),
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
            width: "20%",
        },
    ]
    const spotProfitAggColumns: ColumnsType<aggregatedProfitResp> = [
        {
            title: "Time",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            sortDirections: ["descend", "ascend"],
            width: 150,
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
            align: "end",
            showSorterTooltip: false,
            // width: "30%",
        },
        {
            title: (
                <Tooltip title="Avg. Profit/Trade Size">
                    <span>%</span>
                </Tooltip>
            ),
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
            width: 100,
        },
        {
            title: "T. Fee",
            // dataIndex: "amount",
            key: "totalFee",
            sorter: (a, b) => a.amount - b.amount,
            render: (obj) => (obj.closingOrderFee + obj.openingOrderFee)?.toFixed(2),
            align: "end",
            width: 100,
        },
        {
            title: (
                <Tooltip title="Positive funding indicate earned fees, vice versa.">
                    <span>T. Funding</span>
                </Tooltip>
            ),
            key: "totalFunding",
            filters: [
                {
                    text: "Earned",
                    value: "less than",
                },
                {
                    text: "Paid",
                    value: "more than or equal to",
                },
            ],
            onFilter: (value, obj) => {
                const closingFundingFee = (obj as { closingFundingFee?: number }).closingFundingFee ?? 0
                if (value === "less than") return +closingFundingFee < 0
                else return +closingFundingFee >= 0
            },
            render: (obj) => {
                const value = +((obj as { closingFundingFee?: number }).closingFundingFee ?? 0)
                return <Text type={value < 0 ? "success" : value === 0 ? "warning" : "danger"}>{value?.toFixed(2)}</Text>
            },
            align: "end",
            width: 120,
        },
    ]
    const fundingRProfitAggColumns: ColumnsType<aggregatedProfitResp> = [
        {
            title: "Time",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            sortDirections: ["descend", "ascend"],
            width: 100,
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
            align: "end",
            showSorterTooltip: false,
            // width: "30%",
        },
        {
            title: (
                <Tooltip title="Avg. Profit/Trade Size">
                    <span>%</span>
                </Tooltip>
            ),
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
            // width: 120,
        },
    ]
    return (
        <Table
            size="small"
            dataSource={profit}
            columns={
                tradeType === tradeTypes.total || tradeType === tradeTypes.spot
                    ? profitAggColumns
                    : tradeType === tradeTypes.spotFuture
                      ? spotProfitAggColumns
                      : fundingRProfitAggColumns
            }
            loading={isLoading}
            pagination={false}
            scroll={{
                // y: "100%",
                // "40vh",
                // isCollapse[0] ? "60vh" : "40vh",
                x: "max-content",
                // scrollToFirstRowOnChange: true,
            }}
            sticky
            // style={{ height: "100%" }}
            rowClassName={isMobile ? `!text-xs font-metric` : "!text-md font-metric"}
            // onChange={tableOnChange}
        />
    )
}
