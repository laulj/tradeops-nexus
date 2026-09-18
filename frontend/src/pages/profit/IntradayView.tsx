import { useState, useRef, type FC } from "react"
import { Space, Typography, Table, Button, Input, Grid, Tooltip } from "antd"
import type { ColumnsType } from "antd/es/table"
import type { rawProfitResp } from "@/types"
import { SearchOutlined } from "@ant-design/icons"
import type { InputRef, TableColumnType } from "antd"
import type { FilterDropdownProps } from "antd/es/table/interface"
import Highlighter from "react-highlight-words"
import { truncateHash } from "./utils"
const { useBreakpoint } = Grid
const { Text } = Typography
type DataIndex = keyof rawProfitResp

export const ProfitIntradayView: FC<{
    profit: rawProfitResp[]
    isLoading: boolean
}> = ({ profit, isLoading }): React.ReactElement => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs
    const [searchText, setSearchText] = useState("")
    const [searchedColumn, setSearchedColumn] = useState("")
    const searchInput = useRef<InputRef>(null)

    const handleSearch = (selectedKeys: string[], confirm: FilterDropdownProps["confirm"], dataIndex: DataIndex) => {
        confirm()
        setSearchText(selectedKeys[0])
        setSearchedColumn(dataIndex)
    }
    const handleReset = (clearFilters: () => void) => {
        clearFilters()
        setSearchText("")
    }
    const getColumnSearchProps = (dataIndex: DataIndex): TableColumnType<rawProfitResp> => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
            <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
                <Input
                    ref={searchInput}
                    placeholder={`Search ${dataIndex}`}
                    value={selectedKeys[0]}
                    onChange={(e) => {
                        setSelectedKeys(e.target.value ? [e.target.value] : [])
                        handleSearch(e.target.value ? [e.target.value] : ([] as string[]), () => confirm({ closeDropdown: false }), dataIndex)
                    }}
                    onPressEnter={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
                    style={{ marginBottom: 8, display: "block" }}
                />
                <Space>
                    <Button
                        type="primary"
                        onClick={() => handleSearch(selectedKeys as string[], confirm, dataIndex)}
                        icon={<SearchOutlined />}
                        size="small"
                        style={{ width: 90 }}
                    >
                        Search
                    </Button>
                    <Button onClick={() => clearFilters && handleReset(clearFilters)} size="small" style={{ width: 90 }}>
                        Reset
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            confirm({ closeDropdown: false })
                            setSearchText((selectedKeys as string[])[0])
                            setSearchedColumn(dataIndex)
                        }}
                    >
                        Filter
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        onClick={() => {
                            close()
                        }}
                    >
                        close
                    </Button>
                </Space>
            </div>
        ),
        filterDropdownProps: {
            onOpenChange: (open) => {
                if (open) {
                    setTimeout(() => searchInput.current?.select(), 100)
                }
            },
        },
        filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
        onFilter: (value, record) =>
            record[dataIndex]!.toString()
                .toLowerCase()
                .includes((value as string).toLowerCase()),
        // onFilterDropdownOpenChange: (visible) => {
        //     if (visible) {
        //         setTimeout(() => searchInput.current?.select(), 100)
        //     }
        // },
        render: (text) =>
            searchedColumn === dataIndex ? (
                <Highlighter
                    highlightStyle={{ backgroundColor: "#ffc069", padding: 0 }}
                    searchWords={[searchText]}
                    autoEscape
                    textToHighlight={text ? text.toString() : ""}
                />
            ) : (
                text
            ),
    })
    const columns: ColumnsType<rawProfitResp> = [
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
                    timestamp = date[2] + "-" + date[0] + "-" + date[1] + "," + _timestamp.split(",")[1]

                    // return timestamp
                    return (
                        <div className="flex flex-row flex-wrap sm:flex-nowrap justify-between gap-x-2">
                            <div>{date[2] + "-" + date[0] + "-" + date[1] + ","}</div>
                            <div>{timestamp.split(",")[1]}</div>
                        </div>
                    )
                }
            },
            width: "15%",
            ellipsis: true,
        },
        {
            title: "Base",
            dataIndex: "baseSymbol",
            key: "baseSymbol",
            ellipsis: true,
            align: "end",
            width: 80,
        },
        {
            title: "ID1",
            dataIndex: "orderId",
            key: "orderId",
            ellipsis: true,
            ...getColumnSearchProps("orderId"),
            sorter: (a, b) => parseFloat(a.orderId) - parseFloat(b.orderId),
            sortDirections: ["descend", "ascend"],
            align: "end",
            width: 50,

            render: (orderId: string) => {
                return (
                    <div aria-valuetext={orderId} className=" max-w-[12em] justify-self-end">
                        <Text
                            copyable={{ text: orderId }} // Copies the ACTUAL full ID, not the visual text
                            style={{ maxWidth: "100%" }}
                        >
                            {truncateHash(orderId)}
                        </Text>
                    </div>
                )
            },
        },
        {
            title: "ID2",
            dataIndex: "txHash",
            key: "txHash",
            ellipsis: true,
            align: "end",
            ...getColumnSearchProps("txHash"),
            render: (txHash: string) => {
                return (
                    <div className=" max-w-[12em] justify-self-end ">
                        <Text
                            copyable={{ text: txHash }} // Copies the ACTUAL full ID, not the visual text
                            style={{ maxWidth: "100%" }}
                        >
                            {truncateHash(txHash)}
                        </Text>
                    </div>
                )
            },
            width: 50,
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
            width: 125,
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
            // width: "15%",
        },
    ]

    return (
        <Table
            size="small"
            dataSource={profit}
            columns={columns}
            loading={isLoading}
            pagination={false}
            scroll={{
                y: "100%",

                x: "max-content",
            }}
            sticky
            rowKey="key"
            rowClassName={isMobile ? `!text-xs font-metric` : "!text-md font-metric"}
        />
    )
}
