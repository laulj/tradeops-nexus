import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App as AntdApp } from "antd"
import { RestoreDatabase } from "@/pages/settings/RestoreDatabase"
import { restoreDatabase } from "@/api/backend"

vi.mock("@/api/backend", () => ({
    restoreDatabase: vi.fn(),
}))

const mockedRestore = vi.mocked(restoreDatabase)

// The panel is the only place a database file can be replaced, so these tests pin
// the confirmation step and that a refusal from the server is shown rather than
// silently swallowed.

const renderPanel = () => render(<AntdApp>{<RestoreDatabase />}</AntdApp>)

const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement

const chooseFile = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) => {
    await user.upload(fileInput(container), new File(["sqlite-bytes"], "tx.db", { type: "application/octet-stream" }))
}

describe("RestoreDatabase", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.setItem("accessToken", "admin-token")
    })

    it("keeps the restore disabled until a file is chosen", async () => {
        const user = userEvent.setup()
        const { container } = renderPanel()

        const stage = screen.getByRole("button", { name: /stage restore/i })
        expect(stage).toBeDisabled()

        await chooseFile(user, container)

        await waitFor(() => expect(stage).toBeEnabled())
    })

    it("stages the chosen file against tx after the admin confirms", async () => {
        mockedRestore.mockResolvedValue({
            ok: true,
            bytes: 4096,
            sha256: "a".repeat(64),
            snapshot: "tx-2026-09-14.db",
            restartRequired: true,
        })
        const user = userEvent.setup()
        const { container } = renderPanel()

        await chooseFile(user, container)
        await user.click(screen.getByRole("button", { name: /stage restore/i }))
        await user.click(await screen.findByRole("button", { name: /^replace$/i }))

        await waitFor(() => expect(mockedRestore).toHaveBeenCalledWith("tx", expect.any(File)))
        expect(await screen.findByText(/restart the service to apply it/i)).toBeInTheDocument()
    })

    it("surfaces the server's reason when it refuses the file", async () => {
        mockedRestore.mockResolvedValue({ ok: false, message: "That file is not a usable SQLite database" })
        const user = userEvent.setup()
        const { container } = renderPanel()

        await chooseFile(user, container)
        await user.click(screen.getByRole("button", { name: /stage restore/i }))
        await user.click(await screen.findByRole("button", { name: /^replace$/i }))

        expect(await screen.findByText(/not a usable SQLite database/i)).toBeInTheDocument()
    })
})
