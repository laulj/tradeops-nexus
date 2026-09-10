import { useState, useEffect, type FC } from "react"
import { Button, Input, Select, Grid } from "antd"
import { RefreshIcon, SpinnerIcon } from "@/components/icons/nexus"
import { Panel, SegmentedPill } from "@/components/ui"
import { type formattedFRComparisonTableData, type FRComparisonTableData, fundingRateInterval } from "@/types"
import { capitalize } from "@/utils/format"
import { getFRTableData } from "@/api/backend"
import { TableView } from "@/pages/dashboard/FundingRate/TableView"
import { useQuery } from "@tanstack/react-query"

const { Search } = Input
const { useBreakpoint } = Grid

export const FRComparison: FC = (): React.ReactElement => {
    const screens = useBreakpoint()
    const isMobile = !screens.md // or xs
    const [formattedFRData, setFormattedFRData] = useState<formattedFRComparisonTableData[]>([])
    const [viewType, setViewType] = useState<fundingRateInterval>(fundingRateInterval.Hourly)
    const [searchText, setSearchText] = useState("")

    const { data, isFetching, refetch } = useQuery({
        queryKey: ["FRComparisonData"],
        queryFn: () => getFRTableData(),
        refetchInterval: 5_000,
    })
    const FRData = data || []
    useEffect(() => {
        let fmtFRData: FRComparisonTableData[] = FRData
        if (FRData.length > 0) {
            if (viewType === fundingRateInterval.Hourly) fmtFRData = FRData
            else if (viewType === fundingRateInterval["4Hours"])
                fmtFRData = FRData.map((data) => {
                    return {
                        ...data,
                        costRate: data.costRate * 4,
                        hourly: data.hourly * 4,
                        estimatedFR: data.estimatedFR * 4,
                        estimatedProfitRatio: data.estimatedProfitRatio * 4,
                        fundingInfo: data.fundingInfo.map((FI) => {
                            return { ...FI, funding: FI.funding * 4 }
                        }),
                    }
                })
            else if (viewType === fundingRateInterval["8Hours"])
                fmtFRData = FRData.map((data) => {
                    return {
                        ...data,
                        costRate: data.costRate * 8,
                        hourly: data.hourly * 8,
                        estimatedFR: data.estimatedFR * 8,
                        estimatedProfitRatio: data.estimatedProfitRatio * 8,
                        fundingInfo: data.fundingInfo.map((FI) => {
                            return { ...FI, funding: FI.funding * 8 }
                        }),
                    }
                })
            else if (viewType === fundingRateInterval.Day)
                fmtFRData = FRData.map((data) => {
                    return {
                        ...data,
                        costRate: data.costRate * 24,
                        hourly: data.hourly * 24,
                        estimatedFR: data.estimatedFR * 24,
                        estimatedProfitRatio: data.estimatedProfitRatio * 24,
                        fundingInfo: data.fundingInfo.map((FI) => {
                            return { ...FI, funding: FI.funding * 24 }
                        }),
                    }
                })
            else if (viewType === fundingRateInterval.Week)
                fmtFRData = FRData.map((data) => {
                    return {
                        ...data,
                        costRate: data.costRate * 24 * 7,
                        hourly: data.hourly * 24 * 7,
                        estimatedFR: data.estimatedFR * 24 * 7,
                        estimatedProfitRatio: data.estimatedProfitRatio * 24 * 7,
                        fundingInfo: data.fundingInfo.map((FI) => {
                            return { ...FI, funding: FI.funding * 24 * 7 }
                        }),
                    }
                })
            else if (viewType === fundingRateInterval.Year)
                fmtFRData = FRData.map((data) => {
                    return {
                        ...data,
                        costRate: data.costRate * 24 * 365,
                        hourly: data.hourly * 24 * 365,
                        estimatedFR: data.estimatedFR * 24 * 365,
                        estimatedProfitRatio: data.estimatedProfitRatio * 24 * 365,
                        fundingInfo: data.fundingInfo.map((FI) => {
                            return { ...FI, funding: FI.funding * 24 * 365 }
                        }),
                    }
                })
            if (searchText) {
                const regex = new RegExp(`^${searchText}*`, "gi")
                fmtFRData = fmtFRData.filter((data) => data.symbol.search(regex) !== -1)
            }
        }
        const fmtFRDataBySymbol: formattedFRComparisonTableData[] = []
        for (const data of fmtFRData) {
            const index = fmtFRDataBySymbol.findIndex((finalData) => finalData.symbol === data.symbol)
            const { symbol, ..._ } = data

            let updatedItem: formattedFRComparisonTableData
            if (index !== -1) {
                updatedItem = { ...fmtFRDataBySymbol[index], pair: [...fmtFRDataBySymbol[index].pair, _] }

                // Update back into the array
                fmtFRDataBySymbol[index] = updatedItem
            } else {
                updatedItem = {
                    key: `FRDataKey${fmtFRDataBySymbol.length}`,
                    symbol,
                    pair: [_],
                }
                fmtFRDataBySymbol.push(updatedItem)
            }
        }

        setFormattedFRData(fmtFRDataBySymbol)
    }, [FRData, viewType, searchText])

    const viewTypeOnChange = (value: fundingRateInterval) => {
        setViewType(value)
    }

    return (
        <Panel label="Funding-rate comparison">
            <div className="flex flex-col gap-4">
                <div className="flex flex-nowrap justify-between gap-2" style={{ width: "100%" }}>
                    {isMobile ? (
                        <Select
                            options={Object.values(fundingRateInterval).map((s) => ({ label: capitalize(s), value: s }))}
                            defaultValue={viewType}
                            onChange={viewTypeOnChange}
                            value={viewType}
                            size="small"
                        />
                    ) : (
                        <SegmentedPill
                            ariaLabel="Funding interval"
                            options={Object.values(fundingRateInterval).map((v) => ({ label: capitalize(v), value: v }))}
                            onChange={viewTypeOnChange}
                            value={viewType}
                        />
                    )}
                    <div className="flex justify-end gap-2" style={{ width: "100%" }}>
                        <Button
                            icon={isFetching ? <SpinnerIcon size={14} className="animate-spin" /> : <RefreshIcon size={14} />}
                            type="text"
                            // type="link"
                            onClick={() => refetch()}
                        />
                        <Search
                            placeholder="Search by coin..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                            enterButton
                            style={{ minWidth: "5em", maxWidth: "15em" }}
                        />
                    </div>
                </div>
                <TableView FRData={formattedFRData} viewType={viewType} isFetching={isFetching} />
            </div>
        </Panel>
    )
}
