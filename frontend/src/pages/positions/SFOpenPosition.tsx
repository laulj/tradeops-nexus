import { useState, useEffect, useRef, type FC } from "react"
import { Space, Typography, Flex, Table, Button, Input, Grid } from "antd"
import { formattingTimeDurationFn } from "@/utils/format"
import { getSpotFutureOpenedPositions, removedSpotFutureOpenedPosition } from "@/api/backend"
import type { ColumnsType } from "antd/es/table"
import type { spotFutureOP } from "@/types"
import { SearchOutlined } from "@ant-design/icons"
import type { InputRef, TableColumnType } from "antd"
import type { FilterDropdownProps } from "antd/es/table/interface"
import Highlighter from "react-highlight-words"
import { formatLeadingZero } from "@/pages/profit"

const { Text } = Typography
const { useBreakpoint } = Grid

type DataIndex = keyof spotFutureOP

const SFOPositions: FC = () => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs

    const [txs, setTxs] = useState<spotFutureOP[]>([])
    const updateOPs = async () => {
        let _txs: spotFutureOP[] = []
        const response = await getSpotFutureOpenedPositions()

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
    const getColumnSearchProps = (dataIndex: DataIndex): TableColumnType<spotFutureOP> => ({
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
        await removedSpotFutureOpenedPosition(openingUUID)
        const newOPs = await updateOPs()
        setTxs([...newOPs])
    }
    const columns: ColumnsType<spotFutureOP> = [
        {
            title: "Time",
            dataIndex: "timestamp",
            key: "timestamp",
            sorter: (a, b) => parseFloat(a.timestamp) - parseFloat(b.timestamp),
            sortDirections: ["descend", "ascend"],
            render: (timestamp: string) => {
                return isNaN(new Date(Number(timestamp)).valueOf()) ? timestamp : new Date(Number(timestamp)).toLocaleString()
            },
            // width: "8%",
        },
        {
            title: "Address",
            dataIndex: "address",
            key: "address",
            ...getColumnSearchProps("address"),
            sorter: (a, b) => parseInt(a.address, 16) - parseInt(b.address, 16),
            sortDirections: ["descend", "ascend"],
            render: (address: string) => {
                return address
            },
            // width: "5%",
            ellipsis: true,
        },
        {
            title: "Symbol",
            dataIndex: "coin",
            key: "coin",
            ellipsis: true,
            ...getColumnSearchProps("coin"),
            align: "end",
            // width: 100,
        },
        {
            title: "EX1",
            dataIndex: "cexName",
            key: "cexName",
            ellipsis: true,
            ...getColumnSearchProps("cexName"),
            // sorter: (a, b) => parseFloat(a.cexName as string) - parseFloat(b.cexName as string),
            sortDirections: ["descend", "ascend"],
            align: "end",
        },
        {
            title: "Id",
            dataIndex: "orderId",
            key: "orderId",
            ellipsis: true,
            ...getColumnSearchProps("orderId"),
            // sorter: (a, b) => parseFloat(a.orderId!) - parseFloat(b.orderId!),
            sortDirections: ["descend", "ascend"],
            align: "end",
            // width: "10%",
        },
        {
            title: "EX2",
            dataIndex: "dexName",
            key: "dexName",
            ellipsis: true,
            ...getColumnSearchProps("dexName"),
            // sorter: (a, b) => parseFloat(a.dexName as string) - parseFloat(b.dexName as string),
            sortDirections: ["descend", "ascend"],
            align: "end",
        },
        {
            title: "Id",
            dataIndex: "txHash",
            key: "txHash",
            ellipsis: true,
            align: "end",
            ...getColumnSearchProps("txHash"),
            // width: "10%",
        },
        {
            title: "Spot Price",
            dataIndex: "spotPrice",
            key: "spotPrice",
            align: "end",
            // width: "10%",
            // responsive: ["xl"],
            render: (spotPrice: number) => {
                return spotPrice.toPrecision(6)
            },
        },
        {
            title: "Future Price",
            dataIndex: "futurePrice",
            key: "futurePrice",
            align: "end",
            // width: "10%",
            // responsive: ["xl"],
            render: (futurePrice: number) => futurePrice.toPrecision(6),
        },
        {
            title: "%",
            dataIndex: "",
            key: "qty",
            // sorter: (a, b) => a.qty - b.qty,
            //sortDirections: ["", "ascend"],
            render: (pos: spotFutureOP) => {
                const percentDiff = (pos.futurePrice - pos.spotPrice) / pos.futurePrice

                return <Text type={percentDiff > 0 ? "success" : percentDiff === 0 ? "warning" : "danger"}>{percentDiff.toFixed(3)}</Text>
            },
            align: "end",
            // width: "5%",
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
            title: "Funding",
            dataIndex: "fundingFee",
            key: "fundingFee",
            sorter: (a, b) => a.fundingFee - b.fundingFee,
            //sortDirections: ["", "ascend"],
            render: (fundingFee: number) => {
                return <Text type={fundingFee < 0 ? "success" : fundingFee === 0 ? "secondary" : "danger"}>{(fundingFee ?? 0).toFixed(4)}</Text>
            },
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
                const runTime = formattingTimeDurationFn(Date.now() - timestamp)

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
            render: (pos: spotFutureOP) => (
                <Space size="middle">
                    <a onClick={() => removeOP(pos.uuid)}>Delete</a>
                </Space>
            ),
        },
    ]
    return (
        <Flex gap="large" align="flex-start" vertical>
            <Table
                size="small"
                dataSource={txs}
                columns={columns}
                pagination={{ defaultPageSize: 25, pageSizeOptions: [5, 10, 25, 50] }}
                scroll={{ x: "max-content" }}
                rowClassName={`!text-nowrap font-metric ${isMobile ? "!text-xs" : "!text-md"}`}
                loading={!txs}
                style={{ width: "100%" }}
            />
        </Flex>
    )
}

export default SFOPositions
