import { useState, useEffect, type FC, useMemo, useContext } from "react"

import { Empty, Select } from "antd"
import type { MenuTheme } from "antd"
import { TradesIcon, TotalValueIcon, UpSinceIcon, UpTodayIcon } from "@/components/icons/nexus"
import type { AliasToken } from "antd/es/theme/internal"
import ReactCountUp from "react-countup"

import { tradeTypes, type balanceResponse, type profitInt } from "@/types"
import { AreaChart } from "@/pages/dashboard/AreaChart"
import { BarChart } from "@/pages/dashboard/BarChart"
import { calculateBalancesAcrossAccs, formatDollarClean, getOptions, normalizeToMs } from "@/utils/format"
import { SiderCollapseContext } from "@/app/contexts"
import { PieChartTradeType } from "@/pages/dashboard/PieChartTradeType"
import { CoinProfitTable } from "@/pages/dashboard/CoinProfitTable"
import { useBalanceQuery } from "@/hooks/useBalance"
import { MetricTile, Panel, SegmentedPill, SectionLabel } from "@/components/ui"
import { brand } from "@/app/brand"

// Safely pluck the component function regardless of how Vite packages it
const CountUp = (ReactCountUp as { default?: typeof ReactCountUp }).default ?? ReactCountUp

// Gold "$ + animated number" used across the metric tiles.
const Money: FC<{ value: number }> = ({ value }) => (
    <span>
        $ <CountUp start={0} end={parseFloat((value || 0).toFixed(0))} />
    </span>
)

export const Dashboard: FC<{
    theme: MenuTheme
    globalToken: AliasToken
    addresses: Set<string>
    activeAddress: string
    setActiveAddress: React.Dispatch<React.SetStateAction<string>>
    profitData: profitInt
    /** undefined until the count-only query lands */
    txsCount?: number
    isTxCountLoading?: boolean
    isProfitLoading?: boolean
}> = ({
    theme,
    globalToken,
    addresses,
    activeAddress,
    setActiveAddress,
    profitData,
    txsCount,
    isTxCountLoading,
    isProfitLoading,
}): React.ReactElement => {
    const { siderCollapse } = useContext(SiderCollapseContext)
    const [tradeType, setTradeType] = useState<tradeTypes>(tradeTypes.total)
    const [activeTab, setActiveTab] = useState("upSince")

    const AddressSpecificProfitData = useMemo(() => {
        return profitData?.[tradeTypes.total]["USDC"] ?? [] // Assuming USDC is the quote symbols for all trading pairs
    }, [profitData])

    const { data, isLoading: isBalanceLoading } = useBalanceQuery()

    const balances = useMemo(() => {
        const balanceDefault = data && Object.keys(data).length !== 0 ? data["USDC"] : []
        if (activeAddress === "ALL") return balanceDefault

        return balanceDefault.filter((d: balanceResponse) => d.address === activeAddress)
    }, [activeAddress, data])

    const latestBalance = useMemo(() => {
        if (!isBalanceLoading) {
            return calculateBalancesAcrossAccs(balances).amount
        }
        return 0
    }, [balances, isBalanceLoading])

    // ─── Compute per‑coin totals from address‑specific data ────────────────────
    const symbolToTotalProfit = useMemo(() => {
        const _symbolToTotalProfits: { upToday: { [symbol: string]: number }; upSince: { [symbol: string]: number } } = { upToday: {}, upSince: {} }
        const todayMidnight = new Date().setHours(0, 0, 0, 0)

        if (!profitData || !tradeType) return _symbolToTotalProfits

        const symbols = new Set(Object.keys(profitData.total))

        for (const symbol of Array.from(symbols)) {
            if (symbol.toUpperCase() === "USDC") continue // Skip USDC since it's stablecoin and base coin for each pairing
            // Initialize
            _symbolToTotalProfits.upSince[symbol] = 0
            _symbolToTotalProfits.upToday[symbol] = 0

            if (tradeType !== tradeTypes.total) {
                if (!profitData[tradeType]?.[symbol]) continue

                for (const item of profitData[tradeType][symbol]) {
                    const ts = normalizeToMs(item.timestamp)

                    if (!isNaN(ts)) {
                        _symbolToTotalProfits.upSince[symbol] += item.amount
                        if (ts >= todayMidnight) {
                            _symbolToTotalProfits.upToday[symbol] += item.amount
                        }
                    } else {
                        throw new Error(`Failed to parse ${item.timestamp}`)
                    }
                }
            } else {
                if (profitData.spot[symbol])
                    for (const item of profitData.spot[symbol]) {
                        const ts = normalizeToMs(item.timestamp)
                        if (!isNaN(ts)) {
                            _symbolToTotalProfits.upSince[symbol] += item.amount
                            if (ts >= todayMidnight) {
                                _symbolToTotalProfits.upToday[symbol] += item.amount
                            }
                        } else throw new Error(`Failed to parse ${item.timestamp}`)
                    }

                if (profitData.spotFuture[symbol]) {
                    for (const itemSF of profitData.spotFuture["USDC"]) {
                        if (itemSF.baseSymbol?.toUpperCase() !== symbol.toUpperCase()) continue

                        const ts = normalizeToMs(itemSF.timestamp)

                        if (!isNaN(ts)) {
                            _symbolToTotalProfits.upSince[symbol] += itemSF.amount
                            if (ts >= todayMidnight) {
                                _symbolToTotalProfits.upToday[symbol] += itemSF.amount
                            }
                        } else throw new Error(`Failed to parse ${itemSF.timestamp}`)
                    }
                }

                if (profitData.fundingRate[symbol]) {
                    for (const itemFR of profitData.fundingRate[symbol]) {
                        if (itemFR.baseSymbol?.toUpperCase() !== symbol.toUpperCase()) continue
                        const ts = normalizeToMs(itemFR.timestamp)

                        if (!isNaN(ts)) {
                            _symbolToTotalProfits.upSince[symbol] += itemFR.amount
                            if (ts >= todayMidnight) {
                                _symbolToTotalProfits.upToday[symbol] += itemFR.amount
                            }
                        } else throw new Error(`Failed to parse ${itemFR.timestamp}`)
                    }
                }
            }
        }
        return _symbolToTotalProfits
    }, [profitData, tradeType])

    // ─── Compute overall upToday / upSince from the global ProfitData ────────
    const totalMetrics = useMemo(() => {
        if (!profitData || (profitData["spot"] && !profitData.spot["USDC"])) {
            return {
                [tradeTypes.total]: { upToday: 0, upSince: 0 },
                [tradeTypes.spot]: { upToday: 0, upSince: 0 },
                [tradeTypes.spotFuture]: { upToday: 0, upSince: 0 },
                [tradeTypes.fundingRate]: { upToday: 0, upSince: 0 },
            }
        }

        const todayMidnight = new Date().setHours(0, 0, 0, 0)
        const upToday: {
            [k in tradeTypes]: number
        } = { [tradeTypes.total]: 0, [tradeTypes.spot]: 0, [tradeTypes.spotFuture]: 0, [tradeTypes.fundingRate]: 0 }
        const upSince: {
            [k in tradeTypes]: number
        } = { [tradeTypes.total]: 0, [tradeTypes.spot]: 0, [tradeTypes.spotFuture]: 0, [tradeTypes.fundingRate]: 0 }

        for (const item of profitData.spot["USDC"]) {
            const ts = normalizeToMs(item.timestamp)
            if (!isNaN(ts)) {
                upSince.total += item.amount
                upSince.spot += item.amount
                if (ts >= todayMidnight) {
                    upToday.total += item.amount
                    upToday.spot += item.amount
                }
            }
        }
        for (const item of profitData.spotFuture["USDC"]) {
            const ts = normalizeToMs(item.timestamp)
            if (!isNaN(ts)) {
                upSince.total += item.amount
                upSince.spotFuture += item.amount
                if (ts >= todayMidnight) {
                    upToday.spotFuture += item.amount
                    upToday.total += item.amount
                }
            }
        }
        for (const item of profitData.fundingRate["USDC"]) {
            const ts = normalizeToMs(item.timestamp)
            if (!isNaN(ts)) {
                upSince.total += item.amount
                upSince.fundingRate += item.amount
                if (ts >= todayMidnight) {
                    upToday.fundingRate += item.amount
                    upToday.total += item.amount
                }
            }
        }

        const totalProfit = {
            upToday: upToday.spot + upToday.spotFuture + upToday.fundingRate,
            upSince: upSince.spot + upSince.spotFuture + upSince.fundingRate,
        }

        return {
            [tradeTypes.total]: totalProfit,
            [tradeTypes.spot]: { upToday: upToday.spot, upSince: upSince.spot },
            [tradeTypes.spotFuture]: { upToday: upToday.spotFuture, upSince: upSince.spotFuture },
            [tradeTypes.fundingRate]: { upToday: upToday.fundingRate, upSince: upSince.fundingRate },
        }
    }, [profitData])

    const viewTypeOnChange = (e: string) => {
        setActiveTab(e)
        setTradeType(tradeTypes.total) //Reset when changing tab
    }

    // For triggering ant/plot resize when side collapse and reopen
    useEffect(() => {
        let frameId: number
        const startTime = performance.now()
        const duration = 200 // slightly longer than ant design sider animation duration (200ms)

        const triggerResizeLoop = (now: number) => {
            window.dispatchEvent(new Event("resize"))

            if (now - startTime < duration) {
                frameId = requestAnimationFrame(triggerResizeLoop)
            }
        }

        // Start continuous layout matching loop
        frameId = requestAnimationFrame(triggerResizeLoop)

        return () => cancelAnimationFrame(frameId)
    }, [siderCollapse]) // Fires smoothly every time sidebar moves

    // "Today" / "All time" window driving the coin table + trade-mix pie.
    const activeSlice: "upToday" | "upSince" = activeTab === "upSince" ? "upSince" : "upToday"

    const pieData = [
        { type: tradeTypes.spot, value: Number(totalMetrics.spot[activeSlice].toFixed(0)) },
        { type: tradeTypes.spotFuture, value: Number(totalMetrics.spotFuture[activeSlice].toFixed(0)) },
        { type: tradeTypes.fundingRate, value: Number(totalMetrics.fundingRate[activeSlice].toFixed(0)) },
    ].filter((item) => item.value > 0)

    const coinTableData = Object.keys(symbolToTotalProfit[activeSlice]).map((symbol) => ({
        symbol,
        value: symbolToTotalProfit[activeSlice][symbol],
    }))

    const windowTotal = totalMetrics[tradeTypes.total][activeSlice]

    return (
        <div className="flex flex-col gap-3 text-left sm:gap-4">
            {/* ── Metric tiles ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <MetricTile
                    label="Total value"
                    value={<Money value={latestBalance} />}
                    sub="across all wallets"
                    tone="gold"
                    loading={isBalanceLoading}
                    icon={<TotalValueIcon size={16} style={{ color: brand.gold }} />}
                />
                <MetricTile
                    label="Up since"
                    value={<Money value={totalMetrics[tradeTypes.total].upSince} />}
                    sub="all-time realised"
                    tone="positive"
                    loading={isProfitLoading}
                    icon={<UpSinceIcon size={16} style={{ color: brand.positive }} />}
                />
                <MetricTile
                    label="Up today"
                    value={<Money value={totalMetrics[tradeTypes.total].upToday} />}
                    sub="since 00:00"
                    tone="positive"
                    loading={isProfitLoading}
                    icon={<UpTodayIcon size={16} style={{ color: brand.positive }} />}
                />
                <MetricTile
                    label="Total tx."
                    value={<CountUp start={0} end={txsCount ?? 0} />}
                    sub="recorded fills"
                    tone="neutral"
                    loading={isTxCountLoading}
                    icon={<TradesIcon size={16} style={{ color: brand.indigo }} />}
                />
            </div>

            {/* ── Cumulative profit + per-coin breakdown ───────────────────── */}
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-12">
                <Panel
                    className="lg:col-span-7"
                    label="Cumulative profit"
                    right={
                        <span className="font-metric text-[11px] nexus-metric--positive">
                            +${formatDollarClean(totalMetrics[tradeTypes.total].upSince)}
                        </span>
                    }
                >
                    <BarChart theme={theme} globalToken={globalToken} data={profitData?.[tradeTypes.total]?.["USDC"] ?? []} />
                </Panel>

                <Panel
                    className="lg:col-span-5"
                    label="By coin"
                    right={
                        <SegmentedPill
                            ariaLabel="Profit window"
                            value={activeTab}
                            onChange={viewTypeOnChange}
                            options={[
                                { value: "upToday", label: "Today" },
                                { value: "upSince", label: "All time" },
                            ]}
                        />
                    }
                >
                    <div className="mb-2 flex items-baseline justify-between">
                        <span className="font-metric text-[12px] uppercase tracking-[0.16em] text-zinc-500">Net</span>
                        <span
                            className={`font-metric text-[12px] tabular-nums pe-2 ${windowTotal >= 0 ? "nexus-metric--positive" : "nexus-metric--negative"}`}
                        >
                            {windowTotal >= 0 ? "+" : "-"}${formatDollarClean(Math.abs(windowTotal))}
                        </span>
                    </div>
                    <CoinProfitTable
                        data={{
                            [tradeTypes.total]: [], // not used here
                            [tradeTypes.spot]: coinTableData,
                            [tradeTypes.spotFuture]: [], // not used here
                            [tradeTypes.fundingRate]: [], // not used here
                        }}
                        isDarkTheme={theme === "dark"}
                    />
                </Panel>
            </div>

            {/* ── Trade mix ────────────────────────────────────────────────── */}
            <Panel label="Trade mix — by desk">
                {pieData.length > 0 ? (
                    <PieChartTradeType theme={theme} globalToken={globalToken} setTradeType={setTradeType} data={pieData} />
                ) : (
                    <div className="grid h-[350px] place-items-center">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />
                    </div>
                )}
            </Panel>

            {/* ── Per-address breakdown ────────────────────────────────────── */}
            <Panel
                label={`Address — ${activeAddress === "ALL" ? "all wallets" : activeAddress.slice(0, 12) + "…"}`}
                right={
                    <Select
                        aria-label="Address"
                        value={activeAddress}
                        size="small"
                        style={{ minWidth: 160 }}
                        options={getOptions(["ALL", ...Array.from(addresses)])}
                        onChange={(e) => setActiveAddress(e)}
                    />
                }
            >
                {activeAddress && balances && profitData ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div className="nexus-tile rounded-lg p-3">
                            <SectionLabel className="mb-2">Profits</SectionLabel>
                            <BarChart theme={theme} globalToken={globalToken} data={AddressSpecificProfitData} />
                        </div>
                        <div className="nexus-tile rounded-lg p-3">
                            <SectionLabel className="mb-2">Balance</SectionLabel>
                            <AreaChart theme={theme} globalToken={globalToken} activeAddress={activeAddress} />
                        </div>
                    </div>
                ) : (
                    <div className="grid h-[200px] place-items-center">
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No address data" />
                    </div>
                )}
            </Panel>
        </div>
    )
}
