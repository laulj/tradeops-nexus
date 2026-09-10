import { useMemo, type FC } from "react"
import { Empty } from "antd"
import { tradeTypes } from "@/types"
import { formatDollarClean } from "@/utils/format"

interface CoinProfitTableProps {
    data: { [key in tradeTypes]: { symbol: string; value: number }[] }
    isDarkTheme: boolean
}

// Coin-level profit breakdown rendered in the mock's mono list language rather
// than an AntD table, so it matches the panels around it.
export const CoinProfitTable: FC<CoinProfitTableProps> = ({ data, isDarkTheme }) => {
    const rows = useMemo(() => {
        const aggregated: Record<string, number> = {}
        if (!data["spot"]) return []

        // Data is already filtered by tradeTypes, i.e. spot is adjusted and calculated when tradeTypes = total, spot, spotFuture...
        for (const item of data["spot"]) {
            if (item.value === 0) continue
            aggregated[item.symbol] = (aggregated[item.symbol] || 0) + item.value
        }

        return Object.entries(aggregated)
            .map(([symbol, value]) => ({
                symbol: symbol.toUpperCase(),
                value: Number(value.toFixed(2)),
            }))
            .sort((a, b) => b.value - a.value) // Highest profit first
    }, [data, isDarkTheme])

    if (rows.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No data" />

    return (
        <div className="max-h-[350px] overflow-auto pr-1 " style={{ scrollbarWidth: "thin", scrollbarColor: `white` }}>
            <table className="w-full border-collapse ">
                <thead>
                    <tr className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                        <th className="pb-2 text-left font-normal">Coin</th>
                        <th className="pb-2 text-right font-normal">Profit (USD)</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.symbol} className="nexus-hairline">
                            <td className="py-1.5 pr-2 font-metric text-[11px] nexus-metric--neutral">{row.symbol}</td>
                            <td
                                className={`py-1.5 text-right font-metric text-[11px] tabular-nums ${
                                    row.value >= 0 ? "nexus-metric--positive" : "nexus-metric--negative"
                                }`}
                            >
                                {row.value >= 0 ? "+" : "-"}${formatDollarClean(Math.abs(row.value))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
