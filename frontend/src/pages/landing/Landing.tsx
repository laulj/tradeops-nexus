import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollToPlugin } from "gsap/ScrollToPlugin"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import { transitionTo } from "@/app/navigation"
import { tradeTypes } from "@/types"
import { DashboardMock } from "./DashboardMock"
import { ArbitrageMonitor } from "./ArbitrageMonitor"
import { ArrowUpRightIcon, MailIcon } from "@/components/icons/nexus"
import "./landing.css"

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP)

// Fixed-header height + breathing room, used when scrolling to #anchors.
const NAV_OFFSET = 72

// Real exchange list monitored by the backend (see src/type.ts EXNames).
const VENUES = ["bybit", "gate.io", "binance", "hyperliquid", "osmosis", "dydx", "injective", "bolt", "suilend"]

// Derived from the real product constants so the CTA proof strip can't drift.
const VENUE_COUNT = VENUES.length // 9 — mirrors EXNames in src/types
const TRADE_CLASS_COUNT = Object.values(tradeTypes).filter((t) => t !== tradeTypes.total).length // 3

const STATS = [
    { value: String(VENUE_COUNT), label: "venues · cex + dex" },
    { value: String(TRADE_CLASS_COUNT), label: "trade classes" },
    { value: "~5s", label: "aggregated funding refresh" },
]

export const Landing: React.FC = () => {
    const rootRef = useRef<HTMLDivElement>(null)
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24)
        window.addEventListener("scroll", onScroll, { passive: true })
        onScroll()
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    // Anchor-aware in-page scrolling: refresh pinned layout first, then scroll to
    // the true offset (accounting for the fixed header) so nav/deep links always
    // land on the target section instead of a stale position.
    useEffect(() => {
        const scrollToHash = (hash: string, smooth: boolean) => {
            const id = decodeURIComponent(hash.replace(/^#/, ""))
            if (!id) return
            if (id === "top") {
                gsap.to(window, { scrollTo: { y: 0 }, duration: smooth ? 0.5 : 0 })
                return
            }
            const target = document.getElementById(id)
            if (!target) return
            // Recompute pin spacers / trigger positions so the offset is accurate.
            ScrollTrigger.refresh()
            gsap.to(window, {
                scrollTo: { y: target, offsetY: NAV_OFFSET, autoKill: true },
                duration: smooth ? 0.6 : 0,
                ease: "power2.inOut",
            })
        }

        const onClick = (e: MouseEvent) => {
            const anchor = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
            const hash = anchor?.getAttribute("href")
            if (!anchor || !hash || hash === "#") return
            e.preventDefault()
            scrollToHash(hash, true)
            window.history.replaceState(null, "", hash)
        }
        const onHashChange = () => scrollToHash(window.location.hash, false)

        document.addEventListener("click", onClick)
        window.addEventListener("hashchange", onHashChange)
        // Deep link on first load (after fonts / pin spacers settle).
        if (window.location.hash) requestAnimationFrame(() => scrollToHash(window.location.hash, false))

        return () => {
            document.removeEventListener("click", onClick)
            window.removeEventListener("hashchange", onHashChange)
        }
    }, [])

    // Recompute ScrollTrigger positions once layout settles (webfonts, pin spacers)
    // so in-view reveals resolve to their played state and anchors land correctly.
    useEffect(() => {
        const refresh = () => ScrollTrigger.refresh()
        window.addEventListener("load", refresh)
        const timer = window.setTimeout(refresh, 400)
        return () => {
            window.removeEventListener("load", refresh)
            window.clearTimeout(timer)
        }
    }, [])

    // Hero load-in + one-time reveals for the generic [data-reveal] blocks.
    useGSAP(
        () => {
            gsap.fromTo(
                "[data-hero-stagger]",
                { y: 28, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.9, stagger: 0.12, ease: "power3.out", delay: 0.15 },
            )
            gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
                gsap.fromTo(
                    el,
                    { y: 48, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.9,
                        ease: "power2.out",
                        scrollTrigger: { trigger: el, start: "top 84%", once: true },
                    },
                )
            })
        },
        { scope: rootRef },
    )

    return (
        <div
            ref={rootRef}
            className="nexus-route-enter landing-root relative min-h-screen w-full overflow-x-clip bg-[#07080c] text-left text-zinc-200"
        >
            <LandingNav scrolled={scrolled} />
            <main>
                <Hero />
                <DashboardReveal />
                <ExchangeMarquee />
                <Features />
                <ArbitrageMonitor />
                <ClosingCta />
            </main>
            <Footer />
        </div>
    )
}

// ─── Nav ────────────────────────────────────────────────────────────────────
const LandingNav: React.FC<{ scrolled: boolean }> = ({ scrolled }) => (
    <header
        className={`fixed inset-x-0 top-0 z-40 !transition-all !duration-300 ${
            scrolled ? "!border-b border-white/10 !bg-[#07080c]/80 !backdrop-blur-xl" : "bg-transparent"
        }`}
    >
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
            <a href="#top" className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 font-metric text-sm font-semibold text-[#170f02]">
                    N
                </span>
                <span className="text-[15px] !font-semibold tracking-tight !text-zinc-100">
                    TradeOps<span className="!text-amber-200/80"> Nexus</span>
                </span>
            </a>

            <nav className="ml-8 hidden items-center gap-7 md:flex">
                <a href="#demo" className="font-metric text-[11px] uppercase tracking-[0.18em] !text-zinc-400 transition-colors hover:text-zinc-100">
                    Console
                </a>
                <a
                    href="#platform"
                    className="font-metric text-[11px] uppercase tracking-[0.18em] !text-zinc-400 transition-colors hover:text-zinc-100"
                >
                    Platform
                </a>
                <a
                    href="#arbitrage"
                    className="font-metric text-[11px] uppercase tracking-[0.18em] !text-zinc-400 transition-colors hover:text-zinc-100"
                >
                    Arbitrage
                </a>
                <a
                    href="#get-started"
                    className="font-metric text-[11px] uppercase tracking-[0.18em] !text-zinc-400 transition-colors hover:text-zinc-100"
                >
                    Get started
                </a>
            </nav>

            <div className="ml-auto flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => transitionTo("/login")}
                    className="hidden rounded-full border border-white/15 px-4 py-2 font-metric text-[11px] uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-white/30 hover:text-white sm:block"
                >
                    Sign in
                </button>
                <button
                    type="button"
                    onClick={() => transitionTo("/login?demo=1")}
                    className="rounded-full bg-gradient-to-b from-amber-200 to-amber-500 px-4 py-2 font-metric text-[11px] font-semibold uppercase tracking-[0.14em] text-[#170f02] shadow-[0_8px_30px_-8px_rgba(245,199,99,0.6)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
                >
                    Launch demo
                </button>
            </div>
        </div>
    </header>
)

// ─── Hero ───────────────────────────────────────────────────────────────────
const Hero: React.FC = () => {
    const heroRef = useRef<HTMLDivElement>(null)
    const orbRef = useRef<HTMLDivElement>(null)

    const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const hero = heroRef.current
        const orb = orbRef.current
        if (!hero || !orb) return
        const rect = hero.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        orb.style.opacity = "1"
        orb.style.transform = `translate3d(${x - 210}px, ${y - 210}px, 0)`
    }

    return (
        <section
            id="top"
            ref={heroRef}
            onMouseMove={onMouseMove}
            onMouseLeave={() => {
                if (orbRef.current) orbRef.current.style.opacity = "0"
            }}
            className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-36"
        >
            {/* Atmosphere */}
            <div className="pointer-events-none absolute inset-0">
                <div className="landing-grid absolute inset-0" />
                <div className="landing-orb-a absolute -top-40 left-[8%] h-[34rem] w-[34rem] rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="landing-orb-b absolute right-[4%] top-24 h-[30rem] w-[30rem] rounded-full bg-violet-600/20 blur-3xl" />
                <div
                    ref={orbRef}
                    className="landing-cursor-orb opacity-0"
                    style={{
                        background: "radial-gradient(circle, rgba(245,199,99,0.14) 0%, rgba(245,199,99,0) 65%)",
                    }}
                />
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07080c]" />
            </div>

            <div className="relative z-10 mx-auto max-w-5xl text-center">
                <div
                    data-hero-stagger
                    className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 backdrop-blur-md"
                >
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="landing-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </span>
                    <span className="font-metric text-[11px] uppercase tracking-[0.2em] text-zinc-300">Live demo — sample portfolio preloaded</span>
                </div>

                <h1
                    data-hero-stagger
                    className="font-display mx-auto mt-8 text-[clamp(3.1rem,7.4vw,7.6rem)] leading-[0.98] tracking-[-0.01em] text-zinc-50"
                >
                    <span className="block">From scattered tabs to</span>
                    <span className="font-display-italic text-shimmer mt-1 block">one commanding view.</span>
                </h1>

                <p data-hero-stagger className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-zinc-400 md:text-lg">
                    TradeOps Nexus consolidates spot, perpetual-futures, and funding-rate PnL from nine venues and every wallet you run — then turns
                    it into live charts, spread tables, and totals you can act on.
                </p>
            </div>

            <div className="relative z-10 mt-16 flex flex-col items-center gap-2">
                <span className="font-metric text-[1em] uppercase tracking-[0.28em] text-zinc-600">Scroll</span>
                <span className="relative block h-15 w-[0.13em] overflow-hidden bg-white/10">
                    <span className="landing-scroll-dot absolute left-0 top-0 h-3 w-[0.13em] !bg-amber-200/90" />
                </span>
            </div>
        </section>
    )
}

// ─── Pinned dashboard reveal ────────────────────────────────────────────────
export const DashboardReveal: React.FC = () => {
    const triggerRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useGSAP(
        () => {
            if (!triggerRef.current || !containerRef.current) return

            // Clear any previous instances (HMR / remount).
            ScrollTrigger.getById("dashboard-pin")?.kill(true)
            ScrollTrigger.getById("dashboard-reveal")?.kill(true)

            // 1. Pin the console for one viewport of scroll (pin only — the reveal is
            //    decoupled below so anchor jumps can never leave it hidden).
            ScrollTrigger.create({
                id: "dashboard-pin",
                trigger: triggerRef.current,
                start: "top top",
                end: "+=100%",
                pin: containerRef.current,
                pinType: "fixed", // Perfect viewport sticking configuration
                anticipatePin: 1,
                invalidateOnRefresh: true,
                toggleActions: "play none none none",
            })

            // 2. Reveal independently: fires while the section is still entering view
            //    (earlier) and never reverses (never animates out), so arriving via a
            //    header-offset anchor jump shows the console immediately and keeps it.
            gsap.timeline({
                defaults: { ease: "power2.out" },
                scrollTrigger: {
                    id: "dashboard-reveal",
                    trigger: triggerRef.current,
                    start: "top 85%",
                    once: true,
                    invalidateOnRefresh: true,
                },
            })
                .fromTo("[data-reveal-copy]", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7 }, 0.1)
                .fromTo(
                    "[data-reveal-frame]",
                    { y: 120, scale: 0.8, rotateX: 18, opacity: 0 },
                    { y: 0, scale: 1, rotateX: 0, opacity: 1, duration: 1.15, ease: "power3.out" },
                    0.2,
                )
        },
        {
            scope: triggerRef,
            dependencies: [],
        },
    )

    useLayoutEffect(() => {
        return () => {
            ScrollTrigger.getById("dashboard-pin")?.kill(true)
            ScrollTrigger.getById("dashboard-reveal")?.kill(true)
            ScrollTrigger.refresh()
        }
    }, [])

    return (
        /* 
           REMOVED 'landing-perspective' class here.
           Keeping this wrapper flat and normal allows GSAP to handle layout math seamlessly.
        */
        <section id="demo" ref={triggerRef} className="relative h-[200vh]">
            <div ref={containerRef} className="w-full h-screen bg-[#07080c] flex flex-col items-center justify-center overflow-hidden px-6">
                <div className="landing-grid pointer-events-none absolute inset-0 opacity-60" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-700/15 blur-3xl" />

                <p data-reveal-copy className="font-metric !text-[11px] uppercase !tracking-[0.24em] !text-amber-200/70 pb-2">
                    The console
                </p>
                <h2 data-reveal-copy className="font-display mt-3 text-center text-[clamp(2.4rem,5vw,4.6rem)] leading-none text-zinc-50">
                    One deck. <span className="font-display-italic text-shimmer">Every signal.</span>
                </h2>

                {/* 
                   ISOLATED PERSPECTIVE STAGE:
                   Applying the 1600px perspective directly to a container around the mock 
                   ensures the 3D rotation looks beautiful without breaking the scroll engine.
                */}
                <div className="mt-10 w-full max-w-5xl" style={{ perspective: "1600px", transformStyle: "preserve-3d" }}>
                    <div data-reveal-frame className="w-full">
                        <DashboardMock />
                    </div>
                </div>
            </div>
        </section>
    )
}

// ─── Venue ticker ───────────────────────────────────────────────────────────
const ExchangeMarquee: React.FC = () => {
    const items = [...VENUES, ...VENUES]
    return (
        <div className="relative overflow-hidden border-y border-white/[0.07] bg-white/[0.015] py-5" aria-hidden>
            <div className="landing-marquee-track flex w-max items-center">
                {items.map((venue, i) => (
                    <span key={`${venue}-${i}`} className="flex items-center">
                        <span className="font-metric px-8 text-[12px] uppercase tracking-[0.22em] text-zinc-500">{venue}</span>
                        <span className="text-[9px] text-amber-200/40">◆</span>
                    </span>
                ))}
            </div>
        </div>
    )
}

// ─── Features ───────────────────────────────────────────────────────────────
const FEATURES = [
    {
        title: "Per-venue PnL, live",
        body: "Spot and perpetual positions stream into one running total per address and symbol — balance, open PnL, and realized profit without tab-hopping.",
        meta: "tracks bybit · gate · binance · hyperliquid …",
        glyph: "▲",
    },
    {
        title: "Funding-rate spread desk",
        body: "Compare the funding your position pays or earns across CEX and DEX perp venues, so rate shifts read as opportunities rather than surprises.",
        meta: "perp basis · 8h epochs · cex vs dex",
        glyph: "∿",
    },
    {
        title: "Aggregated profit analytics",
        body: "Roll intraday tick data into daily, weekly, and monthly totals; slice by exchange, symbol, or wallet; export the table when reporting time hits.",
        meta: "range intraday → monthly · csv export",
        glyph: "Σ",
    },
]

const Features: React.FC = () => (
    <section id="platform" className="relative py-28 md:py-40">
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="mx-auto max-w-7xl px-6">
            <p data-reveal className="font-metric text-[11px] uppercase tracking-[0.24em] text-amber-200/70">
                The platform
            </p>
            <h2 data-reveal className="font-display mt-4 max-w-3xl text-[clamp(2.2rem,4.6vw,4.4rem)] leading-[1.02] text-zinc-50">
                Built for people who run money <span className="font-display-italic text-shimmer">across venues.</span>
            </h2>

            <div className="mt-16 grid gap-5 md:grid-cols-3">
                {FEATURES.map((f) => (
                    <article
                        key={f.title}
                        data-reveal
                        className="landing-glass group relative rounded-2xl p-8 transition-colors duration-300 hover:border-white/20"
                    >
                        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-200/[0.06] blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] font-metric text-lg text-amber-200">
                            {f.glyph}
                        </span>
                        <h3 className="font-display mt-6 text-2xl text-zinc-100">{f.title}</h3>
                        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{f.body}</p>
                        <p className="mt-8 border-t border-white/10 pt-4 font-metric text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                            {f.meta}
                        </p>
                    </article>
                ))}
            </div>
        </div>
    </section>
)

// ─── Closing CTA ────────────────────────────────────────────────────────────
const ClosingCta: React.FC = () => (
    <section id="get-started" className="relative overflow-hidden py-32 md:py-44">
        <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[38rem] w-[70rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/[0.06] blur-3xl" />
            <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-indigo-600/15 blur-3xl" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl px-6 !text-center">
            <h2 data-reveal className="font-display text-[clamp(2.6rem,5.6vw,5.4rem)] leading-[1.02] text-zinc-50">
                Ready for <span className="font-display-italic text-shimmer">one clear view?</span>
            </h2>
            <p data-reveal className="font-metric mx-auto mt-6 max-w-xl justify-self-center !text-[1.3em] !text-zinc-400">
                Spin up the demo with a single click — the account is preloaded with sample data so the charts are alive before you finish your
                coffee.
            </p>
            <div data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={() => transitionTo("/login?demo=1")}
                    className="rounded-full bg-gradient-to-b from-amber-200 to-amber-500 px-8 py-3.5 text-sm font-semibold text-[#170f02] shadow-[0_18px_50px_-12px_rgba(245,199,99,0.55)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
                >
                    Launch the live demo
                </button>
                <button
                    type="button"
                    onClick={() => transitionTo("/login?register=1")}
                    className="rounded-full border border-white/15 bg-white/[0.03] px-8 py-3.5 text-sm font-medium text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/[0.07]"
                >
                    Create an account
                </button>
            </div>

            <ul
                data-reveal
                className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-metric text-[11px] uppercase tracking-[0.16em] text-zinc-500"
            >
                {STATS.map((s) => (
                    <li key={s.label} className="flex items-center gap-2">
                        <span className="text-amber-200/80">{s.value}</span>
                        <span>{s.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    </section>
)

// ─── Footer ─────────────────────────────────────────────────────────────────
// Footer contact
const CONTACT = {
    email: "lok.jing.lau.80@gmail.com", //
    socials: [
        { label: "LinkedIn", href: "https://www.linkedin.com/in/laulj80/" },
        { label: "GitHub", href: "https://github.com/laulj" },
        { label: "Portfolio", href: "" }, // future — hidden while empty
    ],
}

const FOOTER_LINKS = [
    { label: "Console", href: "#demo" },
    { label: "Platform", href: "#platform" },
    { label: "Arbitrage", href: "#arbitrage" },
    { label: "Get started", href: "#get-started" },
]

const Footer: React.FC = () => {
    const socials = CONTACT.socials.filter((s) => s.href.trim().length > 0)

    return (
        <footer className="border-t border-white/[0.07] py-14">
            <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-3">
                {/* Brand */}
                <div>
                    <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-200 to-amber-600 font-metric text-xs font-semibold text-[#170f02]">
                            N
                        </span>
                        <span className="text-[15px] font-semibold tracking-tight text-zinc-100">
                            TradeOps<span className="text-amber-200/80"> Nexus</span>
                        </span>
                    </div>
                    <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
                        Spot, perpetual-futures and funding-rate PnL from nine venues — in one clear view.
                    </p>
                </div>

                {/* Explore (anchors, not CTAs) */}
                <nav aria-label="Footer" className="flex flex-col items-start gap-3">
                    <p className="font-metric text-[10px] uppercase tracking-[0.2em] !text-zinc-600">Explore</p>
                    {FOOTER_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="font-metric text-[11px] uppercase tracking-[0.14em] !text-zinc-500 transition-colors hover:text-zinc-200"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                {/* Contact */}
                <div className="flex flex-col items-start gap-3">
                    <p className="font-metric text-[10px] uppercase tracking-[0.2em] !text-zinc-600">Contact</p>
                    {CONTACT.email.trim() && (
                        <a
                            href={`mailto:${CONTACT.email}`}
                            className="inline-flex items-center gap-2 font-metric text-[11px] !text-zinc-400 transition-colors hover:text-zinc-100"
                        >
                            <MailIcon size={14} className="text-amber-200/70" />
                            {CONTACT.email}
                        </a>
                    )}
                    {socials.length > 0 && (
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {socials.map((s) => (
                                <a
                                    key={s.label}
                                    href={s.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group inline-flex items-center gap-1 font-metric text-[11px] uppercase tracking-[0.14em] !text-zinc-500 transition-colors hover:text-zinc-200"
                                >
                                    {s.label}
                                    <ArrowUpRightIcon
                                        size={12}
                                        className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                                    />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center justify-between gap-3 border-t border-white/[0.07] px-6 pt-6 md:flex-row">
                <p className="text-sm !text-zinc-600">TradeOps Nexus © {new Date().getFullYear()} — built for global scale.</p>
                <p className="font-metric text-[10px] uppercase tracking-[0.16em] !text-zinc-600">Demo · admin / demo123</p>
            </div>
        </footer>
    )
}
