import React, { type FC } from "react"
import { Column, type ColumnConfig } from "@ant-design/plots"
import type { MenuTheme } from "antd"
import type { AliasToken } from "antd/es/theme/internal"
import type { aggregatedProfitResp } from "@/types"
import { chartTokens, seriesFill } from "@/app/chartTheme"

export const BarChart: FC<{
    theme: MenuTheme
    globalToken: AliasToken
    data: aggregatedProfitResp[]
}> = ({ theme, data }): React.ReactElement => {
    const t = chartTokens(theme)
    const config: ColumnConfig = {
        data: {
            // Copy before sorting so we never mutate the prop array in place.
            value: [...data].sort((a, b) => new Date(a.timestamp).valueOf() - new Date(b.timestamp).valueOf()),
        },
        xField: (d: aggregatedProfitResp) => {
            const ISODate = new Date(d.timestamp).toISOString().split("T")[0]
            const [year, month, day] = ISODate.split("-")
            return `${month}-${day}-${year[2] + year[3]}`
        },
        yField: "amount",

        // Shared brand gradient (indigo → emerald) from chartTheme.
        style: {
            fill: seriesFill(theme),
            radiusTopLeft: 4,
            radiusTopRight: 4,
        },

        slider: {
            x: {
                values: [0, 1],
                textFill: t.sliderText,
                handleFill: t.sliderHandle,
            },
        },

        axis: {
            y: {
                labelFormatter: "~s",
                labelStyle: {
                    fill: t.axisLabel,
                    fontSize: 11,
                },
                gridStroke: t.gridLine,
            },
            x: {
                labelStyle: {
                    fill: t.axisLabel,
                    fontSize: 10,
                },
                // Avoids text clipping during responsive resizing passes
                labelTransform: "rotate(90)",
            },
        },

        autoFit: true,
        theme: theme,
        className: `myCard ${theme} w-full`,
    }

    return <Column {...config} />
}
