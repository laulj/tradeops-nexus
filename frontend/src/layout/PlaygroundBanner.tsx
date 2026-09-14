import React, { useEffect, useState } from "react"
import { App, Button, Input, Modal, Typography } from "antd"
import { keepPlaygroundSession } from "@/api/auth"
import { clearSessionExpiry, formatRemaining, readSessionExpiry } from "@/app/sessionExpiry"
import { Panel } from "@/components/ui"

const { Text } = Typography

/**
 * Shown only for playground sessions. They expire, so the honest thing to display
 * is the remaining time — and "Keep this account" is the escape hatch that turns
 * the session into a permanent account with a real password.
 */
export const PlaygroundBanner: React.FC = () => {
    const { notification } = App.useApp()
    const [expiresAt, setExpiresAt] = useState<number | null>(() => readSessionExpiry())
    const [now, setNow] = useState<number>(() => Date.now())
    const [open, setOpen] = useState<boolean>(false)
    const [password, setPassword] = useState<string>("")
    const [saving, setSaving] = useState<boolean>(false)

    useEffect(() => {
        if (expiresAt === null) return
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [expiresAt])

    if (expiresAt === null || expiresAt <= now) return <></>

    const keep = async () => {
        setSaving(true)
        const result = await keepPlaygroundSession(password)
        setSaving(false)

        if (!result.ok) {
            notification.error({
                message: "Could not keep this account",
                description: result.message ?? "Please try again.",
                duration: 6,
            })
            return
        }

        clearSessionExpiry()
        setExpiresAt(null)
        setOpen(false)
        setPassword("")
        notification.success({
            message: "Account kept",
            description: "This session is now a permanent account — sign in with the password you just set.",
            duration: 6,
        })
    }

    return (
        <div className="mb-3">
            <Panel label="Temporary session">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Text type="secondary" className="text-xs">
                        This playground session and its data are deleted when it expires — in{" "}
                        <Text strong className="font-metric">
                            {formatRemaining(expiresAt, now)}
                        </Text>
                        .
                    </Text>
                    <Button size="small" onClick={() => setOpen(true)}>
                        Keep this account
                    </Button>
                </div>

                <Modal
                    open={open}
                    title="Keep this account"
                    okText="Keep account"
                    confirmLoading={saving}
                    onOk={keep}
                    onCancel={() => setOpen(false)}
                >
                    <Text type="secondary" className="block mb-3 text-xs">
                        Choose a password and this session becomes a permanent account, so its data stops being deleted.
                    </Text>
                    <Input.Password
                        value={password}
                        placeholder="New password"
                        autoComplete="new-password"
                        onChange={(event) => setPassword(event.target.value)}
                    />
                </Modal>
            </Panel>
        </div>
    )
}
