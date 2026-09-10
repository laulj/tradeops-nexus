import React from "react"

// Hand-built visual stand-in for the TradeOps Nexus dashboard. Pure divs + SVG so
// the landing page needs no live backend and stays lightweight.
export const DashboardMock: React.FC<{ className?: string }> = ({ className }) => {
    const pnl = [8, 13, 11, 21, 19, 27, 24, 36, 33, 44, 52, 48, 61, 74, 69, 86, 92, 99, 108, 117]
    const w = 640
    const h = 230
    const step = w / (pnl.length - 1)
    const min = Math.min(...pnl)
    const max = Math.max(...pnl)
    const span = max - min || 1
    const points = pnl.map((v, i) => `${(i * step).toFixed(1)},${(h - 16 - ((v - min) / span) * (h - 40)).toFixed(1)}`)
    const line = points.join(" ")
    const area = `0,${h} ${line} ${w},${h}`

    const fundingRows = [
        { symbol: "BTC", spot: "$67,412", perp: "0.0101%", spread: "+0.02%" },
        { symbol: "ETH", spot: "$3,521", perp: "0.0134%", spread: "-0.01%" },
        { symbol: "SOL", spot: "$172.8", perp: "-0.004%", spread: "+0.03%" },
    ]

    const nav = ["Overview", "Funding rate", "Positions", "Profit", "Balance"]

    return (
        <div
            className={`landing-glass w-full max-w-5xl rounded-2xl overflow-hidden text-left ${className ?? ""}`}
            aria-hidden
        >
            {/* Title bar */}
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <p className="font-metric text-[10px] text-zinc-400 tracking-wide">TradeOps Nexus — live console</p>
                <div className="ml-auto flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="landing-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    <span className="font-metric text-[10px] uppercase tracking-[0.18em] text-emerald-300">live</span>
                </div>
            </div>

            <div className="grid grid-cols-12">
                {/* Sidebar */}
                <div className="col-span-3 hidden border-r border-white/10 px-3 py-4 sm:block">
                    <ul className="space-y-1">
                        {nav.map((label, i) => (
                            <li
                                key={label}
                                className={`rounded-md px-2.5 py-1.5 font-metric text-[10px] uppercase tracking-[0.14em] ${
                                    i === 0 ? "bg-white/10 text-white" : "text-zinc-500"
                                }`}
                            >
                                {label}
                            </li>
                        ))}
                    </ul>
                    <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <p className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">Session</p>
                        <p className="mt-1 font-metric text-[11px] text-zinc-200">admin · demo wallet</p>
                        <p className="font-metric text-[10px] text-emerald-300">uptime 24h 00m</p>
                    </div>
                </div>

                {/* Main panel */}
                <div className="col-span-12 px-4 py-4 sm:col-span-9">
                    {/* Metric tiles */}
                    <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <p className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">Total PnL</p>
                            <p className="mt-1 font-metric text-sm text-emerald-300">+$48,192</p>
                            <p className="font-metric text-[10px] text-emerald-400/70">+14.3%</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <p className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">Open positions</p>
                            <p className="mt-1 font-metric text-sm text-zinc-100">14</p>
                            <p className="font-metric text-[10px] text-zinc-500">spot · perp</p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <p className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">Wallet balance</p>
                            <p className="mt-1 font-metric text-sm text-zinc-100">$204,110</p>
                            <p className="font-metric text-[10px] text-zinc-500">across 9 venues</p>
                        </div>
                    </div>

                    {/* Chart + funding table */}
                    <div className="mt-2.5 grid grid-cols-12 gap-2.5">
                        <div className="col-span-12 rounded-lg border border-white/10 bg-white/[0.02] p-3 lg:col-span-7">
                            <div className="flex items-center justify-between">
                                <p className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">Cumulative profit — 30d</p>
                                <p className="font-metric text-[10px] text-emerald-300">+$48.19k</p>
                            </div>
                            <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-auto w-full">
                                <defs>
                                    <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
                                        <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                {[0.25, 0.5, 0.75].map((p) => (
                                    <line
                                        key={p}
                                        x1="0"
                                        x2={w}
                                        y1={h * p}
                                        y2={h * p}
                                        stroke="rgba(255,255,255,0.05)"
                                        strokeWidth="1"
                                    />
                                ))}
                                <polygon points={area} fill="url(#pnlFill)" />
                                <polyline
                                    points={line}
                                    fill="none"
                                    stroke="#34d399"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <circle
                                    cx={w - step}
                                    cy={Number(points[points.length - 1].split(",")[1])}
                                    r="4"
                                    fill="#0b0e14"
                                    stroke="#34d399"
                                    strokeWidth="2"
                                />
                            </svg>
                        </div>
                        <div className="col-span-12 rounded-lg border border-white/10 bg-white/[0.02] p-3 lg:col-span-5">
                            <p className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">Funding-rate spread</p>
                            <table className="mt-2 w-full border-collapse">
                                <thead>
                                    <tr className="font-metric text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                                        <th className="pb-1.5 text-left font-normal">Symbol</th>
                                        <th className="pb-1.5 text-right font-normal">Spot</th>
                                        <th className="pb-1.5 text-right font-normal">Perp FR</th>
                                        <th className="pb-1.5 text-right font-normal">Edge</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fundingRows.map((r) => (
                                        <tr key={r.symbol} className="border-t border-white/5 font-metric text-[11px]">
                                            <td className="py-2 text-zinc-200">{r.symbol}</td>
                                            <td className="py-2 text-right text-zinc-400">{r.spot}</td>
                                            <td className="py-2 text-right text-zinc-300">{r.perp}</td>
                                            <td className="py-2 text-right text-emerald-300">{r.spread}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
