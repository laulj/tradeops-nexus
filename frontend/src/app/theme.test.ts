import { describe, expect, it } from "vitest"
import { theme as Theme } from "antd"
import { createThemeConfig } from "@/app/theme"
import { brand } from "@/app/brand"

describe("createThemeConfig", () => {
    it("builds the dark theme with the dark algorithm", () => {
        const config = createThemeConfig("dark")

        expect(config.algorithm).toBe(Theme.darkAlgorithm)
        expect(config.token?.colorPrimary).toBe(brand.indigo)
        expect(config.token?.colorBgLayout).toBe("#0b0e14")
        expect(config.token?.colorBgContainer).toBe("#151a22")
        expect(config.components?.Layout).toMatchObject({ siderBg: "#151a22" })
    })

    it("builds the light theme without the dark algorithm", () => {
        const config = createThemeConfig("light")

        expect(config.algorithm).not.toBe(Theme.darkAlgorithm)
        expect(config.token?.colorPrimary).toBe("#0f5fd7")
        expect(config.token?.colorBgContainer).toBe("#ffffff")
        expect(config.components?.Layout).toMatchObject({ siderBg: "#ffffff" })
    })

    it("applies the shared base tokens to both themes", () => {
        for (const theme of ["dark", "light"] as const) {
            const config = createThemeConfig(theme)
            expect(config.token?.fontFamily).toBe(brand.fontBody)
            expect(config.token?.borderRadius).toBe(6)
            expect(config.components?.Card).toMatchObject({
                boxShadowTertiary: expect.any(String),
            })
        }
    })
})
