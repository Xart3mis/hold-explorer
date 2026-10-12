import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatPercent } from "../../text/format";
import { expectAccessible } from "../../test/axe";
import { Progress } from "./Progress";

function fill(): HTMLElement {
  const found = screen.getByRole("progressbar").querySelector('[data-part="fill"]');
  if (!(found instanceof HTMLElement)) throw new Error("The progress bar has no fill.");
  return found;
}

describe("Progress", () => {
  it("is a progress bar named by the label above it", () => {
    render(<Progress label="Reading rows, 4,200 of 9,300" value={0.45} />);
    const bar = screen.getByRole("progressbar", { name: "Reading rows, 4,200 of 9,300" });
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Reading rows, 4,200 of 9,300")).toBeVisible();
    expect(screen.getByText(formatPercent(0.45))).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuetext", formatPercent(0.45));
  });

  it("writes its percentage with the formatter of the app, rounded to a whole number", () => {
    render(<Progress label="Reading rows" value={0.456} />);
    expect(screen.getByText("46%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "46%");
  });

  it("moves its fill along the track by a transform, never by a width", () => {
    const { rerender } = render(<Progress label="Reading rows" value={0.45} />);
    expect(fill().style.transform).toBe("translateX(-55%)");
    expect(fill().style.width).toBe("");

    rerender(<Progress label="Reading rows" value={1} />);
    expect(fill().style.transform).toBe("translateX(0%)");
    rerender(<Progress label="Reading rows" value={0} />);
    expect(fill().style.transform).toBe("translateX(-100%)");
  });

  it("keeps a value outside the range inside the track", () => {
    const { rerender } = render(<Progress label="Reading rows" value={1.7} />);
    expect(fill().style.transform).toBe("translateX(0%)");
    rerender(<Progress label="Reading rows" value={-3} />);
    expect(fill().style.transform).toBe("translateX(-100%)");
  });

  it("without a value is indeterminate, and the label carries the state", () => {
    render(<Progress label="Reading the file" />);
    const bar = screen.getByRole("progressbar", { name: "Reading the file" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("data-indeterminate");
    expect(bar.querySelector('[data-part="fill"]')).toBeNull();
    expect(bar.querySelector('[data-part="segment"]')).not.toBeNull();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("has no accessibility violation, determinate and indeterminate", async () => {
    const { container } = render(
      <>
        <Progress label="Reading rows, 4,200 of 9,300" value={0.45} />
        <Progress label="Reading the file" />
      </>,
    );
    await expectAccessible(container);
  });
});
