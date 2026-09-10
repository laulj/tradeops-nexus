import React, { type FC, useEffect, useState } from "react"
import { Typography } from "antd"
import ReactCountUp from "react-countup"
import { formattingTimeDurationFn } from "@/utils/format"
import { getUptime } from "@/api/backend"
import { useInterval } from "@/hooks/useInterval"

// Safely pluck the component function regardless of how Vite packages it
const CountUp = (ReactCountUp as { default?: typeof ReactCountUp }).default ?? ReactCountUp
const { Text } = Typography

export const UpTime: FC<{
    address: string
    symbol: string
    isRunning: boolean
}> = ({ address, symbol, isRunning }): React.ReactElement => {
    const [upTime, setUpTime] = useState<number>(0)
    const fetchUpTime = async () => {
        const res = await getUptime(address, symbol)

        if (res && res[symbol])
            if (res[symbol].start && res[symbol].end) {
                if (Number(res[symbol].end) !== Date.now()) {
                    const _upTime = Date.now() - Number(res[symbol].start)

                    if (_upTime !== upTime) setUpTime(_upTime)
                }
            } else setUpTime(0)
        else setUpTime(0)
    }
    useEffect(() => {
        if (isRunning)
            (async () => {
                await fetchUpTime()
            })()
    }, [isRunning])

    // Update upTime every 60s
    useInterval(() => {
        const nextTick = upTime + 1 * 1000
        if (nextTick !== upTime) setUpTime(isRunning ? (upTime !== 0 ? nextTick : 0) : 0)
    }, 1000)
    useInterval(() => (isRunning ? fetchUpTime() : null), 60000)

    const formattedUpTime = formattingTimeDurationFn(upTime)

    return (
        <div className="flex flex-row flex-nowrap justify-end pe-4">
            {formattedUpTime.days !== 0 ? (
                <div className="flex flex-row me-1">
                    <CountUp start={formattedUpTime.days} end={formattedUpTime.days} duration={1000} />

                    <Text className="ms-1 text-nowrap">days</Text>
                </div>
            ) : (
                <></>
            )}
            {formattedUpTime.hrs !== 0 ? (
                <div className="flex flex-row me-1">
                    <div>
                        <CountUp start={formattedUpTime.hrs} end={formattedUpTime.hrs} duration={1000} />
                    </div>
                    <Text className="text-nowrap">hrs</Text>
                </div>
            ) : (
                <></>
            )}
            <div className="flex flex-row me-1">
                <div>
                    <CountUp start={formattedUpTime.mins} end={formattedUpTime.mins} duration={1000} />
                </div>
                <Text className="ms-1 text-nowrap">mins</Text>
            </div>

            <div className="flex flex-row">
                <div>
                    <CountUp start={formattedUpTime.secs ?? 0} end={formattedUpTime.secs ?? 0} duration={1000} />
                </div>
                <Text className="ms-1 text-nowrap" style={{ alignSelf: "center" }}>
                    s
                </Text>
            </div>
        </div>
    )
}
