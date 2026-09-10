import React, { type FC, useMemo } from "react"
import { Grid, Table, Badge } from "antd"
import type { ColumnsType } from "antd/es/table"
import { type backendStatus } from "@/types"
import { UpTime } from "@/pages/settings/UpTime"

const { useBreakpoint } = Grid
const { Column } = Table

interface DataType {
    key: React.Key
    address: string
    symbols: string[]
}

export const Status: FC<{
    // isRunning: boolean
    addresses: Set<string>
    botStatus: { [key: string]: { [key: string]: backendStatus } }
}> = ({ addresses, botStatus }): React.ReactElement => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs
    const _addresses = Array.from(addresses)
    const data: DataType[] = useMemo(() => {
        return _addresses.map((address, _i) => {
            const symbols = Object.keys(botStatus[address] ?? [])

            return {
                key: `botStat_${_i + 1}`,
                address,
                symbols,
            }
        })
    }, [addresses, botStatus])

    interface expandedRowType extends Omit<DataType, "symbols"> {
        symbol: string
        status: string
        upTime: React.ReactElement
    }

    const expandColumns: ColumnsType<expandedRowType> = [
        {
            width: isMobile ? "2%" : "5%",
        },
        {
            title: "Symbol",
            dataIndex: "symbol",
            key: "symbol",
            ellipsis: true,
            align: "start",
            width: 60,
            render: (symbol: string) => (
                /* 🟢 Fix 2: Corrected Tailwind syntax to max-w-[120px] and added explicit block truncation handles */
                <div className="max-w-[10em] truncate text-left" title={symbol}>
                    {symbol}
                </div>
            ),
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            align: "start",
            width: "35%", // 🟢 Proportional balancing
            render: (status: string) => (
                <Badge className="!text-nowrap" status="processing" text={status} color={status === "Good" ? "green" : "red"} />
            ),
        },
        {
            title: () => <div className="pe-4">Up Time</div>,
            dataIndex: "upTime",
            key: "upTime",
            width: "40%", // 🟢 Proportional balancing
            align: "end",
        },
    ]

    const expandedRowRender = (data: DataType) => {
        const symbols = data.symbols
        const dataSource: expandedRowType[] = symbols.map((symbol) => {
            return {
                key: data.key + `_${symbol}`,
                address: data.address,
                symbol,
                status: botStatus[data.address][symbol],
                upTime: <UpTime address={data.address} symbol={symbol} isRunning={botStatus[data.address][symbol] === "Good" ? true : false} />,
            }
        })

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

    return (
        <Table
            dataSource={data}
            loading={!data}
            expandable={{
                expandedRowRender,
                defaultExpandAllRows: true,
                // defaultExpandedRowKeys: ["0"],
                // columnTitle: "More",
                columnWidth: 1,
                fixed: "left",
                rowExpandable: (record) => record.symbols.length !== 0,
            }}
            scroll={{
                x: "max-content",
                scrollToFirstRowOnChange: true,
            }}
        >
            <Column title="No." dataIndex="key" key="key" width={isMobile ? "2%" : "5%"} align="end" render={(key: string) => key.split("_")[1]} />
            <Column title="Address" dataIndex="address" key="address" ellipsis />
        </Table>
    )
}
