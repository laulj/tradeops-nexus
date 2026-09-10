export const HTTPMethod = {
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    PATCH: "PATCH",
    DELETE: "DELETE",
} as const
export type HTTPMethod = (typeof HTTPMethod)[keyof typeof HTTPMethod]

export interface ClientErrorResponse {
    message: string
    error: Error
}

export class ApiClientError<Data = unknown> extends Error {
    status: number
    data: Data
    response: Response
    constructor({ message, data, response }: { message: string; data: Data; response: Response }) {
        super(message)
        this.status = response.status
        this.data = data
        this.response = response
    }
}

interface ClientOptions extends RequestInit {
    data?: Record<string, unknown>
}

const UNEXPECTED_ERROR_MESSAGE = "An unexpected error occurred."

function getErrorMessage({
    message = UNEXPECTED_ERROR_MESSAGE,
}: {
    message?: string
} = {}) {
    return `Fetch error. ${message}.`
}

// Global handler for 401 responses – clears token and can redirect
function handleUnauthorized() {
    localStorage.removeItem("accessToken")
    window.location.reload() // force refresh, fetching the latest React states
}

export async function apiClient<T>(endpoint: string, { data, headers: customHeaders, ...customConfig }: ClientOptions = {}): Promise<T> {
    const config: RequestInit = {
        method: data ? (typeof data.method === "string" ? data.method : HTTPMethod.POST) : HTTPMethod.GET,
        body: data ? JSON.stringify(data) : undefined,
        headers: {
            ...(data && { "Content-Type": "application/json" }),
            ...customHeaders,
        },
        ...customConfig,
    }

    return fetch(endpoint, config).then(async (response) => {
        // --- GLOBAL 401 INTERCEPTOR ---
        if (response.status === 401) {
            handleUnauthorized()
            throw new ApiClientError({
                message: "Session expired. Please log in again.",
                data: {},
                response,
            })
        }

        try {
            let data: Record<string, unknown>

            try {
                data = await response.json()
            } catch (e) {
                throw new ApiClientError({
                    message: `JSON parse error: ${e}`,
                    data: {
                        url: endpoint,
                    },
                    response,
                })
            }

            if (response.ok) {
                // Cosmos chains return a code if there's an error
                if ("code" in data && Boolean(data.code)) {
                    throw new ApiClientError({
                        message: `A chain error has occurred. Code: ${data.code}. Message: ${data.message}`,
                        data,
                        response,
                    })
                }

                if ("status_code" in data && Number(data.status_code) >= 400) {
                    throw new ApiClientError({
                        message: getErrorMessage({ message: data?.message as string | undefined }),
                        data,
                        response,
                    })
                }

                return data as T
            } else {
                throw new ApiClientError({
                    message: getErrorMessage({ message: data?.message as string | undefined }),
                    data,
                    response,
                })
            }
        } catch (e) {
            const error = e as Error | ApiClientError

            console.error("Fetch Error. Info:", {
                endpoint,
                config,
                data,
                status: response.status,
                exception: e,
            })

            if (e instanceof ApiClientError) {
                throw e
            }

            throw new ApiClientError({
                message: getErrorMessage({
                    message: error.message === "Unexpected token < in JSON at position 0" ? undefined : error.message,
                }),
                data: {},
                response,
            })
        }
    })
}
