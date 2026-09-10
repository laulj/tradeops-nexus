import React, { useContext, useState } from "react"
import { Alert, App, Button, Checkbox, Form, Input, Typography, Flex, Switch } from "antd"
import { LockOutlined, UserOutlined, DashboardOutlined, LineChartOutlined, DollarOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons"
import { ThemeContext, UserContext } from "@/app/contexts"
import { transitionTo } from "@/app/navigation"
import { login, register, type AuthResponse } from "@/api/auth"
import { queryClient } from "@/app/queryClient"
import { applyThemeMode, persistThemeMode } from "@/app/themeMode"

const { Title, Text } = Typography

// Remembered username (never the password). Persisting it keeps the form usable
// for real accounts across remounts while the demo credentials are only filled
// when the user explicitly asks for the demo (quick-fill / landing ?demo=1).
const LAST_USER_KEY = "tradeopsNexus.lastUser"

const fallbackError = (mode: "login" | "register"): string =>
    mode === "login" ? "Sign-in failed — check your username and password." : "Couldn’t create your account. Please try again."

interface LoginValues {
    username: string
    password: string
    confirmPassword?: string
    populateDemo?: boolean
}

export const LoginView: React.FC = () => {
    const { setIsLogin, setUser } = useContext(UserContext)
    const { theme: currentTheme, setTheme } = useContext(ThemeContext)
    const { notification } = App.useApp()
    const [form] = Form.useForm<LoginValues>()
    const [submitting, setSubmitting] = useState<boolean>(false)
    const [serverError, setServerError] = useState<string | null>(null)

    // Landing CTAs deep-link here: /login?demo=1 (demo account) and
    // /login?register=1 (jump straight to the registration form).
    const [searchParams] = useState(() => new URLSearchParams(window.location.search))
    const demoIntent = searchParams.get("demo") === "1"
    const [mode, setMode] = useState<"login" | "register">(searchParams.get("register") === "1" ? "register" : "login")
    const [initialValues] = useState(() => ({
        username: demoIntent ? "admin" : (localStorage.getItem(LAST_USER_KEY) ?? ""),
        password: demoIntent ? "demo123" : "",
    }))

    const switchMode = () => {
        setMode((current) => (current === "login" ? "register" : "login"))
        setServerError(null)
        form.resetFields()
    }

    const fillDemo = () => {
        form.setFieldsValue({ username: "admin", password: "demo123" })
        setServerError(null)
    }

    const onFinish = async (values: LoginValues) => {
        setSubmitting(true)
        setServerError(null)

        const username = values.username.trim()
        const response: AuthResponse | false =
            mode === "login" ? await login(username, values.password) : await register(username, values.password, values.populateDemo ?? false)

        if (response && typeof response === "object" && "accessToken" in response && response.accessToken) {
            // Drop any data cached by a previous account so the new user never
            // sees another account's queries (query keys are user-agnostic).
            localStorage.setItem(LAST_USER_KEY, username)
            localStorage.setItem("accessToken", response.accessToken)
            if (response.username) localStorage.setItem("username", response.username)
            queryClient.clear()
            setUser(response.username ?? username)
            setIsLogin(true)
            // Component unmounts — AppShell takes over; no further state updates.
            return
        }

        setIsLogin(false)
        setUser(null)
        setSubmitting(false)

        // Keep the attempted username so a later remount (session-expiry reload,
        // logout) never silently reverts to the shared demo credentials.
        localStorage.setItem(LAST_USER_KEY, username)

        const errorMessage =
            response && typeof response === "object" && "message" in response && typeof response.message === "string"
                ? response.message
                : fallbackError(mode)

        setServerError(errorMessage)
        notification.error({
            message: mode === "login" ? "Sign-in failed" : "Registration failed",
            description: errorMessage,
            placement: "topRight",
            duration: 6,
        })
    }

    const isDark = currentTheme === "dark"
    const changeTheme = (value: boolean) => {
        const mode = value ? "dark" : "light"
        applyThemeMode(mode)
        persistThemeMode(mode)
        setTheme(mode)
    }

    return (
        // ─── Outer Container ──────────────────────────────────────────
        <div
            className={`
                nexus-route-enter relative
                min-h-screen w-full flex items-center justify-center p-4 md:p-8
                ${isDark ? "bg-[#0b0e14]" : "bg-gray-50"}
            `}
        >
            {/* Back to the public landing page */}
            <button
                type="button"
                onClick={() => transitionTo("/")}
                className={`absolute left-5 top-5 z-20 inline-flex items-center gap-2 rounded-full px-3 py-1.5 !font-metric text-[12px] uppercase tracking-[0.16em] transition-colors ${
                    isDark ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-100" : "text-gray-500 hover:bg-black/5 hover:text-gray-800"
                }`}
            >
                <span aria-hidden>←</span>
                Back to site
            </button>

            {/* ─── Card Wrapper ──────────────────────────────────────── */}
            <div
                className={`
                    w-full max-w-6xl rounded-2xl overflow-hidden shadow-2xl
                    ${isDark ? "bg-[#1f1f1f]" : "bg-white"}
                `}
            >
                <div className="grid grid-cols-1 md:grid-cols-12 min-h-[70vh]">
                    {/* ─── Left Column: Branding ───────────────────── */}
                    <div
                        className={`relative overflow-hidden hidden md:flex md:col-span-5 lg:col-span-6 flex-col justify-center p-8 lg:p-16 ${
                            isDark ? "bg-[#0b0e14]" : "bg-gradient-to-br from-[#182744] to-[#0d1424]"
                        }`}
                    >
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute -left-16 -top-24 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl" />
                            <div className="absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-amber-300/[0.08] blur-3xl" />
                        </div>
                        <div className="relative max-w-sm mx-auto">
                            {/* Logo */}
                            <Flex align="center" gap="small" className="mb-6 ">
                                <Title level={1} className="font-display text-start m-0 pb-2 !text-5xl">
                                    <span className="text-shimmer">TradeOps Nexus</span>
                                </Title>
                            </Flex>

                            <Title level={2} className="!text-white text-start mb-4">
                                Smarter Strategy Monitoring
                            </Title>
                            <Text className="!text-white/85 !text-base text-start block mb-6 ">
                                Track your spot, perpetual futures, and funding rate profits all in one place.
                            </Text>

                            <div className="h-px w-full !bg-white/20 my-6" />

                            {/* Features */}
                            <div className="space-y-4">
                                <Feature icon={<DashboardOutlined />} text="Real‑time dashboard with key metrics" isDark={isDark} />
                                <Feature icon={<LineChartOutlined />} text="Interactive charts for profit & balance" isDark={isDark} />
                                <Feature icon={<DollarOutlined />} text="Multi‑exchange & multi‑symbol support" isDark={isDark} />
                            </div>
                        </div>
                    </div>

                    {/* ─── Right Column: Login Form ────────────────── */}
                    <div
                        className={`
                            col-span-1 md:col-span-7 lg:col-span-6
                            flex flex-col justify-center p-8 md:p-12 lg:p-16 !relative
                            ${isDark ? "bg-[#0b0e14]" : "bg-gradient-to-br from-white to-[#96a5c792]"}
                        `}
                    >
                        <Switch
                            checked={isDark}
                            onChange={changeTheme}
                            checkedChildren={<MoonOutlined className="pe-1" style={{ color: "oklch(94.5% 0.129 101.54)" }} />}
                            unCheckedChildren={<SunOutlined className="ps-1" style={{ color: "oklch(62.3% 0.214 259.815)" }} />}
                            className={`${isDark ? "!bg-gold-600" : "!bg-blue-200"} !absolute !top-5 !right-5`}
                        />
                        <div className="max-w-sm mx-auto w-full">
                            <Title level={2} className={isDark ? "text-white" : ""}>
                                {mode === "login" ? "Welcome Back" : "Create Account"}
                            </Title>
                            <Text type="secondary" className="block mb-6">
                                {mode === "login" ? "Sign in to access your portfolio" : "Create an account to track your own portfolio"}
                            </Text>

                            <Form
                                form={form}
                                name="login"
                                layout="vertical"
                                onFinish={onFinish}
                                onValuesChange={() => {
                                    if (serverError) setServerError(null)
                                }}
                                initialValues={initialValues}
                                requiredMark={false}
                            >
                                <Form.Item
                                    name="username"
                                    rules={
                                        mode === "register"
                                            ? [
                                                  { required: true, message: "Please enter your username" },
                                                  { min: 3, max: 32, message: "Username must be 3-32 characters long" },
                                                  {
                                                      pattern: /^[a-zA-Z0-9_.-]+$/,
                                                      message: "Letters, numbers, '_', '.' and '-' only",
                                                  },
                                              ]
                                            : [{ required: true, message: "Please enter your username" }]
                                    }
                                >
                                    <Input
                                        prefix={<UserOutlined className="text-gray-400" />}
                                        placeholder="Username"
                                        size="large"
                                        autoComplete="username"
                                        className={isDark ? "bg-[#2a2a2a] border-[#3a3a3a] text-white" : ""}
                                    />
                                </Form.Item>

                                <Form.Item name="password" rules={[{ required: true, message: "Please enter your password" }]}>
                                    <Input.Password
                                        prefix={<LockOutlined className="text-gray-400" />}
                                        placeholder="Password"
                                        size="large"
                                        autoComplete="current-password"
                                        className={isDark ? "bg-[#2a2a2a] border-[#3a3a3a] text-white" : ""}
                                    />
                                </Form.Item>

                                {mode === "register" && (
                                    <Form.Item
                                        name="confirmPassword"
                                        dependencies={["password"]}
                                        rules={[
                                            { required: true, message: "Please confirm your password" },
                                            ({ getFieldValue }) => ({
                                                validator(_, value) {
                                                    if (!value || getFieldValue("password") === value) return Promise.resolve()
                                                    return Promise.reject(new Error("Passwords do not match"))
                                                },
                                            }),
                                        ]}
                                    >
                                        <Input.Password
                                            prefix={<LockOutlined className="text-gray-400" />}
                                            placeholder="Confirm Password"
                                            size="large"
                                            autoComplete="new-password"
                                            className={isDark ? "bg-[#2a2a2a] border-[#3a3a3a] text-white" : ""}
                                        />
                                    </Form.Item>
                                )}

                                {mode === "register" && (
                                    <Form.Item name="populateDemo" valuePropName="checked" initialValue={true} style={{ marginBottom: 16 }}>
                                        <Checkbox className={isDark ? "text-white" : ""}>
                                            Pre-populate with sample data so you can explore the app
                                        </Checkbox>
                                    </Form.Item>
                                )}

                                {serverError && (
                                    <Alert
                                        type="error"
                                        showIcon
                                        message={serverError}
                                        closable
                                        onClose={() => setServerError(null)}
                                        className="mb-4"
                                    />
                                )}

                                <Form.Item style={{ marginBottom: 12 }}>
                                    <Button type="primary" htmlType="submit" block size="large" loading={submitting} className="mt-1">
                                        {mode === "login" ? "Log in" : "Create Account"}
                                    </Button>
                                </Form.Item>

                                <div className="flex justify-between items-center gap-3 mt-2">
                                    {mode === "login" ? (
                                        <button
                                            type="button"
                                            onClick={fillDemo}
                                            className={`text-xs underline-offset-2 hover:underline cursor-pointer p-0 bg-transparent border-0 text-start ${
                                                isDark ? "text-white/50 hover:text-white/80" : "text-gray-400 hover:text-gray-600"
                                            }`}
                                        >
                                            Try demo: admin / demo123
                                        </button>
                                    ) : (
                                        <Text type="secondary" className="text-xs">
                                            New users start with an empty portfolio
                                        </Text>
                                    )}
                                    <Text type="secondary" className="text-xs">
                                        <a
                                            href="#"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                switchMode()
                                            }}
                                            className="hover:underline"
                                        >
                                            {mode === "login" ? "Create an account" : "Back to log in"}
                                        </a>
                                    </Text>
                                </div>
                            </Form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Feature Item Component ──────────────────────────────────────────────
const Feature: React.FC<{ icon: React.ReactNode; text: string; isDark: boolean }> = ({ icon, text, isDark }) => (
    <Flex align="center" gap="middle">
        <div
            className={`
                w-10 h-10 rounded-full flex items-center justify-center text-xl text-white m-2
                ${isDark ? "bg-white/10" : "bg-white/20"}
            `}
        >
            {icon}
        </div>
        <Text className="!text-white text-start text-sm">{text}</Text>
    </Flex>
)
