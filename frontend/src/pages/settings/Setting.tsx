import { useContext, useState, type FC, useEffect } from "react"
import { Button } from "antd"
import type { MenuTheme } from "antd"
import type { AliasToken } from "antd/es/theme/internal"
import { backendStatus } from "@/types"
import { downloadDatabase, getStatus } from "@/api/backend"
import { UserContext } from "@/app/contexts"

import { Status } from "@/pages/settings/Status"
import { RestoreDatabase } from "@/pages/settings/RestoreDatabase"
import { BotIcon, ExportIcon, RefreshIcon, SpinnerIcon } from "@/components/icons/nexus"
import { Panel, SectionLabel } from "@/components/ui"

export const Setting: FC<{
    theme: MenuTheme
    globalToken: AliasToken
    addresses: Set<string>
}> = ({ addresses }): React.ReactElement => {
    // Only the bootstrap admin may export the raw databases (the API enforces
    // this too) — hide the control rather than let it fail with a 403.
    const { user } = useContext(UserContext)
    const isAdmin = user === "admin"
    const [isFetching, setIsFetching] = useState<boolean>(false)
    const [isDownloading, setIsDownloading] = useState<boolean>(false)
    const [botStatus, setBotStatus] = useState<{ [key: string]: { [key: string]: backendStatus } }>({})
    useEffect(() => {
        if (addresses.size !== 0) fetchBackendStatus()
    }, [addresses])

    const fetchBackendStatus = async () => {
        if (!isFetching) {
            setIsFetching(true)

            const res = await getStatus(Array.from(addresses))

            setTimeout(async function () {
                if (res) setBotStatus(res)

                setIsFetching(false)
            }, 1000)
        }
    }

    const _downloadDatabase = async () => {
        if (!isDownloading) {
            setIsDownloading(true)
            await downloadDatabase()
            setIsDownloading(false)
        }
    }

    const systemPanel = (
        <Panel
            label="System"
            right={
                <div className="flex items-center gap-2">
                    <Button
                        size="small"
                        icon={isFetching ? <SpinnerIcon size={14} className="animate-spin" /> : <RefreshIcon size={14} />}
                        onClick={fetchBackendStatus}
                    />
                    {isAdmin && (
                        <Button
                            size="small"
                            icon={isDownloading ? <SpinnerIcon size={14} className="animate-spin" /> : <ExportIcon size={14} />}
                            onClick={_downloadDatabase}
                        >
                            Export
                        </Button>
                    )}
                </div>
            }
        >
            <div className="mb-3 flex items-center gap-2">
                <BotIcon size={16} className="text-zinc-500" />
                <SectionLabel>Bot metrics</SectionLabel>
            </div>
            <Status addresses={addresses} botStatus={botStatus} />
        </Panel>
    )

    return (
        <>
            {systemPanel}
            {isAdmin && <RestoreDatabase />}
        </>
    )
}
