import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiClientError, apiClient, HTTPMethod } from "@/api/client"

const jsonResponse = (body: unknown, status = 200, ok = status >= 200 && status < 300): Response =>
    ({ ok, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response)

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("apiClient", () => {
    it("performs a GET request and returns the parsed JSON", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: 1 }))
        vi.stubGlobal("fetch", fetchMock)

        const result = await apiClient<{ data: number }>("/foo")

        expect(result).toEqual({ data: 1 })
        expect(fetchMock).toHaveBeenCalledWith(
            "/foo",
            expect.objectContaining({ method: HTTPMethod.GET, body: undefined }),
        )
    })

    it("sends a POST body and JSON content type when data is provided", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)

        await apiClient("/foo", { data: { a: 1 } })

        const [, config] = fetchMock.mock.calls[0]
        expect(config.method).toBe(HTTPMethod.POST)
        expect(JSON.parse(config.body)).toEqual({ a: 1 })
        expect(config.headers["Content-Type"]).toBe("application/json")
    })

    it("honours an explicit method inside data", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)

        await apiClient("/foo", { data: { method: HTTPMethod.PUT } })

        const [, config] = fetchMock.mock.calls[0]
        expect(config.method).toBe(HTTPMethod.PUT)
    })

    it("merges custom headers", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
        vi.stubGlobal("fetch", fetchMock)

        await apiClient("/foo", { headers: { Authorization: "Bearer x" } })

        const [, config] = fetchMock.mock.calls[0]
        expect(config.headers.Authorization).toBe("Bearer x")
    })

    it("throws ApiClientError with status and data on non-ok responses", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "boom" }, 500, false))
        vi.stubGlobal("fetch", fetchMock)

        const error = await apiClient("/foo").catch((e: unknown) => e)

        expect(error).toBeInstanceOf(ApiClientError)
        expect(error).toMatchObject({ status: 500, data: { message: "boom" } })
    })

    it("clears the access token and throws on 401", async () => {
        localStorage.setItem("accessToken", "tok")
        const reloadSpy = vi.fn()
        Object.defineProperty(window, "location", {
            configurable: true,
            writable: true,
            value: { ...window.location, reload: reloadSpy },
        })
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401, false))
        vi.stubGlobal("fetch", fetchMock)

        await expect(apiClient("/foo")).rejects.toBeInstanceOf(ApiClientError)
        expect(localStorage.getItem("accessToken")).toBeNull()
        expect(reloadSpy).toHaveBeenCalled()
    })

    it("wraps JSON parse failures in ApiClientError", async () => {
        const response = {
            ok: true,
            status: 200,
            json: vi.fn().mockRejectedValue(new Error("Unexpected token")),
        } as unknown as Response
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

        const error = await apiClient("/foo").catch((e: unknown) => e)
        expect(error).toBeInstanceOf(ApiClientError)
        expect((error as ApiClientError).message).toContain("JSON parse error")
    })

    it("throws ApiClientError for chain errors reported via data.code", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 5, message: "chain error" }))
        vi.stubGlobal("fetch", fetchMock)

        await expect(apiClient("/foo")).rejects.toThrow(/chain error/i)
    })

    it("throws ApiClientError when the backend reports status_code >= 400", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status_code: 500, message: "backend failed" }))
        vi.stubGlobal("fetch", fetchMock)

        await expect(apiClient("/foo")).rejects.toThrow(/backend failed/i)
    })

    it("propagates fetch network failures", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

        await expect(apiClient("/foo")).rejects.toBeInstanceOf(TypeError)
    })
})
