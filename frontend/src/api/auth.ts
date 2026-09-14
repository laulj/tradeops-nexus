import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import { baseUrl } from "@/api/backend"
import { clearSessionExpiry } from "@/app/sessionExpiry"

// Result of a POST /login | /register attempt. Success mirrors the backend JSON
// (with `ok: true`), failures carry the HTTP status plus a human-readable
// message parsed from the backend (error JSON/text) so the login form can give
// specific guidance (no account vs wrong password vs duplicate username).
export type AuthResponse =
    | { ok: true; accessToken: string; username?: string; demoPopulated?: boolean; expiresAt?: number | null }
    | { ok: false; status: number; message: string }

/** A playground session: a generated account whose data disappears with it. */
export type PlaygroundSessionResponse =
    | { ok: true; accessToken: string; username: string; expiresAt: number }
    | { ok: false; status: number; message: string }

const fallbackMessage = (endpoint: "login" | "register"): string =>
    endpoint === "login"
        ? "Sign-in failed — check your username and password."
        : "Couldn’t create your account. Please try again."

// Tries to read a friendly `{ error }` JSON message (or raw text) from a failed
// response, falling back to the caller's default message.
const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
    try {
        const contentType = response.headers.get("content-type") ?? ""
        if (contentType.includes("application/json")) {
            const data = (await response.json()) as { error?: unknown }
            if (typeof data?.error === "string" && data.error.trim()) return data.error
        } else {
            const text = await response.text()
            if (text.trim()) return text
        }
    } catch {
        // Body could not be read — use the fallback message.
    }
    return fallback
}

// Shared POST /login | /register call. The password is always keccak-hashed
// before leaving the browser (the backend only ever stores/compares hashes).
const authenticate = async (
    endpoint: "login" | "register",
    username: string,
    password: string,
    populateDemoData = false,
): Promise<AuthResponse> => {
    const queryUrl = baseUrl + endpoint

    try {
        const response = await fetch(queryUrl, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username,
                password: keccak256(utf8ToBytes(password)),
                ...(endpoint === "register" && { populateDemoData }),
            }),
        })
        if (response.ok) {
            const body = (await response.json()) as {
                accessToken?: unknown
                username?: unknown
                demoPopulated?: unknown
                expiresAt?: unknown
            }
            if (typeof body?.accessToken !== "string" || !body.accessToken) {
                // Treat a 2xx without a token as a failed attempt.
                return { ok: false, status: response.status, message: fallbackMessage(endpoint) }
            }
            return {
                ok: true,
                accessToken: body.accessToken,
                username: typeof body.username === "string" ? body.username : undefined,
                demoPopulated: body.demoPopulated === true ? true : undefined,
                // Absent for ordinary accounts, which is how the client learns the
                // session is permanent.
                expiresAt: typeof body.expiresAt === "number" && body.expiresAt > 0 ? body.expiresAt : null,
            }
        }
        return { ok: false, status: response.status, message: await readErrorMessage(response, fallbackMessage(endpoint)) }
    } catch (error) {
        console.log(queryUrl, error)
        return { ok: false, status: 0, message: "Can’t reach the server — is the backend running?" }
    }
}


// Login / register wrappers (hashed on the wire via authenticate).
export const login = async (username: string, password: string): Promise<AuthResponse> => authenticate("login", username, password)

export const register = async (username: string, password: string, populateDemoData = false): Promise<AuthResponse> =>
    authenticate("register", username, password, populateDemoData)

// Decodes the `sub` (username) claim from a JWT without any dependency. Returns
// null for malformed tokens — the caller falls back to localStorage.
export const getUsernameFromToken = (token: string): string | null => {
    try {
        const payload = token.split(".")[1]
        if (!payload) return null
        const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
        return typeof json.sub === "string" && json.sub.length > 0 ? json.sub : null
    } catch {
        return null
    }
}

export const logout = async () => {
    const queryUrl = baseUrl + "logout"
    const token = localStorage.getItem("accessToken")
    if (token) {
        try {
            const response = await fetch(queryUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.status === 201) {
                localStorage.removeItem("accessToken")
                localStorage.removeItem("username")
                // The deadline belongs to the session being ended.
                clearSessionExpiry()
                return true
            } else return false
        } catch (error) {
            console.log(queryUrl, error)
            return false
        }
    } else {
        if (window.location.pathname !== "/login") {
            window.location.href = "/login"
        }
        return true
    }
}

// ── Playground sessions ─────────────────────────────────────────────────────
const cannotReach = "Can’t reach the server — is the backend running?"

/**
 * Starts a temporary session: the server generates an account, seeds a sample
 * portfolio and returns a token plus its deadline. There is no password — the
 * session *is* the token — and the account deletes itself when the deadline
 * passes.
 */
export const createPlaygroundSession = async (): Promise<PlaygroundSessionResponse> => {
    const queryUrl = baseUrl + "playground/session"

    try {
        const response = await fetch(queryUrl, { method: "POST", headers: { Accept: "application/json" } })
        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                message: await readErrorMessage(response, "The playground could not be started."),
            }
        }

        const body = (await response.json()) as { accessToken?: unknown; username?: unknown; expiresAt?: unknown }
        if (
            typeof body?.accessToken === "string" &&
            body.accessToken &&
            typeof body.username === "string" &&
            typeof body.expiresAt === "number"
        ) {
            return { ok: true, accessToken: body.accessToken, username: body.username, expiresAt: body.expiresAt }
        }
        return { ok: false, status: response.status, message: "The playground could not be started." }
    } catch (error) {
        console.log(queryUrl, error)
        return { ok: false, status: 0, message: cannotReach }
    }
}

/**
 * Converts the current playground session into a permanent account. The password
 * is hashed here, exactly as at sign-in, so the plaintext never leaves the browser.
 */
export const keepPlaygroundSession = async (password: string): Promise<{ ok: boolean; message?: string }> => {
    const queryUrl = baseUrl + "playground/keep"
    const token = localStorage.getItem("accessToken")

    try {
        const response = await fetch(queryUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ password: keccak256(utf8ToBytes(password)) }),
        })
        if (response.ok) return { ok: true }
        return { ok: false, message: await readErrorMessage(response, "Could not keep this account.") }
    } catch (error) {
        console.log(queryUrl, error)
        return { ok: false, message: cannotReach }
    }
}
