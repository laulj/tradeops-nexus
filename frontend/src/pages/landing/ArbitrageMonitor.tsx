import React, { useState } from "react"
import { transitionTo } from "@/app/navigation"
import { Sparkline } from "./Sparkline"
import { basisDesk, FUNDING_SYMBOLS, fundingDesk, MODEL_ROUND_TRIP_FEE, type FundingRateRow, type BasisRow } from "./data/arbitrage"

type Tab = "funding" | "basis"

const annualApr = (funding: number, intervalHr: number): number => (funding * (24 * 365)) / intervalHr
const pct = (v: number, dp = 3): string => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dp)}%`
const cycleLabel = (r: FundingRateRow): string =>
    r.intervalHr >= 24 ? `every ${r.intervalHr / 24}d` : r.intervalHr === 1 ? "hourly" : `every ${r.intervalHr}h`

const Tag: React.FC<{ tone: "earn" | "pay" | "muted" | "gold" | "sky"; children: React.ReactNode }> = ({ tone, children }) => {
    const tones: Record<string, string> = {
        earn: "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20",
        pay: "bg-rose-400/10 text-rose-300 border border-rose-400/20",
        muted: "bg-white/[0.04] text-zinc-400 border border-white/10",
        gold: "bg-amber-200/10 text-amber-200 border border-amber-200/25",
        sky: "bg-sky-400/10 text-sky-300 border border-sky-400/25",
    }
    return (
        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-metric text-[9px] uppercase tracking-[0.12em] ${tones[tone]}`}>
            {children}
        </span>
    )
}

// ── Funding desk ────────────────────────────────────────────────────────────
const FundingPanel: React.FC = () => {
    const [symbol, setSymbol] = useState<(typeof FUNDING_SYMBOLS)[number]>("BTC")
    const rows = fundingDesk[symbol].map((r) => ({ ...r, apr: annualApr(r.funding, r.intervalHr) }))

    const bestLong = rows.reduce((a, b) => (b.apr > a.apr ? b : a))
    const bestShort = rows.reduce((a, b) => (b.apr < a.apr ? b : a))
    const netSpreadApr = bestLong.apr - bestShort.apr

    return (
        <div className="grid gap-5 lg:grid-cols-12">
            <div className="landing-glass rounded-2xl p-5 min-w-0 lg:col-span-8 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-metric text-[10px] uppercase tracking-[0.2em] text-zinc-500">Per-venue funding — {symbol}</p>
                    <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                        {FUNDING_SYMBOLS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setSymbol(s)}
                                className={`rounded-full px-3.5 py-1 font-metric text-[11px] transition-colors ${
                                    s === symbol
                                        ? "bg-gradient-to-b from-amber-200 to-amber-500 font-semibold text-[#170f02]"
                                        : "text-zinc-400 hover:text-zinc-100"
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse">
                        <thead>
                            <tr className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                                <th className="pb-2 text-left font-normal">Venue</th>
                                <th className="pb-2 text-left font-normal">Cycle</th>
                                <th className="pb-2 text-right font-normal">Funding / cycle</th>
                                <th className="pb-2 text-right font-normal">Δ</th>
                                <th className="pb-2 pl-4 text-left font-normal">Recent</th>
                                <th className="pb-2 text-right font-normal">Side</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const positive = r.funding >= 0
                                return (
                                    <tr key={r.venue} className="border-t border-white/[0.06]">
                                        <td className="py-3 font-metric text-[12px] text-zinc-200">{r.venue}</td>
                                        <td className="py-3 font-metric text-[11px] text-zinc-500">{cycleLabel(r)}</td>
                                        <td className={`py-3 text-right font-metric text-[12px] ${positive ? "text-rose-300" : "text-emerald-300"}`}>
                                            {pct(r.funding, 4)}
                                        </td>
                                        <td
                                            className={`py-3 text-right font-metric text-[11px] ${
                                                r.delta >= 0 ? "text-emerald-300" : "text-rose-300"
                                            }`}
                                        >
                                            {r.delta >= 0 ? "▲" : "▼"}
                                        </td>
                                        <td className="py-3 pl-4">
                                            <Sparkline values={r.trend} color={positive ? "#fda4af" : "#6ee7b7"} />
                                        </td>
                                        <td className="py-3 text-right">
                                            {positive ? <Tag tone="pay">longs pay</Tag> : <Tag tone="earn">shorts pay</Tag>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="landing-glass rounded-2xl p-6 min-w-0 lg:col-span-4">
                <p className="font-metric text-[10px] uppercase tracking-[0.2em] text-amber-200/70">Window finder</p>
                <div className="mt-5 space-y-5">
                    <div>
                        <div className="flex items-center justify-between">
                            <p className="font-metric text-[11px] text-zinc-500">Best to be long</p>
                            <Tag tone={bestLong.funding >= 0 ? "earn" : "pay"}>{bestLong.funding >= 0 ? "receives" : "pays"}</Tag>
                        </div>
                        <p className="mt-1.5 font-metric text-lg text-zinc-100">{bestLong.venue}</p>
                        <p className="font-metric text-[11px] text-zinc-500">
                            {pct(bestLong.funding, 4)}/{cycleLabel(bestLong)} · ≈ {(bestLong.apr * 100).toFixed(1)}% APR
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                            <p className="font-metric text-[11px] text-zinc-500">Best to be short</p>
                            <Tag tone={bestShort.funding < 0 ? "earn" : "pay"}>{bestShort.funding < 0 ? "receives" : "pays"}</Tag>
                        </div>
                        <p className="mt-1.5 font-metric text-lg text-zinc-100">{bestShort.venue}</p>
                        <p className="font-metric text-[11px] text-zinc-500">
                            {pct(bestShort.funding, 4)}/{cycleLabel(bestShort)} · ≈ {(-bestShort.apr * 100).toFixed(1)}% APR
                        </p>
                    </div>
                    <div className="border-t border-white/10 pt-4">
                        <p className="font-metric text-[11px] text-zinc-500">Long A + short B spread</p>
                        <p className="font-display-italic text-shimmer mt-1 text-3xl">≈ {(netSpreadApr * 100).toFixed(1)}% APR</p>
                        <p className="mt-2 font-metric text-[10px] leading-relaxed text-zinc-500">
                            before modelled round-trip fees (~{MODEL_ROUND_TRIP_FEE * 100} bps). The desk only flags a window when the spread clears
                            the fees.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Basis desk ─────────────────────────────────────────────────────────────
const BasisRowView: React.FC<{ row: BasisRow }> = ({ row }) => {
    const contango = row.direction === "contango"
    const net = (Math.abs(row.basis) - row.costRate) * 100
    return (
        <tr className="border-t border-white/[0.06]">
            <td className="py-3 font-metric text-[13px] text-zinc-100">{row.symbol}</td>
            <td className="py-3 font-metric text-[11px] text-zinc-400">
                {row.spotVenue} spot ⇄ {row.perpVenue} perp
            </td>
            <td className={`py-3 text-right font-metric text-[13px] ${contango ? "text-amber-300" : "text-sky-300"}`}>{pct(row.basis, 2)}</td>
            <td className="py-3 text-left pl-4">{contango ? <Tag tone="gold">contango</Tag> : <Tag tone="sky">backwardation</Tag>}</td>
            <td className="py-3 pl-6">
                <Sparkline values={row.trend} color={contango ? "#fcd34d" : "#7dd3fc"} />
            </td>
            <td className="py-3 text-right">
                <span className={`font-metric text-[12px] ${net > 0 ? "text-emerald-300" : "text-zinc-500"}`}>
                    {net > 0 ? `+${net.toFixed(2)}%` : "below fees"}
                </span>
            </td>
        </tr>
    )
}

const BasisPanel: React.FC = () => (
    <div className="landing-glass rounded-2xl p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-metric text-[10px] uppercase tracking-[0.2em] text-zinc-500">Spot ⇄ perp basis by pair</p>
            <p className="font-metric text-[10px] text-zinc-500">basis = (perp − spot) / spot</p>
        </div>
        <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
                <thead>
                    <tr className="font-metric text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                        <th className="pb-2 text-left font-normal">Symbol</th>
                        <th className="pb-2 text-left font-normal">Pair</th>
                        <th className="pb-2 text-right font-normal">Basis</th>
                        <th className="pb-2 pl-4 text-left font-normal">State</th>
                        <th className="pb-2 pl-6 text-left font-normal">Trend</th>
                        <th className="pb-2 text-right font-normal">Net if closes</th>
                    </tr>
                </thead>
                <tbody>
                    {basisDesk.map((row) => (
                        <BasisRowView key={`${row.symbol}-${row.perpVenue}`} row={row} />
                    ))}
                </tbody>
            </table>
        </div>
        <div className="mt-5 grid gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 md:grid-cols-2">
            <p className="font-metric text-[11px] leading-relaxed text-zinc-400">
                <span className="text-amber-200">Contango</span> — the future trades above spot. Buy the spot and short the future, then close as the
                gap compresses toward expiry.
            </p>
            <p className="font-metric text-[11px] leading-relaxed text-zinc-400">
                <span className="text-sky-300">Backwardation</span> — the future trades below spot. Sell the spot and buy the future, unwinding when
                the basis normalises.
            </p>
        </div>
    </div>
)

// ── Section shell ──────────────────────────────────────────────────────────
export const ArbitrageMonitor: React.FC = () => {
    const [tab, setTab] = useState<Tab>("basis")
    return (
        <section id="arbitrage" className="relative py-28 md:py-36">
            <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            <div className="mx-auto max-w-7xl px-6">
                <div data-reveal className="flex flex-wrap items-end justify-between gap-6">
                    <div className="max-w-2xl">
                        <p className="font-metric text-[11px] uppercase tracking-[0.24em] text-amber-200/70">Arbitrage monitor</p>
                        <h2 className="font-display mt-4 text-[clamp(2.2rem,4.6vw,4.4rem)] leading-[1.02] text-zinc-50">
                            Every market gap, <span className="font-display-italic text-shimmer">priced like a trade.</span>
                        </h2>
                        <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">
                            Funding between venues, and spot-vs-future basis — compared symbol by symbol, venue by venue, and only flagged when the
                            gap clears the fees to act on it.
                        </p>
                    </div>
                    <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                        <button
                            type="button"
                            onClick={() => setTab("basis")}
                            className={`rounded-full px-5 py-2 font-metric text-[11px] uppercase tracking-[0.14em] transition-colors ${
                                tab === "basis"
                                    ? "bg-gradient-to-b from-amber-200 to-amber-500 font-semibold text-[#170f02]"
                                    : "text-zinc-400 hover:text-zinc-100"
                            }`}
                        >
                            Basis desk
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab("funding")}
                            className={`rounded-full px-5 py-2 font-metric text-[11px] uppercase tracking-[0.14em] transition-colors ${
                                tab === "funding"
                                    ? "bg-gradient-to-b from-amber-200 to-amber-500 font-semibold text-[#170f02]"
                                    : "text-zinc-400 hover:text-zinc-100"
                            }`}
                        >
                            Funding desk
                        </button>
                    </div>
                </div>

                <div data-reveal className="mt-12">
                    {/* key forces a short re-mount so the panel crossfades on tab change */}
                    <div key={tab} className="nexus-fade-in">
                        {tab === "funding" ? <FundingPanel /> : <BasisPanel />}
                    </div>
                </div>

                <div data-reveal className="mt-10 flex flex-col items-center gap-4 text-center">
                    <p className="max-w-xl font-metric text-[10px] leading-relaxed tracking-[0.08em] text-zinc-500">
                        Sample snapshot — the full monitor streams live venue data and surfaces every window that beats its fees.
                    </p>
                    <button
                        type="button"
                        onClick={() => transitionTo("/login?demo=1")}
                        className="rounded-full bg-gradient-to-b from-amber-200 to-amber-500 px-8 py-3 text-sm font-semibold text-[#170f02] shadow-[0_18px_50px_-12px_rgba(245,199,99,0.45)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
                    >
                        See the live desks in the demo
                    </button>
                </div>
            </div>
        </section>
    )
}
