import { useState, type FC, useEffect } from "react"
import { Select, Table } from "antd"
import type { ColumnsType } from "antd/es/table"
import type { balanceResponse } from "@/types"
import { getOptions } from "@/utils/format"
import { useBalanceQuery } from "@/hooks/useBalance"
import { Panel, SectionLabel } from "@/components/ui"

export const Balance: FC<{
    activeKey: string
    setActiveKey: React.Dispatch<React.SetStateAction<string>>
    addresses: Set<string>
    activeAddress: string
    setActiveAddress: React.Dispatch<React.SetStateAction<string>>
}> = ({ activeKey, setActiveKey, addresses, activeAddress, setActiveAddress }): React.ReactElement => {
    const [filteredBalance, setFilteredBalance] = useState<balanceResponse[]>([])
    const { data, isLoading } = useBalanceQuery()

    useEffect(() => {
        let _filteredResp: balanceResponse[]
        if (isLoading) return

        if (data?.[activeKey]) {
            _filteredResp = data[activeKey].sort((a, b) => new Date(Number(b.timestamp)).valueOf() - new Date(Number(a.timestamp)).valueOf())
            if (activeAddress !== "ALL") _filteredResp = _filteredResp.filter((tx) => tx.address === activeAddress)

            setFilteredBalance(_filteredResp)
        }
    }, [activeAddress, activeKey, data])

    const onChange = (value: string) => {
        setActiveKey(value)
    }

    const columns: ColumnsType<balanceResponse> = [
        {
            title: "Timestamp",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            sortDirections: ["descend", "ascend"],
            render: (timestamp: string) => {
                if (!isNaN(new Date(Number(timestamp)).valueOf())) {
                    const _timestamp = new Date(Number(timestamp)).toLocaleString()
                    const date = _timestamp.split(",")[0].split("/")
                    timestamp = date[2] + "-" + date[0] + "-" + date[1] + "," + _timestamp.split(",")[1]

                    return (
                        <div className="flex flex-row flex-wrap sm:flex-nowrap justify-between gap-x-2">
                            <div>{date[2] + "-" + date[0] + "-" + date[1] + ","}</div>
                            <div>{timestamp.split(",")[1]}</div>
                        </div>
                    )
                }
            },
            width: 170,
            ellipsis: true,
        },
        {
            title: "Balance",
            dataIndex: "amount",
            key: "amount",
            align: "end",
            render: (amount: string) => {
                return Math.floor(parseFloat(amount))
            },
        },
    ]

    return (
        <Panel
            label="Account balance"
            right={
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        size="small"
                        value={activeAddress}
                        options={getOptions(Array.from(addresses))}
                        onChange={(e) => setActiveAddress(e)}
                        className="text-start !truncate"
                        style={{ maxWidth: 220 }}
                    />
                    <Select
                        size="small"
                        value={activeKey}
                        options={getOptions(Object.keys(data ?? {})).filter(({ value }) => value !== "USDT")}
                        onChange={onChange}
                        loading={isLoading}
                    />
                </div>
            }
        >
            <div className="mb-2 flex items-center gap-2">
                <SectionLabel>{activeKey}</SectionLabel>
            </div>
            <Table
                size="small"
                dataSource={filteredBalance}
                columns={columns}
                loading={isLoading}
                scroll={{ x: "max-content" }}
                rowClassName="!text-md font-metric"
            />
        </Panel>
    )
}
