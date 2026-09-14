import { useState } from "react"
import type { ReactNode, SetStateAction } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App as AntdApp } from "antd"
import type { MenuTheme } from "antd"
import { LoginView } from "@/pages/login/LoginView"
import { ThemeContext, UserContext } from "@/app/contexts"
import { createPlaygroundSession, login, register, type AuthResponse } from "@/api/auth"
import { queryClient } from "@/app/queryClient"

const LAST_USER_KEY = "tradeopsNexus.lastUser"

vi.mock("@/app/queryClient", () => ({
    queryClient: { clear: vi.fn() },
}))

// The real app/contexts module only defines the contexts (no heavy deps), so we
// render LoginView inside real ThemeContext/UserContext providers (see
// renderLoginView below). Only the network-facing auth helper is mocked.
vi.mock("@/api/auth", () => ({
    login: vi.fn(),
    register: vi.fn(),
    createPlaygroundSession: vi.fn(),
    keepPlaygroundSession: vi.fn(),
    getUsernameFromToken: vi.fn(() => null),
}))

const mockedLogin = vi.mocked(login)
const mockedRegister = vi.mocked(register)
const mockedPlayground = vi.mocked(createPlaygroundSession)

// Typed fixtures matching the api/auth.ts AuthResponse contract.
const okAuth = (accessToken: string, username?: string): AuthResponse => ({ ok: true, accessToken, username })
const failAuth = (status: number, message: string): AuthResponse => ({ ok: false, status, message })

const usernameInput = () => screen.getByPlaceholderText("Username")
const passwordInput = () => screen.getByPlaceholderText("Password")
const confirmInput = () => screen.getByPlaceholderText("Confirm Password")
const loginButton = () => screen.getByRole("button", { name: /log in/i })
const createAccountButton = () => screen.getByRole("button", { name: /create account/i })
const playgroundButton = () => screen.getByRole("button", { name: /start playground session/i })
const sampleDataCheckbox = () => screen.getByRole("checkbox")

// Register mode defaults to a temporary playground session (the sample-data
// checkbox is on), which hides the credential fields. Switching it off reveals
// the permanent-account form.
const switchToRegister = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByText("Create an account"))
    await user.click(sampleDataCheckbox())
}

// Renders LoginView inside stateful context providers so that setTheme /
// setIsLogin / setUser actually re-render the component (e.g. the theme switch
// visually flips), while the spies let us assert what was dispatched. AntdApp is
// required because LoginView reports failures via App.useApp() notifications.
const renderLoginView = (options: { theme?: MenuTheme } = {}) => {
    const setThemeSpy = vi.fn()
    const setIsLoginSpy = vi.fn()
    const setUserSpy = vi.fn()

    const Wrapper = ({ children }: { children: ReactNode }) => {
        const [theme, setThemeState] = useState<MenuTheme>(options.theme ?? "light")
        const [isLogin, setIsLoginState] = useState(false)
        const [user, setUserState] = useState<string | null>(null)

        const setTheme = (value: SetStateAction<MenuTheme>) => {
            setThemeSpy(value)
            setThemeState(value)
        }
        const setIsLogin = (value: SetStateAction<boolean>) => {
            setIsLoginSpy(value)
            setIsLoginState(value)
        }
        const setUser = (value: SetStateAction<string | null>) => {
            setUserSpy(value)
            setUserState(value)
        }

        return (
            <ThemeContext.Provider value={{ theme, setTheme }}>
                <UserContext.Provider value={{ isLogin, setIsLogin, user, setUser }}>
                    <AntdApp>{children}</AntdApp>
                </UserContext.Provider>
            </ThemeContext.Provider>
        )
    }

    render(<LoginView />, { wrapper: Wrapper })

    return { setThemeSpy, setIsLoginSpy, setUserSpy }
}

// Resets the URL used by LoginView's search-parameter handling (?demo=1 etc).
const setSearch = (search: string) => window.history.replaceState({}, "", search)

describe("LoginView", () => {
    beforeEach(() => {
        mockedLogin.mockReset()
        mockedRegister.mockReset()
        vi.mocked(queryClient.clear).mockReset()
        setSearch("/login")
    })

    it("renders the branding panel, login form, and demo quick-fill hint", () => {
        renderLoginView()

        // Left branding panel
        expect(screen.getByText("TradeOps Nexus")).toBeInTheDocument()
        expect(screen.getByText("Smarter Strategy Monitoring")).toBeInTheDocument()
        expect(screen.getByText("Track your spot, perpetual futures, and funding rate profits all in one place.")).toBeInTheDocument()
        expect(screen.getByText("Real‑time dashboard with key metrics")).toBeInTheDocument()
        expect(screen.getByText("Interactive charts for profit & balance")).toBeInTheDocument()
        expect(screen.getByText("Multi‑exchange & multi‑symbol support")).toBeInTheDocument()

        // Right login form
        expect(screen.getByText("Welcome Back")).toBeInTheDocument()
        expect(screen.getByText("Sign in to access your portfolio")).toBeInTheDocument()
        expect(usernameInput()).toBeInTheDocument()
        expect(passwordInput()).toBeInTheDocument()
        expect(loginButton()).toBeInTheDocument()
        expect(screen.getByRole("switch")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /try demo: userDemo \/ demo123/i })).toBeInTheDocument()
        expect(screen.getByText("Create an account")).toBeInTheDocument()
    })

    it("starts with an empty, demo-neutral form by default", () => {
        renderLoginView()

        expect(usernameInput()).toHaveValue("")
        expect(passwordInput()).toHaveValue("")
    })

    it("pre-fills the demo credentials when arriving via ?demo=1", () => {
        setSearch("/login?demo=1")
        renderLoginView()

        expect(usernameInput()).toHaveValue("userDemo")
        expect(passwordInput()).toHaveValue("demo123")
    })

    it("pre-fills the remembered username (never the password) after a remount", () => {
        localStorage.setItem(LAST_USER_KEY, "alice")
        renderLoginView()

        expect(usernameInput()).toHaveValue("alice")
        expect(passwordInput()).toHaveValue("")
    })

    it("shows required-field validation messages and does not call login", async () => {
        const user = userEvent.setup()
        renderLoginView()

        await user.click(loginButton())

        expect(await screen.findByText("Please enter your username")).toBeInTheDocument()
        expect(screen.getByText("Please enter your password")).toBeInTheDocument()
        expect(mockedLogin).not.toHaveBeenCalled()
    })

    it("logs the user in and stores the access token on success", async () => {
        const user = userEvent.setup()
        const { setIsLoginSpy, setUserSpy } = renderLoginView()
        mockedLogin.mockResolvedValue(okAuth("test-token"))

        // One-click demo fill replaces the old always-prefilled demo credentials.
        await user.click(screen.getByRole("button", { name: /try demo: userDemo \/ demo123/i }))
        await user.click(loginButton())

        await waitFor(() => {
            expect(mockedLogin).toHaveBeenCalledWith("userDemo", "demo123")
            expect(setIsLoginSpy).toHaveBeenCalledWith(true)
            expect(setUserSpy).toHaveBeenCalledWith("userDemo")
        })
        // The React Query cache must be cleared so a previous account's data is
        // never shown to the newly logged-in user.
        expect(queryClient.clear).toHaveBeenCalled()
        expect(localStorage.getItem("accessToken")).toBe("test-token")
    })

    it("passes the values typed by the user to login", async () => {
        const user = userEvent.setup()
        renderLoginView()
        mockedLogin.mockResolvedValue(failAuth(400, "Incorrect password"))

        await user.type(usernameInput(), "alice")
        await user.type(passwordInput(), "s3cret")

        await user.click(loginButton())

        await waitFor(() => {
            expect(mockedLogin).toHaveBeenCalledWith("alice", "s3cret")
        })
    })

    it("keeps the user logged out when login returns no access token", async () => {
        const user = userEvent.setup()
        const { setIsLoginSpy, setUserSpy } = renderLoginView()
        mockedLogin.mockResolvedValue(failAuth(400, "Incorrect password"))

        await user.type(usernameInput(), "alice")
        await user.type(passwordInput(), "s3cret")
        await user.click(loginButton())

        await waitFor(() => {
            expect(setIsLoginSpy).toHaveBeenCalledWith(false)
            expect(setUserSpy).toHaveBeenCalledWith(null)
        })
        expect(localStorage.getItem("accessToken")).toBeNull()
        // A failed login must not wipe the cache of the currently logged-in user.
        expect(queryClient.clear).not.toHaveBeenCalled()
    })

    it("keeps the user logged out when the login response lacks an accessToken", async () => {
        const user = userEvent.setup()
        const { setIsLoginSpy, setUserSpy } = renderLoginView()
        mockedLogin.mockResolvedValue(failAuth(400, "Sign-in failed — check your username and password."))

        await user.type(usernameInput(), "alice")
        await user.type(passwordInput(), "s3cret")
        await user.click(loginButton())

        await waitFor(() => {
            expect(setIsLoginSpy).toHaveBeenCalledWith(false)
            expect(setUserSpy).toHaveBeenCalledWith(null)
        })
        expect(localStorage.getItem("accessToken")).toBeNull()
    })

    it("shows the backend error for an unknown account and keeps the typed credentials", async () => {
        const user = userEvent.setup()
        const { setIsLoginSpy, setUserSpy } = renderLoginView()
        mockedLogin.mockResolvedValue({ ok: false, status: 401, message: "No account found for this username" })

        await user.type(usernameInput(), "ghost")
        await user.type(passwordInput(), "s3cret")
        await user.click(loginButton())

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.some((el) => el.textContent?.includes("No account found for this username"))).toBe(true)

        // Regression: a failed sign-in must NOT bounce the form back to the
        // shared admin/demo123 demo credentials or wipe what the user typed.
        expect(usernameInput()).toHaveValue("ghost")
        expect(passwordInput()).toHaveValue("s3cret")
        expect(localStorage.getItem(LAST_USER_KEY)).toBe("ghost")
        expect(localStorage.getItem("accessToken")).toBeNull()

        await waitFor(() => {
            expect(setIsLoginSpy).toHaveBeenCalledWith(false)
            expect(setUserSpy).toHaveBeenCalledWith(null)
        })
        expect(mockedLogin).toHaveBeenCalledWith("ghost", "s3cret")
    })

    it("shows the backend error for an incorrect password", async () => {
        const user = userEvent.setup()
        renderLoginView()
        mockedLogin.mockResolvedValue({ ok: false, status: 400, message: "Incorrect password" })

        await user.type(usernameInput(), "alice")
        await user.type(passwordInput(), "wrongpw")
        await user.click(loginButton())

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.some((el) => el.textContent?.includes("Incorrect password"))).toBe(true)
        expect(passwordInput()).toHaveValue("wrongpw")
    })

    it("surfaces a duplicate-username error during registration", async () => {
        const user = userEvent.setup()
        renderLoginView()
        mockedRegister.mockResolvedValue({ ok: false, status: 409, message: "Username already exists" })

        await switchToRegister(user)
        await user.clear(usernameInput())
        await user.type(usernameInput(), "alice")
        await user.type(passwordInput(), "s3cret")
        await user.type(confirmInput(), "s3cret")
        await user.click(createAccountButton())

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.some((el) => el.textContent?.includes("Username already exists"))).toBe(true)
        expect(mockedRegister).toHaveBeenCalledWith("alice", "s3cret", false)
    })

    it("switches the theme from light to dark", async () => {
        const user = userEvent.setup()
        const { setThemeSpy } = renderLoginView({ theme: "light" })

        await user.click(screen.getByRole("switch"))

        await waitFor(() => expect(setThemeSpy).toHaveBeenCalledWith("dark"))
        expect(document.body.classList.contains("dark-theme")).toBe(true)
        expect(document.body.classList.contains("light")).toBe(false)
        expect(localStorage.getItem("theme")).toBe("dark")
        expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
    })

    it("switches the theme from dark to light", async () => {
        const user = userEvent.setup()
        const { setThemeSpy } = renderLoginView({ theme: "dark" })

        await user.click(screen.getByRole("switch"))

        await waitFor(() => expect(setThemeSpy).toHaveBeenCalledWith("light"))
        expect(document.body.classList.contains("light")).toBe(true)
        expect(document.body.classList.contains("dark-theme")).toBe(false)
        expect(localStorage.getItem("theme")).toBe("light")
        expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")
    })

    it("creates a permanent account when the sample-data option is off", async () => {
        const user = userEvent.setup()
        const { setIsLoginSpy, setUserSpy } = renderLoginView()
        mockedRegister.mockResolvedValue(okAuth("reg-token", "alice"))

        await switchToRegister(user)

        // Permanent-account mode: unique subtitle, credential fields, submit button.
        expect(screen.getByText("Create an account to track your own portfolio")).toBeInTheDocument()
        expect(screen.queryByText("Welcome Back")).not.toBeInTheDocument()
        expect(screen.getByPlaceholderText("Confirm Password")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument()

        await user.clear(usernameInput())
        await user.type(usernameInput(), "alice")
        await user.clear(passwordInput())
        await user.type(passwordInput(), "s3cret")
        await user.type(screen.getByPlaceholderText("Confirm Password"), "s3cret")

        await user.click(screen.getByRole("button", { name: /create account/i }))

        await waitFor(() => {
            expect(mockedRegister).toHaveBeenCalledWith("alice", "s3cret", false)
            expect(mockedLogin).not.toHaveBeenCalled()
            expect(setIsLoginSpy).toHaveBeenCalledWith(true)
            expect(setUserSpy).toHaveBeenCalledWith("alice")
        })
        expect(queryClient.clear).toHaveBeenCalled()
        expect(localStorage.getItem("accessToken")).toBe("reg-token")
    })

    it("starts in register mode when arriving via ?register=1", () => {
        setSearch("/login?register=1")
        renderLoginView()

        expect(screen.getByText("Create an account to track your own portfolio")).toBeInTheDocument()
        expect(screen.queryByText("Welcome Back")).not.toBeInTheDocument()
        // The default is a temporary playground session, so there is nothing to type.
        expect(playgroundButton()).toBeInTheDocument()
        expect(screen.queryByPlaceholderText("Confirm Password")).not.toBeInTheDocument()
    })

    it("registers a permanent account when the sample-data option is turned off", async () => {
        const user = userEvent.setup()
        renderLoginView()
        mockedRegister.mockResolvedValue(failAuth(400, "Couldn’t create your account. Please try again."))

        await user.click(screen.getByText("Create an account"))
        expect(screen.getByText("Explore with sample data in a temporary session")).toBeInTheDocument()
        await user.click(screen.getByRole("checkbox"))
        await user.clear(usernameInput())
        await user.type(usernameInput(), "alice")
        await user.clear(passwordInput())
        await user.type(passwordInput(), "s3cret")
        await user.type(screen.getByPlaceholderText("Confirm Password"), "s3cret")

        await user.click(screen.getByRole("button", { name: /create account/i }))

        await waitFor(() => {
            expect(mockedRegister).toHaveBeenCalledWith("alice", "s3cret", false)
            expect(mockedPlayground).not.toHaveBeenCalled()
        })
    })

    it("requires the confirm password to match the password", async () => {
        const user = userEvent.setup()
        renderLoginView()
        mockedRegister.mockResolvedValue(failAuth(400, "Couldn’t create your account. Please try again."))

        await switchToRegister(user)
        await user.clear(passwordInput())
        await user.type(passwordInput(), "s3cret")
        await user.type(screen.getByPlaceholderText("Confirm Password"), "d1fferent")

        await user.click(screen.getByRole("button", { name: /create account/i }))

        expect(await screen.findByText("Passwords do not match")).toBeInTheDocument()
        expect(mockedRegister).not.toHaveBeenCalled()
    })

    it("starts a temporary playground session without asking for credentials", async () => {
        const user = userEvent.setup()
        const { setIsLoginSpy, setUserSpy } = renderLoginView()
        const expiresAt = Date.now() + 10 * 60 * 1000
        mockedPlayground.mockResolvedValue({ ok: true, accessToken: "guest-token", username: "guest_abc123", expiresAt })

        await user.click(screen.getByText("Create an account"))
        await user.click(playgroundButton())

        await waitFor(() => {
            expect(mockedPlayground).toHaveBeenCalled()
            expect(setIsLoginSpy).toHaveBeenCalledWith(true)
            expect(setUserSpy).toHaveBeenCalledWith("guest_abc123")
        })
        expect(mockedRegister).not.toHaveBeenCalled()
        expect(localStorage.getItem("accessToken")).toBe("guest-token")
        // The deadline drives the countdown banner, so it has to be persisted.
        expect(localStorage.getItem("tradeopsNexus.sessionExpiresAt")).toBe(String(expiresAt))
        expect(queryClient.clear).toHaveBeenCalled()
    })

    it("shows the credential fields only when the sample-data option is off", async () => {
        const user = userEvent.setup()
        renderLoginView()

        await user.click(screen.getByText("Create an account"))
        expect(playgroundButton()).toBeInTheDocument()
        expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument()

        await user.click(sampleDataCheckbox())

        expect(screen.getByPlaceholderText("Username")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: /start playground session/i })).not.toBeInTheDocument()
        expect(createAccountButton()).toBeInTheDocument()
    })

    it("surfaces why the playground could not start", async () => {
        const user = userEvent.setup()
        renderLoginView()
        mockedPlayground.mockResolvedValue({
            ok: false,
            status: 503,
            message: "The playground is at capacity right now — sign in with userDemo instead",
        })

        await user.click(screen.getByText("Create an account"))
        await user.click(playgroundButton())

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.some((el) => el.textContent?.includes("at capacity"))).toBe(true)
        expect(localStorage.getItem("accessToken")).toBeNull()
    })
})
