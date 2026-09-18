import React, { useState, useEffect, type FC, useMemo, type JSX, useRef } from "react"
import { Typography, Select, DatePicker, type TablePaginationConfig, Grid, Form, type SplitterProps, Splitter, Pagination, Button, App } from "antd"
import { CSVLink } from "react-csv"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    tradeTypes,
    views,
    type aggregatedProfitResp,
    type apiDataResp,
    type fundingRateProfitResponse,
    type rawProfitResp,
    type spotFutureProfitResponse,
} from "@/types"
import type { RangePickerProps } from "antd/es/date-picker"
import { formatDollarClean, getOptions, capitalize } from "@/utils/format"
import { fetchAggregatedData, fetchRawData } from "@/api/backend"
import { ProfitIntradayView } from "@/pages/profit/IntradayView"
import { AggregatedView } from "@/pages/profit/AggregatedView"
import { SF_ProfitIntradayView } from "@/pages/profit/spotFuture"
import { ExportIcon } from "@/components/icons/nexus"
import { Panel, SegmentedPill } from "@/components/ui"
import dayjs from "dayjs"
import { FR_ProfitIntradayView } from "@/pages/profit/fundingRate/FRIntradayView"
import { useSymbolQuery } from "@/hooks/useSymbols"
const { Text } = Typography
const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

const DEFAULT_STALE_TIME = 10 * 1000
export const Profit: FC<{
    activeKey: string
    setActiveKey: React.Dispatch<React.SetStateAction<string>>
    activeKey2: string
    setActiveKey2: React.Dispatch<React.SetStateAction<string>>
    addresses: Set<string>
}> = ({ activeKey, setActiveKey, activeKey2, setActiveKey2, addresses }): React.ReactElement => {
    const SPLITTER_SIZES = "splitterSizes"
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs
    const { notification } = App.useApp()
    const queryClient = useQueryClient()
    // const { profit } = useContext(ProfitContext)
    const [activeAddress, setActiveAddress] = useState<string>("ALL")
    const [tradeType, setTradeType] = useState<keyof typeof tradeTypes>(tradeTypes.total)
    const [viewType, setViewType] = useState<keyof typeof views>(views.Intraday)
    const [calenderFilter, setCalenderFilter] = useState<{ startDate: number; endDate: number }>({
        startDate: 0,
        endDate: new Date().setHours(24, 24, 24, 24).valueOf(),
    })
    const [pagination, setPagination] = useState<TablePaginationConfig>({
        current: 1,
        pageSize: 50,
        total: 0,
        showSizeChanger: true, // ✅ Uncommented
        pageSizeOptions: [10, 20, 50, 100, 500],
        showTotal: (total, range) => {
            return !isMobile ? (
                <span className="!font-mono !text-xs !text-zinc-700 whitespace-nowrap">
                    {" "}
                    Latest {`${range[0]}-${range[1]}`} of
                    <Text strong className="!font-mono !tabular-nums !text-xs !text-zinc-700">
                        {" "}
                        {`${formatDollarClean(total)}`}
                    </Text>{" "}
                    transactions
                </span>
            ) : (
                <span className="!font-mono !text-xs/2 !text-zinc-700 whitespace-nowrap">
                    {/* {`${range[0]}-${range[1]}`} of
                    <span className="!font-mono !tabular-nums !text-xs/2 !text-zinc-700"> {`${formatDollarClean(total)}`}</span> */}
                </span>
            )
        },
        className: "!text-xs",
    })
    const [isDownloading, setIsDownloading] = useState<boolean>(false)
    const csvRef = useRef<CSVLink | null>(null)

    useEffect(() => {
        // Clear cache when unmount
        return () => localStorage.removeItem(SPLITTER_SIZES)
    }, [])

    useEffect(() => {
        // Clear filters
        setActiveAddress("ALL")
        setActiveKey("USDC")
        setActiveKey2("ALL")
    }, [tradeType])

    // Fetch Unique Symbols
    const uniqueSymQuery = useSymbolQuery(tradeType)

    // ── Raw data query (only runs for Intraday) ──
    const rawQuery = useQuery({
        queryKey: [
            "rawProfits",
            [{ baseSymbol: activeKey2, quoteSymbol: activeKey }],
            activeAddress,
            tradeType,
            viewType,
            activeKey,
            activeKey2,
            pagination.current,
            pagination.pageSize,
            pagination.total,
            JSON.stringify(calenderFilter),
        ],
        queryFn: () =>
            fetchRawData(
                [{ baseSymbol: activeKey2 === "ALL" ? undefined : activeKey2, quoteSymbol: activeKey }],
                activeAddress,
                tradeType,
                viewType,
                pagination,
                calenderFilter,
            ),
        placeholderData: keepPreviousData,
        staleTime: calenderFilter.endDate - calenderFilter.startDate > 86400000 ? 5 * 60 * 1000 : 3 * DEFAULT_STALE_TIME,
        enabled: viewType === views.Intraday, // 👈 only runs when Intraday is selected
    })
    // ── Aggregated data query (runs for Daily/Weekly/etc.) ──
    const aggregatedQuery = useQuery({
        queryKey: [
            "aggregatedProfits",
            [{ baseSymbol: activeKey2, quoteSymbol: activeKey }],
            activeAddress,
            tradeType,
            viewType,
            activeKey,
            activeKey2,
            pagination.current,
            pagination.pageSize,
            pagination.total,
            JSON.stringify(calenderFilter),
        ],
        queryFn: () =>
            fetchAggregatedData(
                [{ baseSymbol: activeKey2 === "ALL" ? undefined : activeKey2, quoteSymbol: activeKey }],
                activeAddress,
                tradeType,
                viewType,
                pagination,
                calenderFilter,
            ),
        placeholderData: keepPreviousData,
        staleTime: calenderFilter.endDate - calenderFilter.startDate > 86400000 ? 5 * 60 * 1000 : 3 * DEFAULT_STALE_TIME,
        enabled: viewType !== views.Intraday, // 👈 runs for all other views
    })
    const { data, isLoading, isFetching, isPlaceholderData } = viewType === views.Intraday ? rawQuery : aggregatedQuery
    // Extract data and total from the query result
    const apiData: { [key: string]: apiDataResp<typeof viewType>[] } = data?.data || {}

    const filteredProfit = useMemo(() => {
        if (!apiData || (apiData && Object.keys(apiData).length === 0)) return

        const _filteredProfits = Object.keys(apiData).flatMap((_baseSymbol) => {
            if (_baseSymbol !== "USDC") return apiData[_baseSymbol]
            return []
        })

        return _filteredProfits.sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    }, [data])

    useEffect(() => {
        if (data?.pagination?.total !== undefined) {
            setPagination((prev) => {
                const totalTxs = data.pagination.total / (Object.keys(data["data"])?.length ?? 1)
                const totalPages = Math.ceil(totalTxs / data.pagination.pageSize)

                return {
                    ...prev,
                    current: prev.current! > totalPages ? totalPages : prev.current!,
                    total: totalTxs,
                }
            })
        }
    }, [data, viewType])

    // Prefetch the next page!
    useEffect(() => {
        if (!isPlaceholderData && data && data["pagination"]) {
            const totalTxs = data.pagination.total / (Object.keys(data["data"])?.length ?? 1)
            const totalPages = Math.ceil(totalTxs / data.pagination.pageSize)
            const nextQueryFn = viewType === views.Intraday ? fetchRawData : fetchAggregatedData

            if (data.pagination.current + 1 <= totalPages)
                queryClient.prefetchQuery({
                    queryKey: [
                        viewType === views.Intraday ? "rawProfits" : "aggregatedProfits",
                        [{ baseSymbol: activeKey2, quoteSymbol: activeKey }],
                        activeAddress,
                        tradeType,
                        viewType,
                        activeKey,
                        activeKey2,
                        pagination.current,
                        pagination.pageSize,
                        pagination.total,
                        JSON.stringify(calenderFilter),
                    ],
                    queryFn: () =>
                        nextQueryFn(
                            [{ baseSymbol: activeKey2 === "ALL" ? undefined : activeKey2, quoteSymbol: activeKey }],
                            activeAddress,
                            tradeType,
                            viewType,
                            pagination,
                            calenderFilter,
                        ),
                })
        }
    }, [data, isPlaceholderData, pagination.current])

    // ── Handle page change ────────────────────────────────
    const handlePageChange = (page: number, pageSize: number) => {
        setPagination((prev) => ({
            ...prev,
            current: page,
            pageSize,
        }))
    }
    const onChangeAKey = (value: string) => {
        setActiveKey(value)
    }

    const onChangeCalender: RangePickerProps["onChange"] = (value) => {
        if (value) {
            const startDate = value![0]!.valueOf()
            const endDate = value![1]!.valueOf()
            setCalenderFilter({ startDate, endDate })
        } else
            setCalenderFilter({
                startDate: 0,
                endDate: new Date().setHours(24, 24, 24, 24).valueOf(),
            })
    }

    const viewTypeOnChange = (value: string) => setViewType(views[value as keyof typeof views])

    const getTable = (viewType: keyof typeof views) => {
        let element: JSX.Element | undefined = undefined
        // console.time(`<Profit/> getTable()`)
        if (viewType === views.Intraday) {
            if (tradeType === tradeTypes.spot || tradeType === tradeTypes.total)
                element = <ProfitIntradayView profit={filteredProfit as rawProfitResp[]} isLoading={isLoading || isFetching} />
            else if (tradeType === tradeTypes.spotFuture)
                element = <SF_ProfitIntradayView profit={filteredProfit as unknown as spotFutureProfitResponse[]} />
            else if (tradeType === tradeTypes.fundingRate)
                element = <FR_ProfitIntradayView profit={filteredProfit as unknown as fundingRateProfitResponse[]} />
        } else
            element = <AggregatedView tradeType={tradeType} profit={filteredProfit as aggregatedProfitResp[]} isLoading={isLoading || isFetching} />
        return element
    }

    const tradeTypeOnChange = (e: string) => setTradeType(e as tradeTypes)

    const layout = {
        labelCol: { xs: { span: 10 }, md: { span: 4 } },
        wrapperCol: { xs: { span: 14 }, md: { span: 16 } },
    }

    const tailLayout = {
        // wrapperCol: { offset: 0, span: 8 },
    }

    const triggerCSVDownload = () => {
        setIsDownloading(true)

        notification.success({
            title: "📊 CSV download started",
            description: `The file ${activeAddress}_${activeKey}-${activeKey2}_${tradeType.toUpperCase()}_${viewType.toUpperCase()}_profits.csv is being downloaded.`,
            duration: 3,
        })

        // Programmatically trigger the CSV link click safely
        ;(csvRef.current as unknown as { link: HTMLAnchorElement }).link.click()
        setIsDownloading(false)
    }
    const TableFormFilters = (
        <div className="flex  flex-col sm:flex-row justify-between  pe-4">
            <Form {...layout} layout="inline">
                <div className="flex flex-col 2xs:gap-y-1  sm:gap-y-3">
                    <Form.Item label="Trade Type" {...tailLayout}>
                        <div className="flex flex-start">
                            {isMobile ? (
                                <Select
                                    options={Object.values(tradeTypes).map((s) => ({ label: capitalize(s), value: s }))}
                                    defaultValue={tradeType}
                                    onChange={tradeTypeOnChange}
                                    value={tradeType}
                                    size="small"

                                    // style={{ width: !screens.xs ? "25%" : "40%" }}
                                />
                            ) : (
                                <SegmentedPill
                                    ariaLabel="Trade type"
                                    options={Object.values(tradeTypes).map((s) => ({ label: capitalize(s), value: s }))}
                                    onChange={tradeTypeOnChange}
                                    value={tradeType}
                                />
                            )}
                        </div>
                    </Form.Item>
                    <Form.Item
                        label="Address"
                        // className="!w-[15em]"
                        {...tailLayout}
                    >
                        <div className="flex flex-start">
                            <Select
                                size={isMobile ? "small" : "middle"}
                                value={activeAddress}
                                options={getOptions(["ALL", ...Array.from(addresses)])}
                                onChange={(e) => setActiveAddress(e)}
                                className="text-start !truncate"
                                style={{ maxWidth: isMobile ? "6em" : "" }}
                                // popupMatchSelectWidth
                            />
                        </div>
                    </Form.Item>

                    <Form.Item label="Base/Quote" className="" {...tailLayout}>
                        <div className="flex flex-row no-wrap">
                            <Select
                                size={isMobile ? "small" : "middle"}
                                value={activeKey}
                                // defaultValue={activeKey}
                                options={getOptions(
                                    // [...Object.keys(profit[tradeType])])
                                    (uniqueSymQuery.data ?? []).filter((d) => d !== activeKey && d !== activeKey2),
                                )}
                                onChange={onChangeAKey}
                                style={{
                                    width: "6em",
                                }}
                            />
                            <Text className="!text-xl !mx-2">/</Text>
                            <Select
                                size={isMobile ? "small" : "middle"}
                                value={activeKey2}
                                options={(() => {
                                    if (!filteredProfit) return getOptions(["ALL"])
                                    const uniquePairs = new Set<string>(
                                        (uniqueSymQuery.data ?? []).filter((d) => d !== activeKey && d !== activeKey2),
                                    )

                                    const opts = ["ALL", ...Array.from(uniquePairs)]

                                    return getOptions(opts)
                                })()}
                                onChange={(e) => setActiveKey2(e)}
                                style={{ alignSelf: "flex-start", width: "6em" }}
                            />
                        </div>
                    </Form.Item>
                    <Form.Item label="Aggregation" {...tailLayout}>
                        <div className="flex flex-row no-wrap">
                            {isMobile ? (
                                <Select
                                    value={viewType}
                                    onChange={viewTypeOnChange}
                                    options={Object.values(views).map((v) => ({ label: v, value: v }))}
                                    size="small"
                                    // style={{ width: !screens.xs ? "25%" : "40%" }}
                                />
                            ) : (
                                <SegmentedPill
                                    ariaLabel="Aggregation"
                                    options={Object.values(views).map((v) => ({ label: v, value: v }))}
                                    onChange={viewTypeOnChange}
                                    value={viewType}
                                />
                            )}
                        </div>
                    </Form.Item>

                    <Form.Item label="Date" {...tailLayout}>
                        <div className="flex flex-start content-center items-center">
                            <RangePicker
                                placement="bottomRight"
                                onChange={onChangeCalender}
                                value={
                                    calenderFilter.startDate === 0 || calenderFilter.endDate === 0
                                        ? undefined
                                        : [dayjs(calenderFilter.startDate), dayjs(calenderFilter.endDate)]
                                }
                            />
                        </div>
                    </Form.Item>
                </div>
            </Form>
            <Button
                size={isMobile ? "small" : "middle"}
                icon={<ExportIcon size={14} />}
                className="self-end"
                loading={isLoading || isFetching || isDownloading}
                onClick={triggerCSVDownload} // Handled here exclusively
            >
                CSV
            </Button>
            {/* Render hidden in the DOM to avoid nesting conflicts */}
            <CSVLink
                ref={csvRef as unknown as React.Ref<CSVLink> & React.Ref<HTMLAnchorElement>}
                style={{ display: "none" }}
                filename={`${activeAddress}_${activeKey}-${activeKey2}_${tradeType.toUpperCase()}_${viewType.toUpperCase()}_profits.csv`}
                data={filteredProfit ?? []}
            />
        </div>
    )

    const CustomSplitter: React.FC<Readonly<SplitterProps>> = ({ style, ...restProps }) => {
        return (
            <div>
                <Splitter
                    // Essential: The splitter needs a height to distribute space vertically
                    style={{
                        ...style,
                        // height: "calc(100vh - 150px)",
                        height: "95vh",
                        // minHeight: "calc(100vh - 250px)",
                        // maxHeight: "90vh",
                    }}
                    onResizeEnd={(sizes) => {
                        localStorage.setItem(SPLITTER_SIZES, JSON.stringify(sizes))
                    }}
                    {...restProps}
                >
                    <Splitter.Panel
                        collapsible={{ start: true, end: true, showCollapsibleIcon: true }}
                        defaultSize={JSON.parse(localStorage.getItem(SPLITTER_SIZES) ?? '["30%", "70%"]')[0]}
                        style={{ overflow: "hidden" }}
                    >
                        {TableFormFilters}
                    </Splitter.Panel>
                    <Splitter.Panel
                        collapsible={{ start: true, end: true, showCollapsibleIcon: true }}
                        defaultSize={JSON.parse(localStorage.getItem(SPLITTER_SIZES) ?? '["30%", "70%"]')[1]}
                    >
                        <div className="pt-5">{getTable(viewType)}</div>
                    </Splitter.Panel>
                </Splitter>
                <Pagination {...pagination} onChange={(page, size) => handlePageChange(page, size)} size="small" align="end" className="!pt-2" />
            </div>
        )
    }
    return (
        <Panel>
            <CustomSplitter orientation="vertical" collapsible={{ motion: true }} />
        </Panel>
    )
}
