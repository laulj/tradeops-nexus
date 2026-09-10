import React, { type FC, useContext, useState, useEffect, useMemo } from "react"
import { App, Button, Grid, Layout, Menu, Spin, Switch } from "antd"
import type { MenuProps } from "antd"
import {
    BalanceIcon,
    FundingRateIcon,
    LogoutIcon,
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
import { useProfitQuery } from "@/hooks/useProfits"
import { LiveDot, SectionLabel } from "@/components/ui"
import { applyThemeMode, persistThemeMode } from "@/app/themeMode"
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
    const { notification } = App.useApp()
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

    const { setIsLogin, user } = useContext(UserContext)

    // Flat, grouped navigation — matches the landing console: group headers with
    // micro-labels instead of collapsible submenus.
    const menuItems = useMemo<MenuItem[]>(() => {
        const settingsChildren: MenuItem[] = [getItem("System", "8", <SystemIcon />)]
        if (user === "admin") settingsChildren.push(getItem("Users", "9", <UsersIcon />))

        return [
            getItem("Overview", "group-overview", undefined, [getItem("Dashboard", "1", <OverviewIcon />)], "group"),
            getItem(
                "Data",
                "group-data",
                undefined,
                [
                    getItem("FundingRate", "4", <FundingRateIcon />),
                    getItem("Position", "5", <PositionIcon />),
                    getItem("Profit", "6", <ProfitIcon />),
                    getItem("Balance", "7", <BalanceIcon />),
                ],
                "group",
            ),
            getItem("Settings", "group-settings", undefined, settingsChildren, "group"),
        ]
    }, [user])
    const onLogOut = async () => {
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
        {
            [tradeTypes.spot]: uniqueSymQuery.spot.data!,
            [tradeTypes.spotFuture]: uniqueSymQuery.spotFuture.data!,
            [tradeTypes.fundingRate]: uniqueSymQuery.fundingRate.data!,
        },
        activeAddress,
        views.Daily,
        isSymbolsReady,
    )
    const profitsRaw = useProfitQuery(
        {
            [tradeTypes.spot]: ["ALL"],
            [tradeTypes.spotFuture]: ["ALL"],
            [tradeTypes.fundingRate]: ["ALL"],
        },
        activeAddress,
        views.Intraday,
        isSymbolsReady,
    )
    const txsCount = useMemo(() => profitsRaw?.data?.pagination.total, [profitsRaw.data])

    const isEverythingReady = !isSymbolsReady || isLoading || isFetching || profitsRaw.isFetched || profitsRaw.isLoading || isAddressesLoading

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
                    txsCount={txsCount || 0}
                />
            )
    }

    return (
        <SiderCollapseContext.Provider value={{ siderCollapse, setSiderCollapse }}>
            <Layout className="nexus-shell" style={layoutStyle}>
                <Sider
                    className={`nexus-sider ${siderCollapse ? "is-collapsed" : ""}`}
                    breakpoint={siderCollapse ? undefined : "md"}
                    collapsedWidth={64}
                    theme={theme}
                    collapsible={!isMobile}
                    collapsed={siderCollapse}
                    onCollapse={(value) => {
                        localStorage.setItem(siderCollapseStatus, value.toString())
                        setSiderCollapse(value)
                    }}
                >
                    <div className="nexus-sider-inner">
                        <div className="nexus-sider-top">
                            <div className="flex flex-row justify-between self-start items-center" style={{ border: "solid 0px red" }}>
                                <div className="flex">
                                    {siderCollapse ? (
                                        <></>
                                    ) : (
                                        <span className="font-metric text-[10px] uppercase tracking-[0.24em] text-zinc-500">console</span>
                                    )}
                                </div>
                                <div className="flex">
                                    <Switch
                                        checked={theme === "dark"}
                                        onChange={changeTheme}
                                        checkedChildren={<MoonIcon size={12} className="pe-1" style={{ color: "oklch(94.5% 0.129 101.54)" }} />}
                                        unCheckedChildren={<SunIcon size={12} className="ps-1" style={{ color: "oklch(62.3% 0.214 259.815)" }} />}
                                        className={theme === "dark" ? "!bg-gold-600" : "!bg-blue-200"}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="nexus-sider-nav">
                            <Menu
                                theme={theme}
                                onClick={menuOnClick}
                                selectedKeys={[currentMenu]}
                                mode="inline"
                                items={menuItems}
                                style={{ background: "transparent", borderInlineEnd: 0 }}
                                classNames={{
                                    itemTitle: "font-metric !text-[10px] !uppercase !tracking-[0.14em]",
                                }}
                            />
                            {!siderCollapse && (
                                <div className="nexus-tile rounded-lg p-3 mt-6 mx-2">
                                    <SectionLabel>Session</SectionLabel>
                                    <p className="pt-1 font-metric text-[11px] text-zinc-400">{user ?? "guest"}</p>
                                    <LiveDot label="live" className="mt-2" />
                                </div>
                            )}
                        </div>
                    </div>
                </Sider>
                <Layout>
                    <Header style={headerStyle}>
                        <div className="flex h-full items-center justify-between gap-3">
                            <span className="font-display text-xl leading-none sm:text-2xl" style={{ color: globalToken.colorText }}>
                                TradeOps <span className="text-shimmer">Nexus</span>
                            </span>
                            <div className="flex items-center gap-3">
                                <Button size="small" type="default" danger icon={<LogoutIcon size={14} />} onClick={onLogOut}></Button>
                            </div>
                        </div>
                    </Header>

                    <Content style={contentStyle}>
                        <Suspense fallback={<Spin spinning={isEverythingReady} fullscreen delay={200} />}>
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
