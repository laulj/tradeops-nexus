import { afterEach, describe, expect, it, vi } from "vitest"
import {
    alertBootTestMode,
    alertChannelConfigured,
    configuredAlertTransports,
    createPostmarkTransport,
    createResendTransport,
    createWebhookTransport,
    maxAlertsPerRun,
    resetAlertBudget,
    sendAlert,
    sendAlertChannelTest,
} from "../alerts"
import { clearDbEnv, setAlertEnv } from "./helpers"

// Alerts are the only reason a budget breach becomes visible without reading logs,
// so they must be configured correctly, must not throw when a provider rejects the
// call, and must not be able to mail in a loop.

const okResponse = () => ({ ok: true, status: 200, text: async () => "" }) as unknown as Response
const badResponse = (status: number, body: string) =>
    ({ ok: false, status, text: async () => body }) as unknown as Response
const asFetch = (mock: unknown) => mock as unknown as typeof fetch

describe("alert transports", () => {
    it("posts the webhook payload as JSON", async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse())
        await createWebhookTransport("https://hooks.example.com/x", asFetch(fetchMock)).send({
            subject: "s",
            body: "b",
        })

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe("https://hooks.example.com/x")
        expect(JSON.parse(String((init as RequestInit).body))).toEqual({ subject: "s", body: "b" })
    })

    it("calls the Resend endpoint and splits recipients", async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse())
        await createResendTransport(
            { apiKey: "re_key", from: "a@b.co", to: "one@x.co, two@y.co" },
            asFetch(fetchMock),
        ).send({ subject: "s", body: "b" })

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe("https://api.resend.com/emails")
        const request = init as RequestInit
        expect((request.headers as Record<string, string>).Authorization).toBe("Bearer re_key")
        expect(JSON.parse(String(request.body)).to).toEqual(["one@x.co", "two@y.co"])
    })

    it("calls the Postmark endpoint with its token header", async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse())
        await createPostmarkTransport(
            { serverToken: "pm-token", from: "a@b.co", to: "one@x.co" },
            asFetch(fetchMock),
        ).send({ subject: "s", body: "b" })

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe("https://api.postmarkapp.com/email")
        expect((init as RequestInit & { headers: Record<string, string> }).headers["X-Postmark-Server-Token"]).toBe(
            "pm-token",
        )
    })

    it("surfaces the provider's message when the API rejects the call", async () => {
        const fetchMock = vi.fn().mockResolvedValue(badResponse(422, "sender not verified"))

        await expect(
            createResendTransport({ apiKey: "k", from: "a@b.co", to: "c@d.co" }, asFetch(fetchMock)).send({
                subject: "s",
                body: "b",
            }),
        ).rejects.toThrow(/422 sender not verified/)
    })
})

describe("alert configuration", () => {
    afterEach(() => clearDbEnv())

    it("builds nothing when nothing is configured", () => {
        clearDbEnv()

        expect(configuredAlertTransports()).toHaveLength(0)
        expect(alertChannelConfigured()).toBe(false)
    })

    it("builds a webhook and an email transport", () => {
        clearDbEnv()
        setAlertEnv({ webhookUrl: "https://hooks.example.com/x", apiKey: "re_key", from: "a@b.co", to: "c@d.co" })

        expect(configuredAlertTransports().map((t) => t.name)).toEqual(["webhook", "resend"])
        expect(alertChannelConfigured()).toBe(true)
    })

    it("selects Postmark when the provider says so", () => {
        clearDbEnv()
        setAlertEnv({ apiKey: "pm-token", from: "a@b.co", to: "c@d.co", provider: "postmark" })

        expect(configuredAlertTransports().map((t) => t.name)).toEqual(["postmark"])
    })

    it("defaults the smoke test to once per deployment", () => {
        clearDbEnv()
        expect(alertBootTestMode()).toBe("once")

        setAlertEnv({ bootTest: "always" })
        expect(alertBootTestMode()).toBe("always")

        setAlertEnv({ bootTest: "off" })
        expect(alertBootTestMode()).toBe("off")
    })
})

describe("alert delivery", () => {
    afterEach(() => {
        clearDbEnv()
        resetAlertBudget()
    })

    it("reports how many transports delivered", async () => {
        const good = { name: "good", send: vi.fn().mockResolvedValue(undefined) }
        const bad = { name: "bad", send: vi.fn().mockRejectedValue(new Error("nope")) }

        const result = await sendAlert({ subject: "s", body: "b" }, { transports: [good, bad], bypassBudget: true })

        expect(result).toEqual({ delivered: 1, attempted: 2 })
    })

    it("does nothing when no channel is configured", async () => {
        clearDbEnv()

        expect(await sendAlert({ subject: "s", body: "b" })).toEqual({ delivered: 0, attempted: 0 })
    })

    it("never throws when every transport rejects", async () => {
        const transport = { name: "t", send: vi.fn().mockRejectedValue(new Error("boom")) }

        await expect(
            sendAlert({ subject: "s", body: "b" }, { transports: [transport], bypassBudget: true }),
        ).resolves.toEqual({ delivered: 0, attempted: 1 })
    })

    it("stops after the per-run budget, so a bug cannot mail in a loop", async () => {
        clearDbEnv()
        setAlertEnv({ maxPerRun: 1 })
        resetAlertBudget()
        const transport = { name: "t", send: vi.fn().mockResolvedValue(undefined) }

        await sendAlert({ subject: "one", body: "" }, { transports: [transport] })
        const second = await sendAlert({ subject: "two", body: "" }, { transports: [transport] })

        expect(maxAlertsPerRun()).toBe(1)
        expect(second.delivered).toBe(0)
        expect(transport.send).toHaveBeenCalledTimes(1)
    })

    it("sends the channel smoke test through the injected transport", async () => {
        const transport = { name: "t", send: vi.fn().mockResolvedValue(undefined) }

        const result = await sendAlertChannelTest({ transports: [transport] })

        expect(result.delivered).toBe(1)
        expect(transport.send.mock.calls[0][0].subject).toMatch(/alert channel is live/i)
    })
})

