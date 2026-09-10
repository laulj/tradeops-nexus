import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { DollarIcon, HeartIcon, IncreaseIcon } from "@/components/icons"

describe("icons", () => {
    it.each([
        ["HeartIcon", HeartIcon],
        ["DollarIcon", DollarIcon],
        ["IncreaseIcon", IncreaseIcon],
    ] as const)("renders %s as an SVG icon", (_name, Icon) => {
        const { container } = render(<Icon />)
        expect(container.querySelector("svg")).not.toBeNull()
    })
})
