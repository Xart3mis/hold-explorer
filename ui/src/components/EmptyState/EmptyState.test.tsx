import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says what is absent in a heading and why in a sentence", () => {
    render(
      <EmptyState title="No holds match these filters">
        3 filters are active and together they hide every hold in this snapshot.
      </EmptyState>,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "No holds match these filters" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 filters are active/)).toBeInTheDocument();
  });

  it("offers one action, reached and activated by the keyboard", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        title="No holds match these filters"
        action={<Button onPress={onPress}>Clear all</Button>}
      >
        Remove a filter, or clear them all.
      </EmptyState>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Clear all" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("sits lower on an empty page than inside a table area", () => {
    const { container, rerender } = render(
      <EmptyState title="No snapshots">Import a file.</EmptyState>,
    );
    expect(container.firstElementChild).toHaveAttribute("data-placement", "page");
    rerender(
      <EmptyState title="No snapshots" placement="table">
        Import a file.
      </EmptyState>,
    );
    expect(container.firstElementChild).toHaveAttribute("data-placement", "table");
  });

  it("has no accessibility violation", async () => {
    const { container } = render(
      <EmptyState title="No holds match these filters" action={<Button>Clear all</Button>}>
        Remove a filter, or clear them all.
      </EmptyState>,
    );
    await expectAccessible(container);
  });
});
