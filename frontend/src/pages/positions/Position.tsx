import { useState, type FC } from "react"
import { Tabs } from "antd"
import { tradeTypes } from "@/types"

import SFOPositions from "@/pages/positions/SFOpenPosition"
import FROPosition from "@/pages/positions/FROpenPosition"
import { Panel } from "@/components/ui"

export const OpenPositions: FC = (): React.ReactElement => {
    const [, setTradeType] = useState<keyof typeof tradeTypes>(tradeTypes.spot)

    const items = [
        {
            label: "SpotFuture",
            key: `spotFutureTab`,
            children: <SFOPositions />,
        },
        {
            label: "FundingRate",
            key: `fundingRateTab`,
            children: <FROPosition />,
        },
    ]

    const tradeTypeOnChange = (e: string) => {
        setTradeType(e.split("T")[0] as tradeTypes)
    }
    return (
        <Panel label="Opened positions">
            <Tabs size="small" onChange={tradeTypeOnChange} items={items} animated={true} />
        </Panel>
    )
}
