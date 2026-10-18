import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, useState } from "react";
import { TableLayout } from "react-aria-components";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import { scrollTable, tableViewport } from "../../test/viewport";
import {
  DataTable,
  type DataTableChildColumn,
  type DataTableChildren,
  type DataTableColumn,
} from "./DataTable";

interface Group {
  key: string;
  label: string;
  holds: number;
}

interface Member {
  id: string;
  holds: number;
}

const groups: Group[] = [
  { key: "PIPING", label: "Piping", holds: 40 },
  { key: "STRESS", label: "Stress", holds: 12 },
  { key: "CIVIL", label: "Civil", holds: 3 },
];

const columns: DataTableColumn<Group>[] = [
  {
    id: "label",
    header: "Discipline",
    isRowHeader: true,
    size: { flex: 1, minChars: 20 },
    cell: (group) => group.label,
  },
  {
    id: "holds",
    header: "Holds",
    kind: "number",
    size: { chars: 6 },
    cell: (group) => group.holds,
  },
];

const childColumns: DataTableChildColumn<Member>[] = [
  { column: "label", kind: "identifier", cell: (member) => member.id },
  { column: "holds", kind: "number", cell: (member) => member.holds },
];

function members(group: string, count: number): Member[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${group}-LINE-${String(index + 1).padStart(3, "0")}`,
    holds: (index % 5) + 1,
  }));
}

/** The children every group has unless a test says otherwise: two lines, all there. */
function readChildren(group: Group): DataTableChildren<Member> {
  return { rows: members(group.key, 2) };
}

interface TreeProps {
  rows?: readonly Group[];
  childRows?: (group: Group) => DataTableChildren<Member> | undefined;
  initiallyExpanded?: readonly string[];
  onExpandedChange?: (keys: ReadonlySet<string>) => void;
  onSelectionChange?: (key: string) => void;
  selectedKey?: string | null;
  onChildSelectionChange?: (member: Member) => void;
  selectedChildKey?: string | null;
  onLoadMore?: () => void;
  resultKey?: string;
  countText?: (shown: number, total: number) => string;
  height?: "fill" | { maxRows: number };
}

/** A table of groups whose screen holds which groups are expanded, as a page does. */
function Tree({
  rows = groups,
  childRows = readChildren,
  initiallyExpanded = [],
  onExpandedChange,
  ...props
}: TreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(initiallyExpanded));
  return (
    <DataTable
      aria-label="Holds by discipline"
      columns={columns}
      rows={rows}
      rowKey={(group) => group.key}
      childRows={childRows}
      childKey={(member) => member.id}
      childColumns={childColumns}
      expandedKeys={expanded}
      onExpandedChange={(keys) => {
        setExpanded(keys);
        onExpandedChange?.(keys);
      }}
      {...props}
    />
  );
}

/** A value a test knows to be there. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`The test expected ${what}.`);
  return value;
}

function treeRows(): HTMLElement[] {
  return within(screen.getByRole("treegrid")).getAllByRole("row").slice(1);
}

/** The row whose header cell reads this text. */
function rowNamed(name: string): HTMLElement {
  const row = screen.getByRole("rowheader", { name }).closest<HTMLElement>('[role="row"]');
  if (row === null) throw new Error(`No row is named ${name}.`);
  return row;
}

/**
 * The chevron of a group. It is for the pointer: the row says to assistive technology whether it
 * is expanded, and Right and Left turn it, so the chevron is hidden from it and out of the Tab order.
 */
function chevron(name: string): HTMLElement {
  const found = rowNamed(name).querySelector<HTMLElement>('[data-part="chevron"]');
  if (found === null) throw new Error(`The row ${name} has no chevron.`);
  expect(found.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(found).toHaveAttribute("tabindex", "-1");
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataTable with rows that expand", () => {
  it("is a tree grid: a group is a row of the first level that says it is collapsed", () => {
    render(<Tree />);
    const grid = screen.getByRole("treegrid", { name: "Holds by discipline" });
    expect(grid).toBeInTheDocument();
    const rows = treeRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveAttribute("aria-level", "1");
      expect(row).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("shows the child rows of an expanded group on the second level, after their group", () => {
    render(<Tree initiallyExpanded={["STRESS"]} />);
    const rows = treeRows();
    expect(rows).toHaveLength(5);
    expect(rowNamed("Stress")).toHaveAttribute("aria-expanded", "true");
    const child = rowNamed("STRESS-LINE-001");
    expect(child).toHaveAttribute("aria-level", "2");
    expect(child).not.toHaveAttribute("aria-expanded");
    expect(rows.indexOf(child)).toBe(rows.indexOf(rowNamed("Stress")) + 1);
    expect(rows[3]).toBe(rowNamed("STRESS-LINE-002"));
    // A child cell takes the kind its own column declares, in the track of its parent's column.
    expect(screen.getByRole("rowheader", { name: "STRESS-LINE-001" })).toHaveAttribute(
      "data-kind",
      "identifier",
    );
  });

  it("expands and collapses a group by its chevron and by a press on the row", async () => {
    const onExpandedChange = vi.fn();
    const user = userEvent.setup();
    render(<Tree onExpandedChange={onExpandedChange} />);

    await user.click(chevron("Piping"));
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["PIPING"]));
    expect(rowNamed("PIPING-LINE-001")).toBeInTheDocument();
    expect(rowNamed("Piping")).toHaveAttribute("data-expanded");

    // A press anywhere on the group turns it, as the chevron does.
    await user.click(within(rowNamed("Piping")).getByText("40"));
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set());
    expect(screen.queryByRole("rowheader", { name: "PIPING-LINE-001" })).not.toBeInTheDocument();

    await user.click(within(rowNamed("Civil")).getByText("Civil"));
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["CIVIL"]));
  });

  it(
    "expands with Right, collapses with Left, and goes from a child row to its group with Left",
    SLOW,
    async () => {
      const user = userEvent.setup();
      render(<Tree />);

      await user.tab();
      expect(rowNamed("Piping")).toHaveFocus();
      await user.keyboard("{ArrowRight}");
      expect(rowNamed("Piping")).toHaveAttribute("aria-expanded", "true");
      expect(rowNamed("Piping")).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(rowNamed("PIPING-LINE-001")).toHaveFocus();
      await user.keyboard("{ArrowLeft}");
      expect(rowNamed("Piping")).toHaveFocus();
      await user.keyboard("{ArrowLeft}");
      expect(rowNamed("Piping")).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("rowheader", { name: "PIPING-LINE-001" })).not.toBeInTheDocument();
      // Enter on a group turns it as a press does.
      await user.keyboard("{ArrowDown}{Enter}");
      expect(rowNamed("Stress")).toHaveAttribute("aria-expanded", "true");
    },
  );

  describe("gives the focus in the children of a row that collapses to that row", () => {
    /** Focus on the first child of Piping, which is expanded. */
    async function focusFirstChild(user: ReturnType<typeof userEvent.setup>) {
      rowNamed("Piping").focus();
      await user.keyboard("{ArrowDown}");
      expect(rowNamed("PIPING-LINE-001")).toHaveFocus();
    }

    /** Down from the group reaches the next group: the keyboard is not left among hidden rows. */
    async function expectOnGroup(user: ReturnType<typeof userEvent.setup>) {
      expect(rowNamed("Piping")).toHaveAttribute("aria-expanded", "false");
      expect(rowNamed("Piping")).toHaveFocus();
      await user.keyboard("{ArrowDown}");
      expect(rowNamed("Stress")).toHaveFocus();
    }

    // The children of every row are there, the same at every render, as a screen holds them.
    const held = new Map(groups.map((group) => [group.key, readChildren(group)]));

    it("by Left on a child, and Left again", async () => {
      const user = userEvent.setup();
      render(<Tree initiallyExpanded={["PIPING"]} childRows={(group) => held.get(group.key)} />);
      await focusFirstChild(user);
      await user.keyboard("{ArrowLeft}{ArrowLeft}");
      await expectOnGroup(user);
    });

    it("by the chevron", async () => {
      const user = userEvent.setup();
      render(<Tree initiallyExpanded={["PIPING"]} childRows={(group) => held.get(group.key)} />);
      await focusFirstChild(user);
      await user.click(chevron("Piping"));
      await expectOnGroup(user);
    });

    it("by the action of a notice row, chosen with Enter", async () => {
      const user = userEvent.setup();
      function Screen() {
        const [open, setOpen] = useState<ReadonlySet<string>>(new Set(["PIPING"]));
        return (
          <DataTable
            aria-label="Holds by discipline"
            columns={columns}
            rows={groups}
            rowKey={(group) => group.key}
            childRows={(group) =>
              group.key === "PIPING"
                ? {
                    rows: [],
                    notice: {
                      text: "The filters keep none of it.",
                      action: "Collapse",
                      onAction: () => {
                        setOpen(new Set());
                      },
                    },
                  }
                : held.get(group.key)
            }
            childKey={(member) => member.id}
            childColumns={childColumns}
            expandedKeys={open}
            onExpandedChange={setOpen}
          />
        );
      }
      render(<Screen />);
      rowNamed("Piping").focus();
      await user.keyboard("{ArrowDown}");
      const notice = must(document.querySelector("[data-part='notice-row']"), "the notice row");
      expect(notice).toHaveFocus();
      await user.keyboard("{Enter}");
      await expectOnGroup(user);
    });

    it("by the screen, as when the address changes", async () => {
      const user = userEvent.setup();
      const table = (expanded: ReadonlySet<string>) => (
        <DataTable
          aria-label="Holds by discipline"
          columns={columns}
          rows={groups}
          rowKey={(group) => group.key}
          childRows={(group) => held.get(group.key)}
          childKey={(member) => member.id}
          childColumns={childColumns}
          expandedKeys={expanded}
          onExpandedChange={() => undefined}
        />
      );
      const { rerender } = render(table(new Set(["PIPING"])));
      await focusFirstChild(user);
      rerender(table(new Set()));
      await expectOnGroup(user);
    });
  });

  it("shows one skeleton child row while the children are read, which takes no focus", async () => {
    const user = userEvent.setup();
    render(
      <Tree
        initiallyExpanded={["PIPING"]}
        childRows={(group) =>
          group.key === "PIPING" ? { rows: [], isLoading: true } : readChildren(group)
        }
      />,
    );
    const rows = treeRows();
    expect(rows).toHaveLength(4);
    const loading = rows[1];
    if (loading === undefined) throw new Error("No loading row.");
    expect(loading).toHaveAttribute("data-part", "loading-row");
    expect(loading).toHaveAttribute("aria-level", "2");
    expect(loading).toHaveTextContent(en.table.childLoading);
    expect(within(loading).getAllByRole("gridcell", { hidden: true }).length).toBeGreaterThan(0);

    await user.tab();
    expect(rowNamed("Piping")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    // The placeholder is passed over: the next group has the focus.
    expect(rowNamed("Stress")).toHaveFocus();
  });

  it(
    "shows an error child row whose retry, or Enter on it, reads the children again",
    SLOW,
    async () => {
      const onRetry = vi.fn();
      const user = userEvent.setup();
      render(
        <Tree
          initiallyExpanded={["PIPING"]}
          childRows={(group) =>
            group.key === "PIPING"
              ? { rows: [], error: { text: "The lines could not be read.", onRetry } }
              : readChildren(group)
          }
        />,
      );
      const row = treeRows()[1];
      if (row === undefined) throw new Error("No error row.");
      expect(row).toHaveAttribute("data-part", "error-row");
      expect(row).toHaveTextContent("The lines could not be read.");
      await user.click(within(row).getByRole("button", { name: en.common.retry }));
      expect(onRetry).toHaveBeenCalledTimes(1);

      rowNamed("Piping").focus();
      await user.keyboard("{ArrowDown}");
      expect(row).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(onRetry).toHaveBeenCalledTimes(2);
    },
  );

  it("ends the children with a row that leads on, pressed or chosen with Enter", SLOW, async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <Tree
        initiallyExpanded={["PIPING"]}
        childRows={(group) => ({
          ...readChildren(group),
          more: { text: "Open all 900 lines in Lines", onAction },
        })}
      />,
    );
    const more = treeRows()[3];
    if (more === undefined) throw new Error("No last row.");
    expect(more).toHaveAttribute("data-part", "more-row");
    expect(more).toHaveTextContent("Open all 900 lines in Lines");
    await user.click(within(more).getByText("Open all 900 lines in Lines"));
    expect(onAction).toHaveBeenCalledTimes(1);

    rowNamed("Piping").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(more).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it(
    "says why a row has no children to show, with what to do, pressed or chosen with Enter",
    SLOW,
    async () => {
      const onAction = vi.fn();
      const user = userEvent.setup();
      render(
        <Tree
          initiallyExpanded={["PIPING"]}
          childRows={(group) =>
            group.key === "PIPING"
              ? {
                  rows: [],
                  notice: { text: "The filters keep none of it.", action: "Collapse", onAction },
                }
              : readChildren(group)
          }
        />,
      );
      const row = treeRows()[1];
      if (row === undefined) throw new Error("No notice row.");
      expect(row).toHaveAttribute("data-part", "notice-row");
      expect(row).toHaveAttribute("aria-level", "2");
      expect(row).toHaveTextContent("The filters keep none of it.");
      await user.click(within(row).getByRole("button", { name: "Collapse" }));
      expect(onAction).toHaveBeenCalledTimes(1);
      rowNamed("Piping").focus();
      await user.keyboard("{ArrowDown}");
      expect(row).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(onAction).toHaveBeenCalledTimes(2);
    },
  );

  it(
    "selects child rows, never a group, and marks every row of the child that is selected",
    SLOW,
    async () => {
      const onChildSelectionChange = vi.fn();
      const onExpandedChange = vi.fn();
      const user = userEvent.setup();
      // The same line is in two groups.
      const shared = (group: Group): DataTableChildren<Member> => ({
        rows: [{ id: "SHARED-001", holds: 1 }, ...members(group.key, 1)],
      });
      render(
        <Tree
          initiallyExpanded={["PIPING", "STRESS"]}
          childRows={shared}
          selectedChildKey="SHARED-001"
          onChildSelectionChange={onChildSelectionChange}
          onExpandedChange={onExpandedChange}
        />,
      );
      const marked = treeRows().filter((row) => row.getAttribute("aria-selected") === "true");
      expect(marked).toHaveLength(2);
      expect(rowNamed("Piping")).not.toHaveAttribute("aria-selected", "true");
      // A group cannot be selected, so it does not say it is not selected.
      expect(rowNamed("Piping")).not.toHaveAttribute("aria-selected");

      await user.click(within(rowNamed("STRESS-LINE-001")).getByText("STRESS-LINE-001"));
      expect(onChildSelectionChange).toHaveBeenCalledWith({ id: "STRESS-LINE-001", holds: 1 });

      // A group is turned, not selected.
      await user.click(within(rowNamed("Civil")).getByText("Civil"));
      expect(onChildSelectionChange).toHaveBeenCalledTimes(1);
      expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["PIPING", "STRESS", "CIVIL"]));

      // Enter on a child row selects it; the focus moves across groups and children alike.
      rowNamed("Piping").focus();
      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(rowNamed("PIPING-LINE-001")).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(onChildSelectionChange).toHaveBeenLastCalledWith({ id: "PIPING-LINE-001", holds: 1 });
    },
  );

  it("keeps a group selectable where the screen asks for that, and turns it then by its chevron", async () => {
    const onSelectionChange = vi.fn();
    const onExpandedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Tree
        onSelectionChange={onSelectionChange}
        onExpandedChange={onExpandedChange}
        selectedKey="CIVIL"
      />,
    );
    expect(rowNamed("Civil")).toHaveAttribute("aria-selected", "true");
    await user.click(within(rowNamed("Stress")).getByText("Stress"));
    expect(onSelectionChange).toHaveBeenCalledWith("STRESS");
    expect(onExpandedChange).not.toHaveBeenCalled();
    await user.click(chevron("Stress"));
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(["STRESS"]));
  });

  it("turns a row whose children it has in one render of its own, and no layout more", () => {
    let commits = 0;
    // The children of every row are there from the start, the same at every render, as a screen
    // holds them once it read them.
    const held = new Map(groups.map((group) => [group.key, readChildren(group)]));
    // The table asks for the key of every row once when it renders.
    const rowKey = vi.fn((group: Group) => group.key);
    const table = (expanded: ReadonlySet<string>) => (
      <Profiler
        id="tree"
        onRender={() => {
          commits += 1;
        }}
      >
        <DataTable
          aria-label="Holds by discipline"
          columns={columns}
          rows={groups}
          rowKey={rowKey}
          childRows={(group) => held.get(group.key)}
          childKey={(member) => member.id}
          childColumns={childColumns}
          expandedKeys={expanded}
          onExpandedChange={() => undefined}
        />
      </Profiler>
    );
    const { rerender } = render(table(new Set()));
    rerender(table(new Set(["PIPING"])));
    expect(rowNamed("PIPING-LINE-001")).toBeInTheDocument();
    const layouts = vi.spyOn(TableLayout.prototype, "update");
    for (const expanded of [new Set<string>(), new Set(["PIPING"])]) {
      commits = 0;
      rowKey.mockClear();
      layouts.mockClear();
      rerender(table(expanded));
      expect(screen.queryAllByRole("rowheader", { name: "PIPING-LINE-001" })).toHaveLength(
        expanded.size,
      );
      // One render of the table, which changes the rows that are drawn, and no other.
      expect(rowKey).toHaveBeenCalledTimes(groups.length);
      // The library lays out the rows of that render, and once more when it has measured them;
      // children that came into the table later would cost a render and a layout more.
      expect(layouts.mock.calls.length).toBeLessThanOrEqual(2);
      expect(commits).toBeLessThanOrEqual(2);
    }
  });

  it("counts the groups in its count line, not their child rows", () => {
    render(
      <Tree
        initiallyExpanded={["PIPING"]}
        countText={(shown, total) => `${String(shown)} of ${String(total)} disciplines`}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 disciplines");
  });

  it(
    "has no accessibility violation collapsed, expanded, loading, failed, and leading on",
    SLOW,
    async () => {
      const { rerender } = render(<Tree />);
      await expectAccessible();
      // Another tree: the screen holds the keys it is first given.
      rerender(
        <Tree
          key="expanded"
          initiallyExpanded={["PIPING", "STRESS", "CIVIL"]}
          onChildSelectionChange={() => undefined}
          selectedChildKey="PIPING-LINE-001"
          childRows={(group) =>
            group.key === "PIPING"
              ? { ...readChildren(group), more: { text: "Open all", onAction: () => undefined } }
              : group.key === "STRESS"
                ? { rows: [], isLoading: true }
                : { rows: [], error: { text: "Not read.", onRetry: () => undefined } }
          }
        />,
      );
      await expectAccessible();
    },
  );
});

describe("DataTable with rows that expand, in a viewport", () => {
  // Eleven rows fit under the header.
  const ROW = 36;
  tableViewport({ width: 1024, height: 400 + ROW });

  const many: Group[] = Array.from({ length: 30 }, (_, index) => ({
    key: `G${String(index + 1).padStart(2, "0")}`,
    label: `Group ${String(index + 1)}`,
    holds: 100 - index,
  }));
  const twoHundred = (group: Group): DataTableChildren<Member> =>
    group.key === "G01" ? { rows: members("G01", 200) } : readChildren(group);

  it(
    "renders only the rows near the visible part with a group of two hundred lines expanded",
    SLOW,
    () => {
      render(<Tree rows={many} childRows={twoHundred} initiallyExpanded={["G01"]} height="fill" />);
      const grid = screen.getByRole("treegrid");
      expect(treeRows().length).toBeLessThan(40);
      expect(rowNamed("G01-LINE-001")).toBeInTheDocument();
      expect(screen.queryByRole("rowheader", { name: "G01-LINE-200" })).not.toBeInTheDocument();
      expect(screen.queryByRole("rowheader", { name: "Group 2" })).not.toBeInTheDocument();

      // Past the two hundred children: the group after them.
      scrollTable(grid, 201 * ROW);
      expect(rowNamed("Group 2")).toBeInTheDocument();
      expect(screen.queryByRole("rowheader", { name: "G01-LINE-001" })).not.toBeInTheDocument();
      expect(treeRows().length).toBeLessThan(40);

      scrollTable(grid, 229 * ROW);
      expect(rowNamed("Group 30")).toBeInTheDocument();
    },
  );

  it("makes a track as wide as a child column says its values need", () => {
    const width = () =>
      screen.getByRole("columnheader", { name: "Holds" }).parentElement?.style.width;
    const { rerender } = render(<Tree />);
    // The stand-in widths of a test: 7 px for a character, 12 px of padding at each side.
    expect(width()).toBe("66px");
    const wide: DataTableChildColumn<Member>[] = childColumns.map((column) =>
      column.column === "holds" ? { ...column, chars: 12 } : column,
    );
    rerender(
      <DataTable
        aria-label="Holds by discipline"
        columns={columns}
        rows={groups}
        rowKey={(group) => group.key}
        childRows={readChildren}
        childKey={(member) => member.id}
        childColumns={wide}
        expandedKeys={new Set()}
        onExpandedChange={() => undefined}
      />,
    );
    expect(width()).toBe("108px");
  });

  it("counts the child rows in where it looks for the end of its rows", SLOW, () => {
    const onLoadMore = vi.fn();
    render(
      <Tree
        rows={many.slice(0, 5)}
        childRows={twoHundred}
        initiallyExpanded={["G01"]}
        onLoadMore={onLoadMore}
        height="fill"
      />,
    );
    // Five groups would end in view; with two hundred lines under the first they do not.
    expect(onLoadMore).not.toHaveBeenCalled();
    scrollTable(screen.getByRole("treegrid"), 200 * ROW);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it(
    "returns to its top for another result with a row expanded, and finds that result's end",
    SLOW,
    () => {
      const onLoadMore = vi.fn();
      const props = {
        rows: many.slice(0, 5),
        childRows: twoHundred,
        initiallyExpanded: ["G01"],
        onLoadMore,
        height: "fill",
      } as const;
      const { rerender } = render(<Tree {...props} resultKey="one" />);
      const grid = screen.getByRole("treegrid");
      scrollTable(grid, 200 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      rerender(<Tree {...props} rows={[...props.rows]} resultKey="two" />);
      expect(grid.scrollTop).toBe(0);
      scrollTable(grid, 0);
      expect(rowNamed("G01-LINE-001")).toBeInTheDocument();
      // The child rows are counted in again: the end of the other result is as far down.
      expect(onLoadMore).toHaveBeenCalledTimes(1);
      scrollTable(grid, 200 * ROW);
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps the focused child row in the document while it is scrolled away", SLOW, async () => {
    const user = userEvent.setup();
    render(<Tree rows={many} childRows={twoHundred} initiallyExpanded={["G01"]} height="fill" />);
    await user.tab();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const row = rowNamed("G01-LINE-002");
    expect(row).toHaveFocus();
    scrollTable(screen.getByRole("treegrid"), 220 * ROW);
    expect(row).toBeInTheDocument();
    expect(row).toHaveFocus();
  });
});
