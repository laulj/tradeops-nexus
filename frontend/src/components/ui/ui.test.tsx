import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { LiveDot, MetricTile, Panel, SectionLabel, SegmentedPill, Sparkline, Tag } from "@/components/ui"

describe("ui primitives", () => {
    it("Panel renders its label and children", () => {
        render(<Panel label="Cumulative profit">body</Panel>)
        expect(screen.getByText("Cumulative profit")).toBeInTheDocument()
        expect(screen.getByText("body")).toBeInTheDocument()
    })

    it("Panel omits the header when there is no label or right slot", () => {
        const { container } = render(<Panel>body</Panel>)
        expect(container.querySelector("header")).toBeNull()
    })

    it("MetricTile shows label, value and sub-line", () => {
        render(<MetricTile label="Total value" value="$204,110" sub="across 9 venues" tone="gold" />)
        expect(screen.getByText("Total value")).toBeInTheDocument()
        expect(screen.getByText("$204,110")).toBeInTheDocument()
        expect(screen.getByText("across 9 venues")).toBeInTheDocument()
    })

    it("Tag applies its tone class", () => {
        const { container } = render(<Tag tone="earn">earn</Tag>)
        expect(container.querySelector(".nexus-tag--earn")).not.toBeNull()
    })

    it("SegmentedPill marks the active option and fires onChange", () => {
        const onChange = vi.fn()
        render(
            <SegmentedPill
                options={[
                    { value: "a", label: "A" },
                    { value: "b", label: "B" },
                ]}
                value="a"
                onChange={onChange}
            />,
        )
        const tabs = screen.getAllByRole("tab")
        expect(tabs[0]).toHaveAttribute("data-active", "true")
        expect(tabs[1]).toHaveAttribute("data-active", "false")

        fireEvent.click(tabs[1])
        expect(onChange).toHaveBeenCalledWith("b")
    })

    it("LiveDot renders its label", () => {
        render(<LiveDot label="streaming" />)
        expect(screen.getByText("streaming")).toBeInTheDocument()
    })

    it("Sparkline falls back to a dash for < 2 points and renders an svg otherwise", () => {
        const { container, rerender } = render(<Sparkline values={[1]} />)
        expect(container.querySelector("svg")).toBeNull()

        rerender(<Sparkline values={[1, 2, 3]} />)
        expect(container.querySelector("svg")).not.toBeNull()
    })

    it("SectionLabel renders its children", () => {
        render(<SectionLabel>Section</SectionLabel>)
        expect(screen.getByText("Section")).toBeInTheDocument()
    })
})
