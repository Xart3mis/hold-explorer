import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriangleAlert } from "lucide-react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("shows its text, and is neutral unless a tone is given", () => {
    render(<Tag>Soon</Tag>);
    const tag = screen.getByText("Soon");
    expect(tag.closest('[data-part="tag"]')).toHaveAttribute("data-tone", "neutral");
  });

  it("carries the icon of a state tone, hidden from assistive technology", () => {
    render(
      <Tag tone="warning" icon={TriangleAlert}>
        Size mismatch
      </Tag>,
    );
    const tag = screen.getByText("Size mismatch").closest('[data-part="tag"]');
    expect(tag).toHaveAttribute("data-tone", "warning");
    expect(tag?.querySelectorAll("svg")).toHaveLength(1);
    expect(tag?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    // The words are all it says: the icon adds nothing to its text.
    expect(tag).toHaveTextContent(/^Size mismatch$/);
  });

  it.each(["info", "warning", "danger", "success"] as const)("takes the tone %s", (tone) => {
    render(
      <Tag tone={tone} icon={TriangleAlert}>
        Stale
      </Tag>,
    );
    expect(screen.getByText("Stale").closest('[data-part="tag"]')).toHaveAttribute(
      "data-tone",
      tone,
    );
  });

  it("is not a control: it has no role and takes no focus", async () => {
    const user = userEvent.setup();
    render(<Tag>Limited</Tag>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("has no accessibility violation in any tone", async () => {
    const { container } = render(
      <>
        <Tag>Soon</Tag>
        <Tag tone="info" icon={TriangleAlert}>
          Older snapshot
        </Tag>
        <Tag tone="warning" icon={TriangleAlert}>
          Size mismatch
        </Tag>
        <Tag tone="danger" icon={TriangleAlert}>
          Overdue
        </Tag>
        <Tag tone="success" icon={TriangleAlert}>
          Released
        </Tag>
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
