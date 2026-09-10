import { theme as Theme, type GetProp, type ConfigProviderProps, type MenuTheme, type ThemeConfig } from "antd"
import { brand } from "./brand"

type WaveConfig = GetProp<ConfigProviderProps, "wave">

type ShakeEffectNode = HTMLElement & { effectTimeout?: number }

// Shake Effect (Copied exactly)
export const showShakeEffect: WaveConfig["showEffect"] = (node, { component }) => {
    if (component !== "Button") {
        return
    }

    const el = node as ShakeEffectNode
    const seq = [0, -15, 15, -5, 5, 0]
    const itv = 10
    let steps = 0

    function loop() {
        cancelAnimationFrame(el.effectTimeout!)
        el.effectTimeout = requestAnimationFrame(() => {
            const currentStep = Math.floor(steps / itv)
            const current = seq[currentStep]
            const next = seq[currentStep + 1]

            if (!next) {
                el.style.transform = ""
                el.style.transition = ""
                return
            }

            const angle = current + ((next - current) / itv) * (steps % itv)
            el.style.transform = `rotate(${angle}deg)`
            el.style.transition = "none"
            steps += 1
            loop()
        })
    }
    loop()
}

export const createThemeConfig = (theme: MenuTheme): ThemeConfig => {
    const baseConfig: ThemeConfig = {
        token: {
            borderRadius: 6,
            fontFamily: brand.fontBody,
        },
        components: {
            Card: {
                // Removes heavy shadows for a cleaner, modern flat aesthetic
                boxShadowTertiary: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
            },
            Layout: {
                // Forces Sider background to follow the unified menu layout surface
                siderBg: theme === "dark" ? brand.surface : "#ffffff",
            },
        },
    }

    if (theme === "dark") {
        return {
            algorithm: Theme.darkAlgorithm,
            ...baseConfig,
            token: {
                ...baseConfig.token,
                colorPrimary: brand.indigo, // Primary interactive — echoes the landing glows
                colorBgLayout: brand.layout, // Deep Obsidian base
                colorBgContainer: brand.surface, // Elevated Card surfaces
                colorText: brand.onDark, // Sharp white typography
                colorTextDescription: brand.onDarkMuted, // Soft readable subtexts
                colorBorderSecondary: brand.border, // Subtle content borders
            },
            components: {
                ...baseConfig.components,
                Layout: {
                    bodyBg: brand.layout,
                    headerBg: brand.surface,
                    siderBg: brand.surface,
                },
                Menu: {
                    itemBg: "transparent",
                    subMenuItemBg: "transparent",
                    itemColor: brand.onDarkMuted,
                    itemHoverColor: brand.onDark,
                    itemHoverBg: "rgba(255, 255, 255, 0.04)",
                    itemSelectedColor: brand.onDark,
                    itemSelectedBg: "rgba(109, 124, 242, 0.18)",
                    itemBorderRadius: 8,
                    itemHeight: 34,
                    itemMarginInline: 8,
                    groupTitleColor: "rgba(160, 174, 192, 0.75)",
                    groupTitleFontSize: 11,
                    iconSize: 16,
                    collapsedIconSize: 18,
                    activeBarWidth: 0,
                    activeBarBorderWidth: 0,
                    darkItemBg: "transparent",
                    darkSubMenuItemBg: "transparent",
                    darkItemColor: brand.onDarkMuted,
                    darkItemHoverColor: brand.onDark,
                    darkItemHoverBg: "rgba(255, 255, 255, 0.04)",
                    darkItemSelectedColor: brand.onDark,
                    darkItemSelectedBg: "rgba(109, 124, 242, 0.18)",
                    darkGroupTitleColor: "rgba(160, 174, 192, 0.75)",
                },
                Table: {
                    headerBg: "transparent",
                    headerColor: brand.onDarkMuted,
                    borderColor: brand.border,
                    rowHoverBg: "rgba(255, 255, 255, 0.03)",
                },
                Segmented: {
                    trackBg: "rgba(255, 255, 255, 0.04)",
                    itemColor: brand.onDarkMuted,
                    itemSelectedBg: brand.indigo,
                    itemSelectedColor: "#0b0e14",
                },
                Tabs: {
                    itemColor: brand.onDarkMuted,
                    itemSelectedColor: brand.onDark,
                    inkBarColor: brand.indigo,
                },
            },
        }
    }

    return {
        ...Theme.defaultConfig,
        ...baseConfig,
        token: {
            ...baseConfig.token,
            colorPrimary: "#0f5fd7", // Sharp Trading Blue
            colorBgLayout: "#f1f3f6", // Cool Gray layout backdrop
            colorBgContainer: "#ffffff", // Cards lift off the layout cleanly
            colorText: "#1a202c", // Deep graphite headings
            colorTextDescription: "#718096", // Mid-tone structural labels
            colorBorderSecondary: "#e2e8f0", // Clean card lines
        },
        components: {
            ...baseConfig.components,
            Layout: {
                bodyBg: brand.lightLayout,
                headerBg: brand.lightSurface,
                siderBg: brand.lightSurface,
            },
            Menu: {
                itemBg: "transparent",
                subMenuItemBg: "transparent",
                itemColor: brand.onLightMuted,
                itemHoverColor: brand.onLight,
                itemHoverBg: "rgba(15, 23, 42, 0.04)",
                itemSelectedColor: brand.blue,
                itemSelectedBg: "rgba(15, 95, 215, 0.1)",
                itemBorderRadius: 8,
                itemHeight: 34,
                itemMarginInline: 8,
                groupTitleColor: "rgba(100, 116, 139, 0.8)",
                groupTitleFontSize: 11,
                iconSize: 16,
                collapsedIconSize: 18,
                activeBarWidth: 0,
                activeBarBorderWidth: 0,
                darkItemBg: "transparent",
                darkSubMenuItemBg: "transparent",
                darkItemColor: brand.onDarkMuted,
                darkItemHoverColor: brand.onDark,
                darkItemHoverBg: "rgba(255, 255, 255, 0.04)",
                darkItemSelectedColor: brand.onDark,
                darkItemSelectedBg: "rgba(109, 124, 242, 0.18)",
                darkGroupTitleColor: "rgba(160, 174, 192, 0.75)",
            },
            Table: {
                headerBg: "transparent",
                headerColor: brand.onLightMuted,
                borderColor: brand.lightBorder,
                rowHoverBg: "rgba(15, 23, 42, 0.02)",
            },
            Segmented: {
                trackBg: "rgba(15, 23, 42, 0.03)",
                itemColor: brand.onLightMuted,
                itemSelectedBg: brand.blue,
                itemSelectedColor: "#ffffff",
            },
            Tabs: {
                itemColor: brand.onLightMuted,
                itemSelectedColor: brand.onLight,
                inkBarColor: brand.blue,
            },
        },
    }
}
