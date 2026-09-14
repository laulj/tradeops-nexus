import React, { useState } from "react"
import { App, Button, Flex, Select, Typography, Upload } from "antd"
import type { GetProp, UploadFile, UploadProps } from "antd"
import { DataIcon, ExportIcon } from "@/components/icons/nexus"
import { Panel } from "@/components/ui"
import { restoreDatabase, type RestoreTarget } from "@/api/backend"

const { Text } = Typography

type FileType = Parameters<GetProp<UploadProps, "beforeUpload">>[0]

const TARGETS: { value: RestoreTarget; label: string }[] = [
    { value: "tx", label: "tx.db — accounts and spot trades" },
    { value: "spotFuture", label: "spotFuture.db — perp-futures book" },
    { value: "fRate", label: "fRate.db — funding-rate book" },
]

/**
 * Admin-only. Replaces one of the three SQLite files from a backup.
 *
 * The upload is verified server-side (SQLite's own integrity check) and staged —
 * it is applied when the service next restarts, because swapping a database that
 * the app holds open is how SQLite files get corrupted. The current file is
 * snapshotted first, so a restore is undoable by restoring that snapshot.
 */
export const RestoreDatabase: React.FC = () => {
    const { notification, modal } = App.useApp()
    const [target, setTarget] = useState<RestoreTarget>("tx")
    const [fileList, setFileList] = useState<UploadFile[]>([])
    const [uploading, setUploading] = useState<boolean>(false)

    const selected = fileList[0]?.originFileObj as FileType | undefined

    const runRestore = async () => {
        if (!selected) return
        setUploading(true)
        const result = await restoreDatabase(target, selected)
        setUploading(false)

        if (!result.ok) {
            notification.error({
                title: "Restore failed",
                description: result.message ?? "Please try again.",
                duration: 6,
            })
            return
        }

        setFileList([])
        notification.success({
            title: "Restore staged",
            description: [
                `Verified ${Math.round((result.bytes ?? 0) / 1024)} KB (sha256 ${String(result.sha256 ?? "").slice(0, 12)}…).`,
                result.snapshot ? `Previous file kept as ${result.snapshot}.` : null,
                "Restart the service to apply it.",
            ]
                .filter(Boolean)
                .join(" "),
            duration: 8,
        })
    }

    const confirmRestore = () => {
        if (!selected) return
        modal.confirm({
            title: `Replace the ${target} database?`,
            content:
                "The current file is snapshotted first, and the replacement is applied when the service restarts — nothing changes until then.",
            okText: "Replace",
            okButtonProps: { danger: true },
            onOk: () => runRestore(),
        })
    }

    const props: UploadProps = {
        accept: ".db",
        maxCount: 1,
        fileList,
        onRemove: () => setFileList([]),
        beforeUpload: (file) => {
            // Held locally until the admin confirms; the upload is ours to send.
            setFileList([{ ...file, originFileObj: file } as UploadFile])
            return false
        },
    }

    return (
        <div className="mb-3">
            <Panel label="Restore database">
                <Flex gap="middle" wrap align="center" className="mb-3">
                    <Select
                        value={target}
                        onChange={(value) => setTarget(value)}
                        options={TARGETS}
                        style={{ minWidth: 280 }}
                        aria-label="Database to restore"
                    />
                    <Upload {...props}>
                        <Button icon={<DataIcon size={14} />}>Select .db file</Button>
                    </Upload>
                    <Button
                        danger
                        type="primary"
                        icon={<ExportIcon size={14} className="rotate-180" />}
                        onClick={confirmRestore}
                        disabled={!selected}
                        loading={uploading}
                    >
                        Stage restore
                    </Button>
                </Flex>
                <Text type="secondary" className="block text-xs">
                    The file is verified with SQLite&apos;s integrity check before anything is staged, and the current
                    database is snapshotted to <Text code>backups/</Text> so the restore can be undone. A restart applies it.
                </Text>
            </Panel>
        </div>
    )
}

export default RestoreDatabase
