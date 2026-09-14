// ── Operator alerts ─────────────────────────────────────────────────────────
// A budget breach is only useful if it reaches the owner without them reading
// logs, so alerts go out over HTTPS: an incoming webhook (Slack, Discord, ntfy)
// and/or an email API (Resend, Postmark). SMTP is avoided deliberately — hosts
// routinely block or throttle it, and it would drag in a mailer dependency for
// one message a month.
//
// Every failure here is logged and swallowed: a broken alert channel must never
// take down the request path that produced it.

export interface AlertMessage {
    subject: string
    body: string
}

export interface AlertTransport {
    name: string
    send: (message: AlertMessage) => Promise<void>
}

type FetchLike = typeof fetch

const REQUEST_TIMEOUT_MS = 8_000

const postJson = async (url: string, init: RequestInit, fetchImpl: FetchLike): Promise<void> => {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) {
        const detail = await response.text().catch(() => "")
        throw new Error(`${response.status} ${detail.slice(0, 200)}`.trim())
    }
}

export const createWebhookTransport = (url: string, fetchImpl: FetchLike = fetch): AlertTransport => ({
    name: "webhook",
    send: async (message) => {
        await postJson(
            url,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(message),
            },
            fetchImpl,
        )
    },
})

export const createResendTransport = (
    options: { apiKey: string; from: string; to: string },
    fetchImpl: FetchLike = fetch,
): AlertTransport => ({
    name: "resend",
    send: async ({ subject, body }) => {
        await postJson(
            "https://api.resend.com/emails",
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
                body: JSON.stringify({
                    from: options.from,
                    to: options.to
                        .split(",")
                        .map((address) => address.trim())
                        .filter(Boolean),
                    subject,
                    text: body,
                }),
            },
            fetchImpl,
        )
    },
})

export const createPostmarkTransport = (
    options: { serverToken: string; from: string; to: string },
    fetchImpl: FetchLike = fetch,
): AlertTransport => ({
    name: "postmark",
    send: async ({ subject, body }) => {
        await postJson(
            "https://api.postmarkapp.com/email",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-Postmark-Server-Token": options.serverToken,
                },
                body: JSON.stringify({ From: options.from, To: options.to, Subject: subject, TextBody: body }),
            },
            fetchImpl,
        )
    },
})

const env = (name: string): string | undefined => {
    const value = process.env[name]?.trim()
    return value ? value : undefined
}

export const alertEmailConfigured = (): boolean =>
    Boolean(env("ALERT_EMAIL_API_KEY") && env("ALERT_EMAIL_FROM") && env("ALERT_EMAIL_TO"))

export const alertChannelConfigured = (): boolean => Boolean(env("ALERT_WEBHOOK_URL")) || alertEmailConfigured()

/** The transports the environment describes; empty when nothing is configured. */
export const configuredAlertTransports = (fetchImpl: FetchLike = fetch): AlertTransport[] => {
    const transports: AlertTransport[] = []

    const webhook = env("ALERT_WEBHOOK_URL")
    if (webhook) transports.push(createWebhookTransport(webhook, fetchImpl))

    const apiKey = env("ALERT_EMAIL_API_KEY")
    const from = env("ALERT_EMAIL_FROM")
    const to = env("ALERT_EMAIL_TO")
    if (apiKey && from && to) {
        const provider = (env("ALERT_EMAIL_PROVIDER") ?? "resend").toLowerCase()
        transports.push(
            provider === "postmark"
                ? createPostmarkTransport({ serverToken: apiKey, from, to }, fetchImpl)
                : createResendTransport({ apiKey, from, to }, fetchImpl),
        )
    }

    return transports
}

/** `once` sends one smoke test per deployment; `always` is for tuning it. */
export const alertBootTestMode = (): "once" | "always" | "off" => {
    const mode = (env("ALERT_EMAIL_TEST_ON_BOOT") ?? "once").toLowerCase()
    return mode === "always" || mode === "off" ? mode : "once"
}

/** A bug must not be able to mail in a loop, so the budget is per process run. */
export const maxAlertsPerRun = (): number => {
    const parsed = Number(process.env.ALERT_MAX_PER_RUN)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20
}

let sentThisRun = 0

export const resetAlertBudget = (): void => {
    sentThisRun = 0
}

export const alertsSentThisRun = (): number => sentThisRun

/**
 * Sends through every configured transport (or the ones a test injects).
 * Failures are logged, never thrown.
 */
export const sendAlert = async (
    message: AlertMessage,
    options: { transports?: AlertTransport[]; bypassBudget?: boolean } = {},
): Promise<{ delivered: number; attempted: number }> => {
    const transports = options.transports ?? configuredAlertTransports()
    if (transports.length === 0) return { delivered: 0, attempted: 0 }

    if (!options.bypassBudget && sentThisRun >= maxAlertsPerRun()) {
        console.warn("INFO -- alert budget for this run is exhausted; dropping alert")
        return { delivered: 0, attempted: transports.length }
    }
    sentThisRun += 1

    let delivered = 0
    await Promise.all(
        transports.map(async (transport) => {
            try {
                await transport.send(message)
                delivered += 1
                console.log(`INFO -- alert sent via ${transport.name}: ${message.subject}`)
            } catch (err) {
                console.error(`Alert transport ${transport.name} failed:`, err instanceof Error ? err.message : err)
            }
        }),
    )

    return { delivered, attempted: transports.length }
}

/** Smoke test for the alert channel; the caller decides how often to send it. */
export const sendAlertChannelTest = (options: { transports?: AlertTransport[] } = {}) =>
    sendAlert(
        {
            subject: "[tradeops-nexus] alert channel is live",
            body: [
                "This is the first-startup test for the alert channel.",
                "",
                "If you are reading it, budget warnings, degradation notices and the monthly",
                "bandwidth summary will reach you. Set ALERT_EMAIL_TEST_ON_BOOT=off to stop",
                "sending this on future deployments.",
            ].join("\n"),
        },
        { transports: options.transports, bypassBudget: true },
    )

