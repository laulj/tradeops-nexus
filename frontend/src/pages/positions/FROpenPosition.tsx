import { useState, useEffect, useRef, type FC } from "react"
import { Space, Typography, Table, Button, Input, Grid } from "antd"
import { formattingTimeDurationFn } from "@/utils/format"
import { getFRateOpenedPositions, removedFRateOpenedPosition } from "@/api/backend"
import type { ColumnsType } from "antd/es/table"
import type { fundingRateOP } from "@/types"
import { SearchOutlined } from "@ant-design/icons"
import type { InputRef, TableColumnType } from "antd"
import type { FilterDropdownProps } from "antd/es/table/interface"
import Highlighter from "react-highlight-words"
import { formatLeadingZero } from "@/pages/profit"

const { Text } = Typography
const { useBreakpoint } = Grid

type DataIndex = keyof fundingRateOP

const FROPosition: FC = () => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs

    // const [activeKey, setActiveKey] = useState<string>("USDC")
    const [txs, setTxs] = useState<fundingRateOP[]>([])
    const updateOPs = async () => {
        let _txs: fundingRateOP[] = []
        const response = await getFRateOpenedPositions()

        if (response) {
            const data = response
                ?.map((data, _ind) => {
                    return { ...data, key: _ind.toString() }
                })
                .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
            _txs = [...data]
        }
        return [..._txs]
    }
    useEffect(() => {
        ;(async () => {
            const newOPs = await updateOPs()
            setTxs([...newOPs])
        })()
    }, [])
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
    const getColumnSearchProps = (dataIndex: DataIndex): TableColumnType<fundingRateOP> => ({
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

    const removeOP = async (openingUUID: string) => {
        await removedFRateOpenedPosition(openingUUID)
        const newOPs = await updateOPs()
        setTxs([...newOPs])
    }
    const columns: ColumnsType<fundingRateOP> = [
        {
            title: "Time",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            sortDirections: ["descend", "ascend"],
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
            title: "Symbol",
            dataIndex: "coin",
            key: "coin",
            ellipsis: true,
            ...getColumnSearchProps("coin"),
            align: "end",
            // width: breakpoint ? "5%" : "5%",
        },
        {
            title: "EX1",
            dataIndex: "ex1Name",
            key: "ex1Name",
            ellipsis: true,
            ...getColumnSearchProps("ex1Name"),
            // sorter: (a, b) => parseFloat(a.cexName as string) - parseFloat(b.cexName as string),
            sortDirections: ["descend", "ascend"],
            align: "end",
            render: (name: string) => {
                return (name ?? "").toUpperCase()
            },
            // width: breakpoint ? "5%" : "5%",
        },
        {
            title: "Id",
            dataIndex: "ex1OrderId",
            key: "ex1OrderId",
            ellipsis: true,
            ...getColumnSearchProps("ex1OrderId"),
            // sorter: (a, b) => parseFloat(a.orderId!) - parseFloat(b.orderId!),
            sortDirections: ["descend", "ascend"],
            align: "end",
            // width: "7%",
        },

        {
            title: "Price",
            dataIndex: "ex1Price",
            key: "ex1Price",
            align: "end",
            // width: "6%",
            responsive: ["xl"],
            render: (price: number) => {
                return (price ?? 0).toPrecision(6)
            },
        },
        {
            title: "Funding",
            dataIndex: "ex1FundingFee",
            key: "ex1FundingFee",
            sorter: (a, b) => a.ex1FundingFee - b.ex1FundingFee,
            //sortDirections: ["", "ascend"],
            render: (fundingFee: number) => {
                const _fundingFee = fundingFee ? fundingFee * -1 : 0
                return <Text type={_fundingFee > 0 ? "success" : _fundingFee === 0 ? "warning" : "danger"}>{_fundingFee.toFixed(4)}</Text>
            },
            align: "end",
            // width: "6%",
        },
        {
            title: "Fee",
            dataIndex: "ex1OrderFee",
            key: "ex1OrderFee",
            sorter: (a, b) => a.ex1OrderFee - b.ex1OrderFee,
            //sortDirections: ["", "ascend"],
            render: (fee: number) => (fee ?? 0).toFixed(4),
            align: "end",
            // width: "6%",
        },
        {
            width: "5%",
        },
        {
            title: "EX2",
            dataIndex: "ex2Name",
            key: "ex2Name",
            ellipsis: true,
            ...getColumnSearchProps("ex2Name"),
            // sorter: (a, b) => parseFloat(a.dexName as string) - parseFloat(b.dexName as string),
            sortDirections: ["descend", "ascend"],
            align: "end",
            render: (name: string) => {
                return (name ?? "").toUpperCase()
            },
        },
        {
            title: "Id",
            dataIndex: "ex2OrderId",
            key: "ex2OrderId",
            ellipsis: true,
            align: "end",
            ...getColumnSearchProps("ex2OrderId"),
            // width: "7%",
        },
        {
            title: "Price",
            dataIndex: "ex2Price",
            key: "ex2Price",
            align: "end",
            // width: "6%",
            responsive: ["xl"],
            render: (price: number) => (price ?? 0).toPrecision(6),
        },
        {
            title: "Funding",
            dataIndex: "ex2FundingFee",
            key: "ex2FundingFee",
            sorter: (a, b) => a.ex2FundingFee - b.ex2FundingFee,
            //sortDirections: ["", "ascend"],
            // render: (fundingFee: number) => (fundingFee ?? 0).toFixed(4),
            render: (fundingFee: number) => {
                const _fundingFee = fundingFee ? fundingFee * -1 : 0
                return <Text type={_fundingFee > 0 ? "success" : _fundingFee === 0 ? "warning" : "danger"}>{_fundingFee.toFixed(4)}</Text>
            },
            align: "end",
            // width: "6%",
        },
        {
            title: "Fee",
            dataIndex: "ex2OrderFee",
            key: "ex2OrderFee",
            sorter: (a, b) => a.ex2OrderFee - b.ex2OrderFee,
            //sortDirections: ["", "ascend"],
            render: (fee: number) => (fee ?? 0).toFixed(4),
            align: "end",
            // width: "6%",
        },
        {
            title: "Amount",
            dataIndex: "qty",
            key: "qty",
            sorter: (a, b) => a.qty - b.qty,
            //sortDirections: ["", "ascend"],
            render: (qty: number) => (qty ?? 0).toLocaleString(),
            align: "end",
            // width: "6%",
        },
        {
            title: "Duration",
            dataIndex: "timestamp",
            key: "timestamp",
            align: "end",
            // width: "10%",
            // responsive: ["xl"],
            render: (timestamp: number) => {
                const runTime = formattingTimeDurationFn(Date.now() - (timestamp ?? 0))

                return `${runTime.days} d${runTime.days > 1 ? "" : " "} ${formatLeadingZero(runTime.hrs)} hr  ${
                    runTime.hrs > 1 ? "" : " "
                } ${formatLeadingZero(runTime.mins)} m  ${runTime.mins > 1 ? "" : " "} ${formatLeadingZero(runTime.secs)} s`
            },
        },
        {
            title: "Action",
            key: "action",
            // width: "5%",
            align: "center",
            render: (pos: fundingRateOP) => (
                <Space size="middle">
                    <a onClick={() => removeOP(pos.uuid)}>Delete</a>
                </Space>
            ),
        },
    ]
    return (
        <Table
            size="small"
            dataSource={txs}
            columns={columns}
            pagination={{ defaultPageSize: 25, pageSizeOptions: [5, 10, 25, 50] }}
            scroll={{ x: "max-content" }}
            rowClassName={`!text-nowrap font-metric ${isMobile ? "!text-xs" : "!text-md"}`}
            loading={!txs}
            sticky
        />
    )
}

export default FROPosition
