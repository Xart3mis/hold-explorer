import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessible } from "../../test/axe";
import { SLOW } from "../../test/slow";
import {
  DataTable,
  type DataTableChildColumn,
  type DataTableChildren,
  type DataTableColumn,
} from "./DataTable";

interface Line {
  id: string;
  holds: number;
}

const lines: Line[] = [
  { id: "LINE-A", holds: 13 },
  { id: "LINE-B", holds: 12 },
  { id: "LINE-C", holds: 9 },
  { id: "LINE-D", holds: 4 },
  { id: "LINE-E", holds: 1 },
];

const columns: DataTableColumn<Line>[] = [
  {
    id: "id",
    header: "Line ID",
    kind: "identifier",
    isRowHeader: true,
    size: { chars: 12 },
    cell: (line) => line.id,
  },
  {
    id: "holds",
    header: "Holds",
    kind: "number",
    size: { flex: 1, minChars: 6 },
    cell: (line) => line.holds,
  },
];

const countText = (shown: number, total: number) => `${String(shown)} of ${String(total)} lines`;
const selectedText = (count: number) => `${String(count)} selected`;

interface Seen {
  /** Every key the table opened, in order. */
  opened: string[];
  /** Every selection the table handed over, in order. */
  selections: string[][];
}

interface HarnessProps {
  rows?: readonly Line[];
  initialOpen?: string | null;
  initialSelected?: readonly string[];
  resultKey?: string;
  totalRows?: number;
  seen: Seen;
}

/** A screen as the pages will be: it holds the open row and the selection beside it. */
function Harness({
  rows = lines,
  initialOpen = null,
  initialSelected = [],
  resultKey,
  totalRows,
  seen,
}: HarnessProps) {
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialSelected));
  return (
    <DataTable
      aria-label="Lines on hold"
      columns={columns}
      rows={rows}
      rowKey={(line) => line.id}
      selectedKey={open}
      onSelectionChange={(key) => {
        seen.opened.push(key);
        setOpen(key);
      }}
      selectedKeys={selected}
      onSelectedKeysChange={(keys) => {
        seen.selections.push([...keys]);
        setSelected(keys);
      }}
      countText={countText}
      selectedText={selectedText}
      totalRows={totalRows ?? 9312}
      {...(resultKey === undefined ? {} : { resultKey })}
    />
  );
}

function newSeen(): Seen {
  return { opened: [], selections: [] };
}

/** The grid, or the tree grid of a table whose rows expand. */
function grid(): HTMLElement {
  return screen.queryByRole("grid") ?? screen.getByRole("treegrid");
}

function dataRows() {
  return within(grid()).getAllByRole("row").slice(1);
}

function row(id: string): HTMLElement {
  const found = dataRows().find((each) => each.dataset.key === id);
  if (!found) throw new Error(`There is no row ${id}.`);
  return found;
}

/** The keys of the rows that say they are selected, in the order of the rows. */
function marked(): string[] {
  return dataRows()
    .filter((each) => each.getAttribute("aria-selected") === "true")
    .map((each) => each.dataset.key ?? "");
}

/** The key of the row that says it is the open one, apart from the selection. */
function framed(): string[] {
  return dataRows()
    .filter((each) => each.hasAttribute("data-open"))
    .map((each) => each.dataset.key ?? "");
}

function lastSelection(seen: Seen): string[] | undefined {
  return seen.selections.at(-1);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataTable with selected rows, by the pointer", () => {
  it("opens a row on a plain click and selects it alone", SLOW, async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    render(<Harness seen={seen} initialOpen="LINE-A" initialSelected={["LINE-A", "LINE-C"]} />);

    await user.click(row("LINE-B"));
    expect(seen.opened).toEqual(["LINE-B"]);
    expect(lastSelection(seen)).toEqual(["LINE-B"]);
    expect(marked()).toEqual(["LINE-B"]);
    // The open row alone in the selection looks as a selected row always has: no frame.
    expect(framed()).toEqual([]);
  });

  it("sets the selection to the open row alone on a plain click on the open row", async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    render(<Harness seen={seen} initialOpen="LINE-B" initialSelected={["LINE-A", "LINE-B"]} />);

    await user.click(row("LINE-B"));
    expect(lastSelection(seen)).toEqual(["LINE-B"]);
    expect(marked()).toEqual(["LINE-B"]);
  });

  it(
    "adds a row on Ctrl+click and takes it out on a second, without opening it",
    SLOW,
    async () => {
      const seen = newSeen();
      const user = userEvent.setup();
      render(<Harness seen={seen} />);

      await user.click(row("LINE-B"));
      expect(seen.opened).toEqual(["LINE-B"]);

      await user.keyboard("{Control>}");
      await user.click(row("LINE-D"));
      await user.keyboard("{/Control}");
      expect(seen.opened).toEqual(["LINE-B"]);
      expect(lastSelection(seen)).toEqual(["LINE-B", "LINE-D"]);
      expect(marked()).toEqual(["LINE-B", "LINE-D"]);
      // The open row among other selected rows carries its frame, and says it is the current one.
      expect(framed()).toEqual(["LINE-B"]);
      expect(row("LINE-B")).toHaveAttribute("aria-current", "true");
      expect(row("LINE-D")).not.toHaveAttribute("aria-current");
      // The row pressed takes the focus.
      expect(row("LINE-D")).toHaveFocus();

      await user.keyboard("{Control>}");
      await user.click(row("LINE-D"));
      await user.keyboard("{/Control}");
      expect(lastSelection(seen)).toEqual(["LINE-B"]);
      expect(seen.opened).toEqual(["LINE-B"]);

      // The open row taken out of the selection stays open, and framed.
      await user.keyboard("{Control>}");
      await user.click(row("LINE-B"));
      await user.keyboard("{/Control}");
      expect(lastSelection(seen)).toEqual([]);
      expect(marked()).toEqual([]);
      expect(framed()).toEqual(["LINE-B"]);
      expect(row("LINE-B")).toHaveAttribute("aria-selected", "false");
      expect(seen.opened).toEqual(["LINE-B"]);
    },
  );

  it(
    "selects the range from the last row pressed on Shift+click, in the order of the rows",
    SLOW,
    async () => {
      const seen = newSeen();
      const user = userEvent.setup();
      render(<Harness seen={seen} />);

      await user.click(row("LINE-D"));
      await user.keyboard("{Shift>}");
      await user.click(row("LINE-B"));
      await user.keyboard("{/Shift}");
      expect(lastSelection(seen)).toEqual(["LINE-B", "LINE-C", "LINE-D"]);
      expect(seen.opened).toEqual(["LINE-D"]);
      expect(row("LINE-B")).toHaveFocus();

      // The range keeps its first end: another Shift+click moves only the other end.
      await user.keyboard("{Shift>}");
      await user.click(row("LINE-E"));
      await user.keyboard("{/Shift}");
      expect(lastSelection(seen)).toEqual(["LINE-D", "LINE-E"]);
      expect(marked()).toEqual(["LINE-D", "LINE-E"]);
      expect(seen.opened).toEqual(["LINE-D"]);
    },
  );

  it("runs a Shift+click range from a row a Ctrl+click took out", SLOW, async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    render(<Harness seen={seen} />);

    await user.click(row("LINE-A"));
    await user.keyboard("{Control>}");
    await user.click(row("LINE-C"));
    await user.click(row("LINE-C"));
    await user.keyboard("{/Control}");
    expect(lastSelection(seen)).toEqual(["LINE-A"]);

    await user.keyboard("{Shift>}");
    await user.click(row("LINE-E"));
    await user.keyboard("{/Shift}");
    expect(lastSelection(seen)).toEqual(["LINE-C", "LINE-D", "LINE-E"]);
    expect(seen.opened).toEqual(["LINE-A"]);
  });
});

describe("DataTable with selected rows, by the keyboard", () => {
  it("opens a row on Enter and selects it alone", async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    render(<Harness seen={seen} initialSelected={["LINE-D", "LINE-E"]} />);

    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(row("LINE-B")).toHaveFocus();
    // Moving selects nothing.
    expect(seen.selections).toEqual([]);
    await user.keyboard("{Enter}");
    expect(seen.opened).toEqual(["LINE-B"]);
    expect(lastSelection(seen)).toEqual(["LINE-B"]);
  });

  it("moves the focus and extends the range with Shift+Down and Shift+Up", SLOW, async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    render(<Harness seen={seen} />);

    await user.tab();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(seen.opened).toEqual(["LINE-B"]);

    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(row("LINE-C")).toHaveFocus();
    expect(lastSelection(seen)).toEqual(["LINE-B", "LINE-C"]);
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(row("LINE-D")).toHaveFocus();
    expect(lastSelection(seen)).toEqual(["LINE-B", "LINE-C", "LINE-D"]);
    await user.keyboard("{Shift>}{ArrowUp}{ArrowUp}{ArrowUp}{/Shift}");
    expect(row("LINE-A")).toHaveFocus();
    expect(lastSelection(seen)).toEqual(["LINE-A", "LINE-B"]);
    expect(marked()).toEqual(["LINE-A", "LINE-B"]);
    // Extending opens nothing; the open row is the one Enter opened.
    expect(seen.opened).toEqual(["LINE-B"]);
    expect(framed()).toEqual(["LINE-B"]);
  });

  it("selects every loaded row on Ctrl+A, and only those", async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    // Three rows of 9,312 are loaded.
    render(<Harness seen={seen} rows={lines.slice(0, 3)} />);

    await user.tab();
    await user.keyboard("{Control>}a{/Control}");
    expect(lastSelection(seen)).toEqual(["LINE-A", "LINE-B", "LINE-C"]);
    expect(marked()).toEqual(["LINE-A", "LINE-B", "LINE-C"]);
    expect(seen.opened).toEqual([]);
  });

  it("clears the selection on Escape, and lets the page's own Escape have the same press", async () => {
    const seen = newSeen();
    const user = userEvent.setup();
    // The page learns Escape around the table, as the detail panel does (tableFocus.ts), and
    // closes the panel unless the press was taken.
    const pageEscape = vi.fn();
    const listen = (area: HTMLDivElement | null) => {
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !event.defaultPrevented) pageEscape();
      };
      area?.addEventListener("keydown", onKey);
      return () => area?.removeEventListener("keydown", onKey);
    };
    render(
      <div ref={listen}>
        <Harness seen={seen} initialOpen="LINE-A" initialSelected={["LINE-A", "LINE-B"]} />
      </div>,
    );
    await user.tab();
    await user.keyboard("{Escape}");
    expect(lastSelection(seen)).toEqual([]);
    expect(marked()).toEqual([]);
    expect(pageEscape).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable with selected rows, as it is read", () => {
  it("says that several rows can be selected, and which are", () => {
    render(
      <Harness seen={newSeen()} initialOpen="LINE-A" initialSelected={["LINE-A", "LINE-C"]} />,
    );
    expect(screen.getByRole("grid")).toHaveAttribute("aria-multiselectable", "true");
    expect(row("LINE-A")).toHaveAttribute("aria-selected", "true");
    expect(row("LINE-C")).toHaveAttribute("aria-selected", "true");
    expect(row("LINE-B")).toHaveAttribute("aria-selected", "false");
    // The tint follows the selection, not the open row alone.
    expect(row("LINE-C")).toHaveAttribute("data-selected");
    expect(row("LINE-B")).not.toHaveAttribute("data-selected");
    expect(framed()).toEqual(["LINE-A"]);
  });

  it(
    "adds the selection to its count line, which is a live region and the grid's description",
    SLOW,
    async () => {
      const seen = newSeen();
      const user = userEvent.setup();
      render(<Harness seen={seen} />);
      const status = screen.getByRole("status");
      expect(status).toHaveTextContent(/^5 of 9312 lines$/);

      await user.click(row("LINE-A"));
      expect(status).toHaveTextContent(/^5 of 9312 lines, 1 selected$/);
      await user.keyboard("{Shift>}");
      await user.click(row("LINE-C"));
      await user.keyboard("{/Shift}");
      expect(screen.getByRole("status")).toHaveTextContent(/^5 of 9312 lines, 3 selected$/);
      expect(screen.getByRole("grid")).toHaveAccessibleDescription("5 of 9312 lines, 3 selected");
    },
  );

  it("keeps the selection through a load of more rows, and leaves it to the screen on another result", () => {
    const seen = newSeen();
    const { rerender } = render(
      <Harness seen={seen} rows={lines.slice(0, 3)} initialSelected={["LINE-B"]} resultKey="one" />,
    );
    expect(marked()).toEqual(["LINE-B"]);
    rerender(<Harness seen={seen} rows={lines} initialSelected={["LINE-B"]} resultKey="one" />);
    expect(marked()).toEqual(["LINE-B"]);
    rerender(<Harness seen={seen} rows={lines} initialSelected={["LINE-B"]} resultKey="two" />);
    // The table does not clear what the screen holds; the screen clears it for another result.
    expect(seen.selections).toEqual([]);
    expect(marked()).toEqual(["LINE-B"]);
  });

  it("passes the accessibility checker with rows selected", SLOW, async () => {
    const { container } = render(
      <Harness seen={newSeen()} initialOpen="LINE-B" initialSelected={["LINE-A", "LINE-C"]} />,
    );
    await expectAccessible(container);
  });
});

describe("DataTable without selected rows", () => {
  it("keeps one selection: Ctrl+click opens the row as a click does, and no grid is multiselectable", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable
        aria-label="Lines on hold"
        columns={columns}
        rows={lines}
        rowKey={(line) => line.id}
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(screen.getByRole("grid")).not.toHaveAttribute("aria-multiselectable");
    await user.keyboard("{Control>}");
    await user.click(row("LINE-C"));
    await user.keyboard("{/Control}");
    expect(onSelectionChange).toHaveBeenCalledWith("LINE-C");
    for (const each of dataRows()) expect(each).not.toHaveAttribute("data-open");
  });

  it("stays read-only without a selection handler, given selected keys alone", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        aria-label="Lines on hold"
        columns={columns}
        rows={lines}
        rowKey={(line) => line.id}
        selectedKeys={new Set(["LINE-A"])}
      />,
    );
    expect(screen.getByRole("grid")).not.toHaveAttribute("aria-multiselectable");
    await user.click(row("LINE-B"));
    for (const each of dataRows()) expect(each).not.toHaveAttribute("aria-selected");
  });
});

interface Group {
  key: string;
  label: string;
}

interface Member {
  id: string;
}

const groups: Group[] = [
  { key: "PIPING", label: "Piping" },
  { key: "STRESS", label: "Stress" },
  { key: "CIVIL", label: "Civil" },
];

const groupColumns: DataTableColumn<Group>[] = [
  {
    id: "label",
    header: "Discipline",
    isRowHeader: true,
    size: { flex: 1, minChars: 20 },
    cell: (group) => group.label,
  },
];

const memberColumns: DataTableChildColumn<Member>[] = [
  { column: "label", kind: "identifier", cell: (member) => member.id },
];

function membersOf(group: Group): DataTableChildren<Member> {
  return { rows: [{ id: `${group.key}-1` }, { id: `${group.key}-2` }] };
}

/** Breakdown as it will be: groups that expand to lines, and a selection of groups. */
function Tree({ seen }: { seen: Seen }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(["PIPING"]));
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [line, setLine] = useState<string | null>(null);
  return (
    <DataTable
      aria-label="Holds by discipline"
      columns={groupColumns}
      rows={groups}
      rowKey={(group) => group.key}
      childRows={membersOf}
      childKey={(member) => member.id}
      childColumns={memberColumns}
      expandedKeys={expanded}
      onExpandedChange={setExpanded}
      selectedChildKey={line}
      onChildSelectionChange={(member) => {
        seen.opened.push(member.id);
        setLine(member.id);
      }}
      selectedKeys={selected}
      onSelectedKeysChange={(keys) => {
        seen.selections.push([...keys]);
        setSelected(keys);
      }}
    />
  );
}

describe("DataTable with selected rows that expand", () => {
  it(
    "selects rows, not their children, with Ctrl+click, Shift+Down, and Ctrl+A",
    SLOW,
    async () => {
      const seen = newSeen();
      const user = userEvent.setup();
      render(<Tree seen={seen} />);

      // Ctrl+click on a child row leaves the selection of rows as it is; the child row is pressed
      // as it always was, and opens its line.
      await user.keyboard("{Control>}");
      await user.click(row(`PIPING\u001fPIPING-1`));
      await user.keyboard("{/Control}");
      expect(seen.selections).toEqual([]);
      expect(seen.opened).toEqual(["PIPING-1"]);

      await user.keyboard("{Control>}");
      await user.click(row("PIPING"));
      await user.keyboard("{/Control}");
      expect(lastSelection(seen)).toEqual(["PIPING"]);

      // The range runs over the rows, past the children of the expanded one.
      row("PIPING").focus();
      await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
      expect(row("STRESS")).toHaveFocus();
      expect(lastSelection(seen)).toEqual(["PIPING", "STRESS"]);

      await user.keyboard("{Control>}a{/Control}");
      expect(lastSelection(seen)).toEqual(["PIPING", "STRESS", "CIVIL"]);
      // The child rows are not among them: the screen is handed the rows alone.
      expect(seen.selections.flat().some((key) => key.includes("PIPING-"))).toBe(false);
      expect(row(`PIPING\u001fPIPING-2`)).toHaveAttribute("aria-selected", "false");
      expect(screen.getByRole("treegrid")).toHaveAttribute("aria-multiselectable", "true");
    },
  );
});
