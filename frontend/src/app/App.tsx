import { lazy, Suspense, useEffect, useState } from "react"
import { ConfigProvider, Spin, theme as Theme, App as AntdApp, type GetProp, type ConfigProviderProps, type MenuTheme, type ThemeConfig } from "antd"
import { LoginView } from "@/pages/login/LoginView"
import { getUsernameFromToken } from "@/api/auth"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { ThemeContext, UserContext } from "./contexts"
import { queryClient } from "./queryClient"
import { createThemeConfig } from "./theme"
import { getCurrentPath, isLoginPath } from "./navigation"
import { applyThemeMode, resolveThemeMode } from "./themeMode"
import "@/App.css"

type WaveConfig = GetProp<ConfigProviderProps, "wave">

// React Query Devtools are opt-in: never in production builds, and in development
// only when VITE_ENABLE_QUERY_DEVTOOLS=true (see frontend/.env.example).
const showQueryDevtools = import.meta.env.DEV && import.meta.env.VITE_ENABLE_QUERY_DEVTOOLS === "true"

// The authenticated app shell (sider, menu, antv charts, aggregate queries) is
// heavy — only load it after the user logs in so the login screen stays light.
const AppShell = lazy(() => import("@/layout/AppShell").then((m) => ({ default: m.AppShell })))

// Public marketing landing page — shown at "/" while signed out (LoginView
// lives at "/login"). Also lazy: it pulls in GSAP/ScrollTrigger only for guests.
const Landing = lazy(() => import("@/pages/landing/Landing").then((m) => ({ default: m.Landing })))

export const App = () => {
    const [theme, setTheme] = useState<MenuTheme>(() => resolveThemeMode())
    const [isFetched, setIsFetched] = useState<boolean>(false)
    const [isLogin, setIsLogin] = useState<boolean>(false)
    // Restore the username persisted at login time while the mount effect
    // re-validates the token below.
    const [user, setUser] = useState<string | null>(() => localStorage.getItem("username"))
    // Public route while signed out: "/" shows the landing page, "/login" the form.
    const [path, setPath] = useState<string>(() => getCurrentPath())

    useEffect(() => {
        localStorage.removeItem("siderCollapseStatus")

        // Apply the resolved theme (stored choice wins over the OS preference).
        // index.html already did this pre-paint; this keeps React and the DOM in sync.
        applyThemeMode(resolveThemeMode())

        // Follow the OS *only* while the user hasn't made an explicit choice — a
        // saved "light"/"dark" must never be overridden by the OS preference.
        const darkThemeMq = window.matchMedia("(prefers-color-scheme: dark)")
        const mqListener = (e: MediaQueryListEvent) => {
            let stored: string | null = null
            try {
                stored = localStorage.getItem("theme")
            } catch {
                // localStorage unavailable — treat as "no explicit choice" (follow OS).
            }
            if (stored === "light" || stored === "dark") return

            const mode = e.matches ? "dark" : "light"
            applyThemeMode(mode)
            setTheme(mode)
        }
        darkThemeMq.addEventListener("change", mqListener)
        ;(async () => {
            const token = localStorage.getItem("accessToken")
            if (token) {
                // Multi-user: derive the account name from the JWT's `sub` claim
                // instead of hardcoding "admin". Falls back to the username
                // persisted at login time if the token cannot be decoded.
                setIsLogin(true)
                setUser(getUsernameFromToken(token) ?? localStorage.getItem("username"))
            } else {
                setIsLogin(false)
                setUser(null)
            }

            setIsFetched(true)
        })()
        return () => darkThemeMq.removeEventListener("change", mqListener)
    }, [])

    useEffect(() => {
        const onPopState = () => setPath(getCurrentPath())
        window.addEventListener("popstate", onPopState)
        return () => window.removeEventListener("popstate", onPopState)
    }, [])

    const { getDesignToken } = Theme
    const themeConfig: ThemeConfig = createThemeConfig(theme)
    const globalToken = getDesignToken(themeConfig)

    // Stay in sync when the token is cleared outside this tab. A same-tab logout
    // clears it through UserContext, and a 401 triggers api/client's reload, so the
    // listener only covers the remaining case — and posting the state update from a
    // callback rather than straight in the effect body avoids a cascading render.
    useEffect(() => {
        const onStorage = () => {
            if (!localStorage.getItem("accessToken")) setIsLogin(false)
        }
        window.addEventListener("storage", onStorage)
        return () => window.removeEventListener("storage", onStorage)
    }, [])
    useEffect(() => {
        if (isLogin) {
            if (user) localStorage.setItem("username", user)
        }
    }, [isLogin])

    const Wrapper = ({ ...wave }: WaveConfig & { name: string }) => (
        <QueryClientProvider client={queryClient}>
            {showQueryDevtools && <ReactQueryDevtools initialIsOpen={false} />}
            <ConfigProvider theme={themeConfig} wave={wave}>
                <AntdApp>
                    <div
                        style={{
                            backgroundColor: globalToken.colorBgContainer,
                            color: globalToken.colorText,
                            minHeight: "100vh",
                        }}
                    >
                        <ThemeContext.Provider value={{ theme, setTheme }}>
                            <UserContext.Provider value={{ isLogin, setIsLogin, user, setUser }}>
                                {isFetched && isLogin ? (
                                    <Suspense
                                        fallback={
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    minHeight: "100vh",
                                                }}
                                            >
                                                <Spin size="large" />
                                            </div>
                                        }
                                    >
                                        <AppShell globalToken={globalToken} />
                                    </Suspense>
                                ) : isLoginPath(path) ? (
                                    <LoginView />
                                ) : (
                                    <Suspense
                                        fallback={
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "center",
                                                    alignItems: "center",
                                                    minHeight: "100vh",
                                                }}
                                            >
                                                <Spin size="large" />
                                            </div>
                                        }
                                    >
                                        <Landing />
                                    </Suspense>
                                )}
                            </UserContext.Provider>
                        </ThemeContext.Provider>
                    </div>
                </AntdApp>
            </ConfigProvider>
        </QueryClientProvider>
    )
    return (
        <Wrapper
            name="Shake"
            // showEffect={showShakeEffect}
        />
    )
}
