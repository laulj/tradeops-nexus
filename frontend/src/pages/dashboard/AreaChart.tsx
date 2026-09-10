import React, { useMemo, type FC } from "react"
import { Area, type AreaConfig } from "@ant-design/plots"
import type { MenuTheme } from "antd"
import type { AliasToken } from "antd/es/theme/internal"
import { formatBalanceByInterval } from "@/pages/profit"
import { views, type balanceResponse } from "@/types"
import { useBalanceQuery } from "@/hooks/useBalance"
import { chartTokens, seriesFill } from "@/app/chartTheme"

export const AreaChart: FC<{
    theme: MenuTheme
    globalToken: AliasToken
    activeAddress: string
}> = ({ theme, activeAddress }): React.ReactElement => {
    const { data, isLoading } = useBalanceQuery()

    const balances = useMemo(() => {
        const balanceDefault = data && Object.keys(data).length !== 0 ? data["USDC"] : []
        if (activeAddress === "ALL") return balanceDefault

        return balanceDefault.filter((d: balanceResponse) => d.address === activeAddress)
    }, [activeAddress, data])

    const chartData = useMemo(() => {
        if (balances) {
            // console.time("AreaChart")
            const splitLength = 100
            let _chartData: balanceResponse[]

            const dataByDay = formatBalanceByInterval(views.Daily, balances).map((data) => {
                return { ...data, amount: Number(data.amount.toFixed(0)) }
            })
            const dataByWeek = formatBalanceByInterval(views.Weekly, balances).map((data) => {
                return { ...data, amount: Number(data.amount.toFixed(0)) }
            })
            const dataByMonth = formatBalanceByInterval(views.Monthly, balances).map((data) => {
                return { ...data, amount: Number(data.amount.toFixed(0)) }
            })
            if (dataByWeek.length > splitLength) _chartData = dataByMonth
            else if (dataByDay.length > splitLength) _chartData = dataByWeek
            else _chartData = dataByDay

            return _chartData
        }
        return []
    }, [balances])

    const t = chartTokens(theme)

    const config: AreaConfig = {
        data: {
            value: chartData,
        },
        xField: (d: balanceResponse) => {
            try {
                const ISODate = new Date(d.timestamp).toISOString().split("T")[0]
                const [year, month, day] = ISODate.split("-")
                return `${month}-${day}-${year[2] + year[3]}`
            } catch (err: unknown) {
                console.error(d.timestamp, err)
            }
        },
        yField: "amount",

        // Shared brand gradient (indigo → emerald) from chartTheme.
        style: {
            fill: seriesFill(theme),
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
                labelFill: t.axisLabel,
                labelFontSize: 12,
                lineStroke: t.gridLine,
            },
            x: {
                labelTransform: "rotate(90)",
                labelFill: t.axisLabel,
                labelFontSize: 12,
                gridStroke: t.gridLine,
                gridLineDash: [4, 4],
            },
        },

        line: {
            style: {
                stroke: t.line,
                strokeWidth: 2,
            },
        },
        autoFit: true,
        padding: "auto",
        theme: theme,
        className: `myCard ${theme} w-full`,
        loading: isLoading,
        loadingTemplate: <></>,
    }

    return <Area {...config} />
}
