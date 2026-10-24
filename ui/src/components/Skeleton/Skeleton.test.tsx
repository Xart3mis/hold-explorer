import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.firstElementChild).toHaveAttribute("data-part", "skeleton");
  });

  it("stands for a line of text unless told otherwise, and takes the width of what it stands for", () => {
    const { container } = render(
      <>
        <Skeleton width="12ch" />
        <Skeleton variant="stat" />
        <Skeleton variant="bar" width="60%" />
      </>,
    );
    const [line, stat, bar] = [...container.children] as HTMLElement[];
    expect(line).toHaveAttribute("data-variant", "text");
    expect(line?.style.inlineSize).toBe("12ch");
    expect(stat).toHaveAttribute("data-variant", "stat");
    expect(bar).toHaveAttribute("data-variant", "bar");
    expect(bar?.style.inlineSize).toBe("60%");
  });

  it("has no accessibility violation", async () => {
    const { container } = render(<Skeleton />);
    await expectNoAxeViolations(container);
  });
});
