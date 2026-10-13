import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { BarRow, BarRowGroup } from "./BarRow";

/** A row that can be pressed has an action; these tests do not care what it does. */
const press = () => undefined;

function bar(name: string): HTMLElement {
  const found = screen.getByRole("button", { name }).querySelector('[data-part="bar"]');
  if (!(found instanceof HTMLElement)) throw new Error(`The row ${name} has no bar.`);
  return found;
}

describe("BarRow", () => {
  it("is a list for assistive technology: each row is an item that says its label and its values", () => {
    render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow
          label="Civil"
          value="1,515"
          secondaryValue="612 lines"
          fraction={1}
          onPress={press}
        />
        <BarRow
          label="Process"
          value="846"
          secondaryValue="398 lines"
          fraction={0.558}
          onPress={press}
        />
      </BarRowGroup>,
    );
    const list = screen.getByRole("list", { name: "Holds by discipline" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Civil 1,515 612 lines",
      "Process 846 398 lines",
    ]);
    // Every item is a child of the list, and holds the one button of its row.
    for (const item of items) {
      expect(item.parentElement).toBe(list);
      expect(within(item).getAllByRole("button")).toHaveLength(1);
    }
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("is a button named by its label and its values, inside a named list", () => {
    render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow
          label="Civil"
          value="1,515"
          secondaryValue="612 lines"
          fraction={1}
          onPress={press}
        />
      </BarRowGroup>,
    );
    const group = screen.getByRole("list", { name: "Holds by discipline" });
    expect(within(group).getByRole("button", { name: "Civil 1,515 612 lines" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("is reached by Tab and activated by Enter, Space, and a click", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow label="Civil" value="1,515" fraction={1} onPress={onPress} />
        <BarRow label="Piping" value="1,285" fraction={0.848} onPress={onPress} />
      </BarRowGroup>,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Civil 1,515" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.getByRole("button", { name: "Piping 1,285" })).toHaveFocus();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Civil 1,515" }));
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("says when its category is in the active filter", () => {
    render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow label="Process" value="846" fraction={0.558} isSelected onPress={press} />
      </BarRowGroup>,
    );
    expect(screen.getByRole("button", { name: "Process 846" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("draws the bar as long as its share, and never outside the column", () => {
    render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow label="Civil" value="1,515" fraction={1} onPress={press} />
        <BarRow label="Process" value="846" fraction={0.558} onPress={press} />
        <BarRow label="None" value="0" fraction={0} onPress={press} />
        <BarRow label="Over" value="9" fraction={1.4} onPress={press} />
        <BarRow label="Under" value="-1" fraction={-0.2} onPress={press} />
      </BarRowGroup>,
    );
    expect(bar("Civil 1,515").style.inlineSize).toBe("100%");
    expect(bar("Process 846").style.inlineSize).toBe("55.8%");
    expect(bar("None 0").style.inlineSize).toBe("0%");
    expect(bar("Over 9").style.inlineSize).toBe("100%");
    expect(bar("Under -1").style.inlineSize).toBe("0%");
    expect(bar("Civil 1,515")).toHaveAttribute("aria-hidden", "true");
  });

  it("takes the ordinal step of an age band", () => {
    render(
      <BarRowGroup aria-label="Holds by age">
        <BarRow label="0 to 13 days" value="412" fraction={0.4} ordinalStep={1} onPress={press} />
        <BarRow
          label="90 days and over"
          value="1,020"
          fraction={1}
          ordinalStep={5}
          onPress={press}
        />
      </BarRowGroup>,
    );
    expect(bar("0 to 13 days 412")).toHaveAttribute("data-ordinal", "1");
    expect(bar("90 days and over 1,020")).toHaveAttribute("data-ordinal", "5");
  });

  it("on a first load shows skeleton rows and says it is loading", () => {
    render(<BarRowGroup aria-label="Holds by discipline" isLoading skeletonRows={5} />);
    const group = screen.getByRole("list", { name: "Holds by discipline" });
    expect(group).toHaveAttribute("aria-busy", "true");
    expect(group.querySelectorAll('[data-part="skeleton-row"]')).toHaveLength(5);
    expect(within(group).getByText(en.common.loading)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the previous rows, marked stale, during a refetch", () => {
    render(
      <BarRowGroup aria-label="Holds by discipline" isStale>
        <BarRow label="Civil" value="1,515" fraction={1} onPress={press} />
      </BarRowGroup>,
    );
    expect(screen.getByRole("list")).toHaveAttribute("data-stale");
    expect(screen.getByRole("button", { name: "Civil 1,515" })).toBeInTheDocument();
  });

  it("has no accessibility violation at rest, selected, and loading", async () => {
    const { container, rerender } = render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow
          label="Civil"
          value="1,515"
          secondaryValue="612 lines"
          fraction={1}
          onPress={press}
        />
        <BarRow
          label="Process"
          value="846"
          secondaryValue="398 lines"
          fraction={0.558}
          isSelected
          onPress={press}
        />
      </BarRowGroup>,
    );
    await expectAccessible(container);
    rerender(<BarRowGroup aria-label="Holds by discipline" isLoading />);
    await expectAccessible(container);
  });
});

describe("a static BarRow", () => {
  it("shows its label, its bar, and its values, and is not a control", async () => {
    const user = userEvent.setup();
    render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow isStatic label="Civil" value="1,515" secondaryValue="612 lines" fraction={1} />
        <BarRow isStatic label="Process" value="846" secondaryValue="398 lines" fraction={0.558} />
      </BarRowGroup>,
    );
    const group = screen.getByRole("list", { name: "Holds by discipline" });
    const rows = [...group.querySelectorAll<HTMLElement>('[data-part="bar-row"]')];
    expect(rows.map((row) => row.textContent)).toEqual([
      "Civil 1,515 612 lines",
      "Process 846 398 lines",
    ]);
    expect(rows[1]?.querySelector<HTMLElement>('[data-part="bar"]')?.style.inlineSize).toBe(
      "55.8%",
    );
    // Each static row is an item of the list as well, and says the same.
    expect(
      within(group)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Civil 1,515 612 lines", "Process 846 398 lines"]);
    // Nothing to press and nothing to stop at: the keyboard passes the group by.
    expect(within(group).queryByRole("button")).not.toBeInTheDocument();
    expect(rows[0]).not.toHaveAttribute("aria-pressed");
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("has no accessibility violation", async () => {
    const { container } = render(
      <BarRowGroup aria-label="Holds by discipline">
        <BarRow isStatic label="Civil" value="1,515" secondaryValue="612 lines" fraction={1} />
        <BarRow
          isStatic
          label="Unspecified"
          value="241"
          secondaryValue="166 lines"
          fraction={0.159}
        />
      </BarRowGroup>,
    );
    await expectAccessible(container);
  });
});
