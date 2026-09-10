import React, { type FC } from "react"
import type { MenuTheme } from "antd"
import type { AliasToken } from "antd/es/theme/internal"
import { Pie, type PieConfig } from "@ant-design/plots"
import { tradeTypes } from "@/types"
import { formatDollarClean } from "@/utils/format"
import { brand } from "@/app/brand"
import { chartTokens, sliceFill } from "@/app/chartTheme"

export const PieChartTradeType: FC<{
    theme: MenuTheme
    globalToken: AliasToken
    setTradeType: React.Dispatch<React.SetStateAction<tradeTypes>>
    data: { type: tradeTypes; value: number }[]
}> = ({ theme, setTradeType, data }): React.ReactElement => {
    React.useEffect(() => {
        setTradeType(tradeTypes.total)
    }, [])
    const t = chartTokens(theme)
    const config: PieConfig = {
        data: data.map(({ type, value }, i) => ({ key: type + "_" + i, value, type })),
        angleField: "value",
        colorField: "type",
        innerRadius: 0.5,
        theme,
        padding: 25,
        scale: {
            color: {
                // One gradient per slice, drawn from the shared brand palette.
                range: data.map((_, index) => sliceFill(theme, index)),
            },
        },

        style: {
            inset: 1,
            radius: 4,
        },

        label: {
            text: (d: { value: number }) => `${formatDollarClean(d.value)} USD`,
            position: "outside",
            transform: [{ type: "overlapDodgeY" }],
            // Typography styling must be nested inside the 'style' block
            style: {
                fill: t.axisLabel,
                fontSize: 14,
                fontFamily: "JetBrains Mono, monospace", // Looks clean for transaction numbers
            },
        },

        interaction: {
            elementSelect: { single: true },
        },

        autoFit: true,
        height: 350,
        // maxHeight: 250,

        legend: {
            color: {
                title: false,
                position: "bottom",
                layout: {
                    justifyContent: "center",
                },
                // Style the label text item color directly
                labelFill: t.axisLabel,
            },
        },

        annotations: [
            {
                type: "text",
                style: {
                    text: "Profit",
                    x: "50%",
                    y: "48%", // Shifted up slightly to accommodate subtitle spacing
                    textAlign: "center",
                    textBaseline: "middle",
                    fontSize: 14,
                    fontWeight: "bold",
                    fill: theme === "dark" ? brand.onDark : brand.onLight,
                },
            },
        ],

        state: {
            unselected: { opacity: 0.4 },
            selected: { opacity: 1 },
        },

        animate: { enter: { type: "waveIn", duration: 800 } },

        onReady: ({ chart }) => {
            chart.on("interval:click", (event: { data: { data: { type: tradeTypes } } }) => {
                const clickedType = event.data.data.type
                setTradeType((prevTradeType) => {
                    return prevTradeType.toString() === clickedType ? tradeTypes.total : clickedType
                })
            })
        },
    }

    return <Pie {...config} />
}
