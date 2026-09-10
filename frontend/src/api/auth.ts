import { keccak256 } from "ethereum-cryptography/keccak"
import { utf8ToBytes } from "ethereum-cryptography/utils"
import { baseUrl } from "@/api/backend"

// Result of a POST /login | /register attempt. Success mirrors the backend JSON
// (with `ok: true`), failures carry the HTTP status plus a human-readable
// message parsed from the backend (error JSON/text) so the login form can give
// specific guidance (no account vs wrong password vs duplicate username).
export type AuthResponse =
    | { ok: true; accessToken: string; username?: string; demoPopulated?: boolean }
    | { ok: false; status: number; message: string }

const fallbackMessage = (endpoint: "login" | "register"): string =>
    endpoint === "login"
        ? "Sign-in failed — check your username and password."
        : "Couldn’t create your account. Please try again."

// Tries to read a friendly `{ error }` JSON message (or raw text) from a failed
// response, falling back to an endpoint-specific generic message.
const readErrorMessage = async (response: Response, endpoint: "login" | "register"): Promise<string> => {
    const fallback = fallbackMessage(endpoint)
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
            const body = (await response.json()) as { accessToken?: unknown; username?: unknown; demoPopulated?: unknown }
            if (typeof body?.accessToken !== "string" || !body.accessToken) {
                // Treat a 2xx without a token as a failed attempt.
                return { ok: false, status: response.status, message: fallbackMessage(endpoint) }
            }
            return {
                ok: true,
                accessToken: body.accessToken,
                username: typeof body.username === "string" ? body.username : undefined,
                demoPopulated: body.demoPopulated === true ? true : undefined,
            }
        }
        return { ok: false, status: response.status, message: await readErrorMessage(response, endpoint) }
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
