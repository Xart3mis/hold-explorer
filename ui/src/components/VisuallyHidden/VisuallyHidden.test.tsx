import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectAccessible } from "../../test/axe";
import { VisuallyHidden } from "./VisuallyHidden";

describe("VisuallyHidden", () => {
  it("keeps its text for assistive technology and takes it off the screen", () => {
    render(
      <button type="button">
        <VisuallyHidden>Remove the filter Discipline</VisuallyHidden>
      </button>,
    );
    expect(
      screen.getByRole("button", { name: "Remove the filter Discipline" }),
    ).toBeInTheDocument();
    const hidden = screen.getByText("Remove the filter Discipline");
    expect(hidden.style.position).toBe("absolute");
    expect(hidden.style.overflow).toBe("hidden");
    expect(hidden).not.toHaveAttribute("aria-hidden");
    expect(hidden).not.toHaveAttribute("hidden");
  });

  it("renders the element it is asked for", () => {
    render(<VisuallyHidden elementType="h2">Filters</VisuallyHidden>);
    expect(screen.getByRole("heading", { level: 2, name: "Filters" })).toBeInTheDocument();
  });

  it("has no accessibility violation", async () => {
    const { container } = render(
      <p>
        4 <VisuallyHidden>rows</VisuallyHidden>
      </p>,
    );
    await expectAccessible(container);
  });
});
