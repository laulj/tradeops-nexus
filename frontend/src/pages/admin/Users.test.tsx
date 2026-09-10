import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App as AntdApp } from "antd"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminUsers } from "@/pages/admin/Users"
import { deleteUser, getUsers } from "@/api/backend"

vi.mock("@/api/backend", () => ({
    getUsers: vi.fn(),
    deleteUser: vi.fn(),
}))

const queryClient = new QueryClient()

const renderPage = () =>
    render(
        <QueryClientProvider client={queryClient}>
            <AntdApp>
                <AdminUsers />
            </AntdApp>
        </QueryClientProvider>,
    )

describe("AdminUsers", () => {
    beforeEach(() => {
        vi.mocked(getUsers).mockReset()
        vi.mocked(deleteUser).mockReset()
        queryClient.clear()
    })

    it("lists all users and marks the admin account as protected", async () => {
        vi.mocked(getUsers).mockResolvedValue([
            { username: "admin", created_at: 1700000000000, demo_populated: 0 },
            { username: "user1", created_at: 1710000000000, demo_populated: 1 },
            { username: "user2", created_at: 1720000000000, demo_populated: 0 },
        ])
        renderPage()

        expect(await screen.findByText("admin")).toBeInTheDocument()
        expect(screen.getByText("user1")).toBeInTheDocument()
        expect(screen.getByText("user2")).toBeInTheDocument()
        expect(screen.getByText("pre-populated")).toBeInTheDocument()
        expect(screen.getByText("protected")).toBeInTheDocument()
    })

    it("deletes a user after confirmation", async () => {
        vi.mocked(getUsers).mockResolvedValue([
            { username: "admin", created_at: 1700000000000, demo_populated: 0 },
            { username: "user1", created_at: 1710000000000, demo_populated: 1 },
        ])
        vi.mocked(deleteUser).mockResolvedValue(true)
        const user = userEvent.setup()
        renderPage()

        await screen.findByText("user1")
        await user.click(screen.getByRole("button", { name: /delete/i }))

        // The Popconfirm renders in a portal with a short motion animation.
        const okButton = await screen.findByRole("button", { name: "OK" }, { timeout: 5000 })
        await user.click(okButton)

        await waitFor(() => expect(deleteUser).toHaveBeenCalledWith("user1"))
    })
})
