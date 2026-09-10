import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { App as AntdApp, Button, Popconfirm, Table } from "antd"
import type { ColumnsType } from "antd/es/table"
import { deleteUser, getUsers, type UserInfo } from "@/api/backend"
import { Panel, Tag } from "@/components/ui"

// Admin-only page: lists every registered account and lets the admin delete a
// user together with all rows they own (across the three databases).
export const AdminUsers: React.FC = () => {
    const queryClient = useQueryClient()
    const { message } = AntdApp.useApp()
    const [deleting, setDeleting] = useState<string | null>(null)

    const { data: users, isLoading } = useQuery({
        queryKey: ["adminUsers"],
        queryFn: () => getUsers(),
        staleTime: 30_000,
    })

    const onDelete = async (username: string) => {
        setDeleting(username)
        const ok = await deleteUser(username)
        setDeleting(null)
        if (ok) {
            message.success(`Deleted "${username}" and all their data`)
            queryClient.invalidateQueries({ queryKey: ["adminUsers"] })
        } else {
            message.error(`Failed to delete "${username}"`)
        }
    }

    const columns: ColumnsType<UserInfo> = [
        { title: "Username", dataIndex: "username", key: "username" },
        {
            title: "Demo data",
            dataIndex: "demo_populated",
            key: "demo_populated",
            render: (v: number) => (v ? <Tag tone="indigo">pre-populated</Tag> : <Tag tone="muted">—</Tag>),
        },
        {
            title: "Created",
            dataIndex: "created_at",
            key: "created_at",
            render: (v: number) => new Date(v).toLocaleString(),
        },
        {
            title: "Actions",
            key: "actions",
            render: (_, row) =>
                row.username === "admin" ? (
                    <span className="font-metric text-[10px] uppercase tracking-[0.14em] text-zinc-500">protected</span>
                ) : (
                    <Popconfirm
                        title={`Delete ${row.username}?`}
                        description="Removes the account and every row it owns across all databases."
                        okButtonProps={{ danger: true }}
                        onConfirm={() => onDelete(row.username)}
                    >
                        <Button size="small" danger loading={deleting === row.username}>
                            Delete
                        </Button>
                    </Popconfirm>
                ),
        },
    ]

    return (
        <Panel label="User management">
            <p className="mb-4 text-xs text-zinc-500">Deleting a user permanently removes their account and all associated data.</p>
            <Table rowKey="username" loading={isLoading} columns={columns} dataSource={users ?? []} pagination={false} />
        </Panel>
    )
}
