import React, { type FC, useContext, useState, useEffect, useMemo } from "react"
import { App, Button, Drawer, Grid, Layout, Menu, Spin, Switch } from "antd"
import type { MenuProps } from "antd"
import {
    BalanceIcon,
    FundingRateIcon,
    LogoutIcon,
    MenuIcon,
    MoonIcon,
    OverviewIcon,
    PositionIcon,
    ProfitIcon,
    SunIcon,
    SystemIcon,
    UsersIcon,
} from "@/components/icons/nexus"
import { lazy, Suspense } from "react"
import type { AliasToken } from "antd/es/theme/internal"

import { logout } from "@/api/auth"
import { transitionTo } from "@/app/navigation"
import { ThemeContext, UserContext, SiderCollapseContext } from "@/app/contexts"
import { queryClient } from "@/app/queryClient"
import { tradeTypes, views, type profitInt } from "@/types"
import { useSymbolQuery } from "@/hooks/useSymbols"
import { useAddressesQuery } from "@/hooks/useAddresses"
import { Dashboard } from "@/pages/dashboard"
import { useProfitQuery, useTxCountQuery } from "@/hooks/useProfits"
import { LiveDot, SectionLabel } from "@/components/ui"
import { applyThemeMode, persistThemeMode } from "@/app/themeMode"
import { readSessionExpiry } from "@/app/sessionExpiry"
import { PlaygroundBanner } from "@/layout/PlaygroundBanner"
const Profit = lazy(() => import("@/pages/profit").then((mod) => ({ default: mod.Profit })))
const Setting = lazy(() => import("@/pages/settings").then((mod) => ({ default: mod.Setting })))
const Balance = lazy(() => import("@/pages/balance/Balance").then((mod) => ({ default: mod.Balance })))
const FRComparison = lazy(() => import("@/pages/dashboard/FundingRate").then((mod) => ({ default: mod.FRComparison })))
const OpenPositions = lazy(() => import("@/pages/positions/Position").then((mod) => ({ default: mod.OpenPositions })))
const AdminUsers = lazy(() => import("@/pages/admin/Users").then((mod) => ({ default: mod.AdminUsers })))

const { useBreakpoint } = Grid

const { Header, Footer, Sider, Content } = Layout
const contentStyle: React.CSSProperties = {
    minHeight: 120,
    padding: "1em",
}

const footerStyle: React.CSSProperties = {
    textAlign: "center",
}

const layoutStyle = {
    minHeight: "100vh",
}
type MenuItem = Required<MenuProps>["items"][number]

function getItem(label: React.ReactNode, key?: React.Key | null, icon?: React.ReactNode, children?: MenuItem[], type?: "group"): MenuItem {
    return {
        key,
        icon,
        children,
        label,
        type,
        className: "text-start",
    } as MenuItem
}

export const AppShell: FC<{
    globalToken: AliasToken
}> = ({ globalToken }): React.ReactElement => {
    const siderCollapseStatus = "siderCollapseStatus"
    const { notification, modal } = App.useApp()
    // Check if we are on a mobile-sized viewport (below 'md')
    const screens = useBreakpoint()
    const isMobile = !screens.md

    useEffect(() => {
        return () => localStorage.removeItem(siderCollapseStatus)
    }, [])
    const { data: addressesData, isLoading: isAddressesLoading } = useAddressesQuery()
    const addresses = new Set(addressesData ?? [])

    const { theme, setTheme } = useContext(ThemeContext)
    const [siderCollapse, setSiderCollapse] = useState(localStorage.getItem(siderCollapseStatus) === "true" ? true : false)
    const [currentMenu, setCurrentMenu] = useState("1")
    // Phone navigation drawer (the rail is not rendered below md).
    const [navOpen, setNavOpen] = useState(false)

    const { setIsLogin, user } = useContext(UserContext)

    // Flat, grouped navigation — matches the landing console: group headers with
    // micro-labels instead of collapsible submenus.
    const menuItems = useMemo<MenuItem[]>(() => {
        // Phones get larger glyphs: the navigation lives in a Drawer there, so 20px
        // icons cost no content width and clear the 44px touch-target guidance.
        const glyphSize = isMobile ? 20 : 16
        const settingsChildren: MenuItem[] = [getItem("System", "8", <SystemIcon size={glyphSize} />)]
        if (user === "admin") settingsChildren.push(getItem("Users", "9", <UsersIcon size={glyphSize} />))

        return [
            getItem("Overview", "group-overview", undefined, [getItem("Dashboard", "1", <OverviewIcon size={glyphSize} />)], "group"),
            getItem(
                "Data",
                "group-data",
                undefined,
                [
                    getItem("FundingRate", "4", <FundingRateIcon size={glyphSize} />),
                    getItem("Position", "5", <PositionIcon size={glyphSize} />),
                    getItem("Profit", "6", <ProfitIcon size={glyphSize} />),
                    getItem("Balance", "7", <BalanceIcon size={glyphSize} />),
                ],
                "group",
            ),
            getItem("Settings", "group-settings", undefined, settingsChildren, "group"),
        ]
    }, [user, isMobile])
    const performLogOut = async () => {
        const ok = await logout()
        // Drop all cached queries so the next account never sees this user's data.
        queryClient.clear()
        setIsLogin(false)

        if (ok) {
            notification.success({
                title: "Logged out successfully.",
                description: "You have been signed out of TradeOps Nexus.",
                duration: 3,
            })
        } else {
            notification.error({
                title: "Logout failed",
                description: "The session token could not be revoked. Clearing it locally.",
                duration: 4,
            })
        }
        // Return guests to the sign-in screen (landing page lives at "/").
        transitionTo("/login")
    }

    const onLogOut = async () => {
        const expiresAt = readSessionExpiry()
        if (expiresAt !== null && expiresAt > Date.now()) {
            // Signing out deletes a playground session, so say so rather than
            // discarding someone's sample data on a stray click.
            modal.confirm({
                title: "Discard this temporary session?",
                content:
                    'Signing out deletes the playground account and its sample data. Use "Keep this account" first if you want to keep it.',
                okText: "Sign out",
                cancelText: "Stay",
                onOk: () => performLogOut(),
            })
            return
        }
        await performLogOut()
    }

    const [activeKey, setActiveKey] = useState<string>("USDC")
    const [activeKey2, setActiveKey2] = useState<string>("ALL")
    const [activeAddress, setActiveAddress] = useState<string>("ALL")
    // Fetch Unique Symbols
    const uniqueSymQuery = {
        [tradeTypes.spot]: useSymbolQuery(tradeTypes.spot),
        [tradeTypes.spotFuture]: useSymbolQuery(tradeTypes.spotFuture),
        [tradeTypes.fundingRate]: useSymbolQuery(tradeTypes.fundingRate),
    }

    const isSymbolsReady = uniqueSymQuery.spot.isSuccess && uniqueSymQuery.spotFuture.isSuccess && uniqueSymQuery.fundingRate.isSuccess

    const { data, isLoading, isFetching } = useProfitQuery(
        // No `!` on the symbol lists here: they really are undefined until the symbol
        // queries resolve, and the hooks are written to cope with an empty/partial set.
        {
            [tradeTypes.spot]: uniqueSymQuery.spot.data,
            [tradeTypes.spotFuture]: uniqueSymQuery.spotFuture.data,
            [tradeTypes.fundingRate]: uniqueSymQuery.fundingRate.data,
        },
        activeAddress,
        views.Daily,
        isSymbolsReady,
    )
    // The "Total tx." tile needs one number, so it asks for the count only: the
    // endpoints answer from their COUNT(*) and skip the detail rows entirely.
    const { data: txsCount, isLoading: isTxCountLoading } = useTxCountQuery(
        {
            [tradeTypes.spot]: ["ALL"],
            [tradeTypes.spotFuture]: ["ALL"],
            [tradeTypes.fundingRate]: ["ALL"],
        },
        activeAddress,
        isSymbolsReady,
    )

    // Only the dashboard renders the aggregated profit series, so only the dashboard
    // waits for it — every other route mounts and loads its own data straight away.
    const isDashboardDataLoading = isLoading || isFetching
    const isRouteReady = !isSymbolsReady || isAddressesLoading || (currentMenu === "1" && isDashboardDataLoading)

    const headerStyle: React.CSSProperties = {
        height: 80,
        color: globalToken.colorTextBase,
        backgroundColor: globalToken.colorBgContainer,
    }

    const changeTheme = (value: boolean) => {
        const mode = value ? "dark" : "light"
        applyThemeMode(mode)
        persistThemeMode(mode)
        setTheme(mode)
    }
    const menuOnClick: MenuProps["onClick"] = (e: { key: string }) => setCurrentMenu(e.key)

    const getContent = () => {
        if (currentMenu === "4") return <FRComparison />
        else if (currentMenu === "5") return <OpenPositions />
        else if (currentMenu === "6")
            return (
                <Profit
                    activeKey={activeKey}
                    setActiveKey={setActiveKey}
                    activeKey2={activeKey2}
                    setActiveKey2={setActiveKey2}
                    addresses={addresses}
                />
            )
        else if (currentMenu === "7")
            return (
                <Balance
                    activeKey={activeKey}
                    setActiveKey={setActiveKey}
                    addresses={addresses}
                    activeAddress={activeAddress}
                    setActiveAddress={setActiveAddress}
                />
            )
        else if (currentMenu === "8") return <Setting theme={theme} globalToken={globalToken} addresses={addresses} />
        else if (currentMenu === "9") return <AdminUsers />
        else
            return (
                //currentMenu === "1"
                <Dashboard
                    theme={theme}
                    globalToken={globalToken}
                    addresses={addresses}
                    activeAddress={activeAddress}
                    setActiveAddress={setActiveAddress}
                    profitData={data as profitInt}
                    txsCount={txsCount}
                    isTxCountLoading={isTxCountLoading}
                    isProfitLoading={isDashboardDataLoading}
                />
            )
    }

    // Shared navigation body: the desktop rail renders it compact (icons only), the
    // phone Drawer renders it full width. Same Menu, same handlers, no duplication.
    const siderBody = (compact: boolean): React.ReactElement => (
        <div className="nexus-sider-inner">
            {/* <div className="" style={{ border: "solid 1px red" }}> */}
            <div className="nexus-sider-top w-full flex flex-row justify-between items-center">
                {/* <div className="flex"> */}
                {!compact && <span className="font-metric text-[10px] uppercase tracking-[0.24em] text-zinc-500">console</span>}
                {/* </div> */}
                {/* <div className="flex"> */}
                <Switch
                    checked={theme === "dark"}
                    onChange={changeTheme}
                    checkedChildren={<MoonIcon size={12} className="pe-1" style={{ color: "oklch(94.5% 0.129 101.54)" }} />}
                    unCheckedChildren={<SunIcon size={12} className="ps-1" style={{ color: "oklch(62.3% 0.214 259.815)" }} />}
                    className={theme === "dark" ? "!bg-gold-600" : "!bg-blue-200"}
                />
                {/* </div> */}
            </div>
            {/* </div> */}

            <div className="nexus-sider-nav">
                <Menu
                    theme={theme}
                    onClick={(e) => {
                        menuOnClick(e)
                        // Selecting a destination closes the phone drawer.
                        setNavOpen(false)
                    }}
                    selectedKeys={[currentMenu]}
                    mode="inline"
                    items={menuItems}
                    style={{ background: "transparent", borderInlineEnd: 0 }}
                    classNames={{
                        itemTitle: "font-metric !text-[10px] !uppercase !tracking-[0.14em]",
                        // 48px rows in the drawer (Apple's 44pt minimum).
                        ...(isMobile ? { item: "!h-12" } : {}),
                    }}
                />
                {!compact && (
                    <div className="nexus-tile flex flex-col rounded-lg p-3 mt-6 mx-2">
                        <SectionLabel>Session</SectionLabel>
                        <div className="flex flex-row items-end justify-between">
                            <div>
                                <p className="pt-1 font-metric text-[12px] text-zinc-400">{user ?? "guest"}</p>

                                <LiveDot label="live" className="mt-2" />
                            </div>
                            <Button size="medium" type="default" danger icon={<LogoutIcon size={14} />} onClick={onLogOut}></Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )

    return (
        <SiderCollapseContext.Provider value={{ siderCollapse: isMobile ? true : siderCollapse, setSiderCollapse }}>
            {/* Phones: the nav overlays instead of occupying content width, so the
                rail no longer competes with tables/charts. */}
            {isMobile && (
                <Drawer
                    placement="left"
                    open={navOpen}
                    onClose={() => setNavOpen(false)}
                    size={280}
                    closable={false}
                    styles={{ body: { padding: 0 } }}
                >
                    {siderBody(false)}
                </Drawer>
            )}
            <Layout className="nexus-shell" style={layoutStyle}>
                {!isMobile && (
                    <Sider
                        className={`nexus-sider ${siderCollapse ? "is-collapsed" : ""}`}
                        collapsedWidth={80}
                        theme={theme}
                        collapsible
                        collapsed={siderCollapse}
                        onCollapse={(value) => {
                            localStorage.setItem(siderCollapseStatus, value.toString())
                            setSiderCollapse(value)
                        }}
                    >
                        {siderBody(siderCollapse)}
                    </Sider>
                )}
                <Layout>
                    <Header className="!px-4" style={headerStyle}>
                        <div className="flex h-full w-[100%] items-center justify-between gap-3">
                            <span className="font-display text-xl leading-none sm:text-2xl" style={{ color: globalToken.colorText }}>
                                TradeOps <span className="text-shimmer">Nexus</span>
                            </span>
                            <div className="flex items-center gap-5">
                                {isMobile && (
                                    <Button
                                        size="large"
                                        type="default"
                                        aria-label="Open navigation"
                                        icon={<MenuIcon size={16} />}
                                        onClick={() => setNavOpen(true)}
                                    />
                                )}
                            </div>
                        </div>
                    </Header>

                    <Content style={{ ...contentStyle, padding: isMobile ? "0.5rem" : "1em" }}>
                        {/* Renders only for a playground session; permanent accounts see nothing. */}
                        <PlaygroundBanner />
                        <Suspense fallback={<Spin spinning={isRouteReady} fullscreen delay={200} />}>
                            <div className="!p-0">{getContent()}</div>
                        </Suspense>
                    </Content>

                    <Footer className="font-metric !text-[10px] !uppercase !tracking-[0.16em] !text-zinc-500" style={footerStyle}>
                        TradeOps Nexus © {new Date().getFullYear()} — Built for Global Scale
                    </Footer>
                </Layout>
            </Layout>
        </SiderCollapseContext.Provider>
    )
}
