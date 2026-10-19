import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { ArgsOf } from "../../api/commands";
import { openHoldsFilter } from "../../api/filter";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { openStart } from "../../test/fixtures";
import type { Handlers } from "../../test/ipc";
import { lineId, linePage } from "../../test/lines";
import { SLOW } from "../../test/slow";
import { formatCount } from "../../text/format";
import { windowApi } from "../../test/window";
import { presetQuery } from "../lines/presets";
import { DEFAULT_CHOICE, readChoice, writeChoice, type ExportChoice } from "./choices";
import { buildRequest, FILE_COLUMNS, type ScreenState } from "./requests";

const menu = en.export.menu;
const panel = en.export.panel;

type SaveArgs = ArgsOf<"export_save">;
type CopyArgs = ArgsOf<"export_copy">;

const count = (text: string, value: number) =>
  text.replace("{{count, number}}", formatCount(value));
const titleOf = (screen: string) => panel.title.replace("{{screen}}", screen);
const saveOf = (screen: string) => panel.save.replace("{{screen}}", screen);

/** The app at `path`, with the export commands answered at once and recorded. */
function renderAt(path: string, handlers: Handlers = {}) {
  const saves: SaveArgs[] = [];
  const copies: CopyArgs[] = [];
  windowApi.chooseSavePath.mockImplementation((_, extension) =>
    Promise.resolve(`/home/ada/exports/out.${extension}`),
  );
  const app = renderApp({
    start: openStart(),
    path,
    handlers: {
      export_save: (args) => {
        saves.push(args);
        return { path: args.path, rows: 3 };
      },
      export_copy: (args) => {
        copies.push(args);
        return null;
      },
      ...handlers,
    },
  });
  return { ...app, saves, copies };
}

async function exportButton(): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name: menu.label });
  await waitFor(() => {
    expect(button).not.toHaveAttribute("aria-busy");
  });
  return button;
}

async function openMenu(user: UserEvent): Promise<HTMLElement> {
  await user.click(await exportButton());
  return screen.findByRole("menu", { name: menu.name });
}

function itemNames(open: HTMLElement): string[] {
  return within(open)
    .getAllByRole("menuitem")
    .map((item) => item.querySelector('[slot="label"]')?.textContent ?? "");
}

/** Opens the panel from the menu by the pointer, and returns it. */
async function openPanel(user: UserEvent, screenTitle = "Lines"): Promise<HTMLElement> {
  const open = await openMenu(user);
  await user.click(within(open).getByRole("menuitem", { name: menu.choice }));
  return screen.findByRole("dialog", { name: titleOf(screenTitle) });
}

async function rowOf(name: string): Promise<HTMLElement> {
  return must(
    (await screen.findByRole("rowheader", { name })).closest<HTMLElement>("[role='row']"),
    `the row of ${name}`,
  );
}

async function ctrlClick(user: UserEvent, ...rows: HTMLElement[]): Promise<void> {
  await user.keyboard("{Control>}");
  for (const row of rows) await user.click(row);
  await user.keyboard("{/Control}");
}

/** The names of the columns the panel lists, in order, without the note of the row's name. */
function columnNames(dialog: HTMLElement): string[] {
  const group = within(dialog).getByRole("group", { name: panel.columns });
  return within(group)
    .getAllByRole("checkbox")
    .map((box) =>
      (box.getAttribute("aria-label") ?? labelOf(box)).replace(panel.always, "").trim(),
    );
}

function labelOf(box: HTMLElement): string {
  return box.closest("label")?.textContent ?? "";
}

const LINES: ScreenState = { screen: "lines", query: presetQuery("all") };

beforeEach(() => {
  window.localStorage.clear();
});

describe("the Columns and rows panel opens", () => {
  it(
    "from the last item of the menu, on the screens that have columns and rows",
    SLOW,
    async () => {
      for (const [path, name] of [
        ["/lines", "Lines"],
        ["/lines?rows=holds", "Holds"],
        ["/breakdown", "Breakdown"],
        ["/blockers", "Blockers"],
      ] as const) {
        const app = renderAt(path);
        const open = await openMenu(app.user);
        expect(itemNames(open).at(-1)).toBe(menu.choice);
        await app.user.click(within(open).getByRole("menuitem", { name: menu.choice }));
        const dialog = await screen.findByRole("dialog", { name: titleOf(name) });
        expect(within(dialog).getByRole("heading", { name: titleOf(name) })).toBeInTheDocument();
        // A popover, not a modal: nothing is laid over the page.
        expect(dialog).not.toHaveAttribute("aria-modal", "true");
        app.unmount();
      }
    },
  );

  it("not on the Overview or the matrix, whose files are fixed tables", async () => {
    for (const path of ["/overview", "/breakdown?mode=matrix"]) {
      const app = renderAt(path);
      expect(itemNames(await openMenu(app.user))).not.toContain(menu.choice);
      app.unmount();
    }
  });

  it("by keyboard, with the focus inside, and gives it back to the button", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const button = await exportButton();
    act(() => {
      button.focus();
    });
    await app.user.keyboard("{Enter}");
    const open = await screen.findByRole("menu", { name: menu.name });
    await app.user.keyboard("{End}");
    await waitFor(() => {
      expect(within(open).getByRole("menuitem", { name: menu.choice })).toHaveFocus();
    });
    await app.user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: titleOf("Lines") });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
    // The button keeps its open look while the panel is open.
    expect(button).toHaveAttribute("aria-expanded", "true");
    // Tab stays inside.
    for (let step = 0; step < 30; step += 1) {
      await app.user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await app.user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(button).toHaveFocus();
    });
    expect(button).not.toHaveAttribute("aria-expanded", "true");
  });
});

describe("Cancel and Escape", () => {
  it.each([
    [
      "Cancel",
      (user: UserEvent) => user.click(screen.getByRole("button", { name: en.common.cancel })),
    ],
    ["Escape", (user: UserEvent) => user.keyboard("{Escape}")],
  ])("%s changes nothing and gives the focus back to the button", SLOW, async (_, close) => {
    const kept: ExportChoice = { columns: ["line", "holds"], rows: "all", status: "Released" };
    writeChoice("lines", kept);
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const dialog = await openPanel(app.user);
    await app.user.click(within(dialog).getByRole("radio", { name: panel.statusAll }));
    await app.user.click(within(dialog).getByRole("checkbox", { name: en.lines.column.oldest }));
    await close(app.user);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: menu.label })).toHaveFocus();
    });
    expect(readChoice("lines")).toEqual(kept);
    // Opened again, it shows the choice as it was kept.
    const again = await openPanel(app.user);
    expect(within(again).getByRole("radio", { name: panel.statusReleased })).toBeChecked();
    expect(within(again).getByRole("checkbox", { name: en.lines.column.oldest })).not.toBeChecked();
  });
});

describe("each control writes the choice", () => {
  it("the rows, the status, and a column, on Save", SLOW, async () => {
    const app = renderAt("/lines", { lines: () => linePage({ total: 500 }) });
    await rowOf(lineId(0));
    await ctrlClick(app.user, await rowOf(lineId(0)), await rowOf(lineId(2)));
    const dialog = await openPanel(app.user);
    const rows = within(dialog).getByRole("radiogroup", { name: panel.rows });
    expect(
      within(rows)
        .getAllByRole("radio")
        .map((radio) => labelOf(radio)),
    ).toEqual([
      count(panel.rowsAll, 500),
      count(panel.rowsLoaded, 200),
      count(panel.rowsSelected, 2),
    ]);
    expect(within(rows).getByRole("radio", { name: count(panel.rowsAll, 500) })).toBeChecked();
    const status = within(dialog).getByRole("radiogroup", { name: panel.status });
    expect(
      within(status)
        .getAllByRole("radio")
        .map((radio) => labelOf(radio)),
    ).toEqual([panel.statusFilters, panel.statusOpen, panel.statusReleased, panel.statusAll]);
    expect(within(status).getByRole("radio", { name: panel.statusFilters })).toBeChecked();

    await app.user.click(within(rows).getByRole("radio", { name: count(panel.rowsLoaded, 200) }));
    await app.user.click(within(status).getByRole("radio", { name: panel.statusReleased }));
    await app.user.click(within(dialog).getByRole("checkbox", { name: en.lines.column.holds }));
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(readChoice("lines")).toEqual({
      columns: FILE_COLUMNS.lines.filter((id) => id !== "holds"),
      rows: "loaded",
      status: "Released",
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: menu.label })).toHaveFocus();
    });
  });

  it("the selected rows", SLOW, async () => {
    const app = renderAt("/lines");
    await ctrlClick(app.user, await rowOf(lineId(1)));
    const dialog = await openPanel(app.user);
    await app.user.click(within(dialog).getByRole("radio", { name: count(panel.rowsSelected, 1) }));
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(readChoice("lines")).toEqual({ ...DEFAULT_CHOICE, rows: "selected" });
    });
  });

  it("only the row's name, and all columns again", SLOW, async () => {
    const app = renderAt("/blockers");
    await rowOf("1");
    let dialog = await openPanel(app.user, "Blockers");
    await app.user.click(within(dialog).getByRole("button", { name: panel.rowName }));
    for (const box of within(dialog).getAllByRole("checkbox")) {
      if (box.hasAttribute("disabled")) expect(box).toBeChecked();
      else expect(box).not.toBeChecked();
    }
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Blockers") }));
    await waitFor(() => {
      expect(readChoice("blockers").columns).toEqual(["step"]);
    });

    dialog = await openPanel(app.user, "Blockers");
    await app.user.click(within(dialog).getByRole("button", { name: panel.allColumnsName }));
    for (const box of within(dialog).getAllByRole("checkbox")) expect(box).toBeChecked();
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Blockers") }));
    // Every column checked is kept as none named: the file writes every column it has.
    await waitFor(() => {
      expect(readChoice("blockers").columns).toEqual([]);
    });
  });
});

describe("the columns", () => {
  it(
    "are those of the table, in its order, the row's name checked and disabled",
    SLOW,
    async () => {
      const app = renderAt("/lines");
      await rowOf(lineId(0));
      const dialog = await openPanel(app.user);
      const column = en.lines.column;
      expect(columnNames(dialog)).toEqual([
        column.line,
        column.holds,
        column.disciplines,
        column.holdTypes,
        column.blockers,
        column.oldest,
        column.modelSize,
        column.ldtSize,
        column.stressCalc,
        column.sizes,
      ]);
      const line = within(dialog).getByRole("checkbox", {
        name: `${column.line} ${panel.always}`,
      });
      expect(line).toBeChecked();
      expect(line).toBeDisabled();
      await app.user.click(line);
      expect(line).toBeChecked();
      await app.user.click(within(dialog).getByRole("button", { name: panel.rowName }));
      expect(line).toBeChecked();
    },
  );

  it(
    "leave out what the snapshot lacks, and follow the status the holds are written under",
    SLOW,
    async () => {
      const app = renderAt("/lines?rows=holds", {
        filter_options: () => filterOptions({ absent: ["StressCalc", "Role", "SourceId"] }),
      });
      await rowOf(lineId(0));
      const dialog = await openPanel(app.user, "Holds");
      const column = en.lines.column;
      // Open holds, as the filters have them: their age, and no release.
      expect(columnNames(dialog)).toEqual([
        column.line,
        column.discipline,
        column.holdType,
        column.remark,
        column.blocker,
        column.blockerType,
        column.name,
        column.created,
        column.age,
      ]);
      await app.user.click(within(dialog).getByRole("radio", { name: panel.statusAll }));
      expect(columnNames(dialog)).toEqual([
        column.line,
        column.discipline,
        column.holdType,
        column.remark,
        column.blocker,
        column.blockerType,
        column.name,
        column.created,
        column.status,
        column.releasedOn,
        column.days,
        en.import.field.ReleaseRemark,
      ]);
    },
  );

  it("of Breakdown name the group by its dimension", SLOW, async () => {
    const app = renderAt("/breakdown");
    await rowOf("Piping");
    const dialog = await openPanel(app.user, "Breakdown");
    expect(columnNames(dialog)).toEqual([
      en.import.field.Discipline,
      en.breakdown.column.holds,
      en.breakdown.column.lines,
    ]);
  });
});

describe("a saved choice", () => {
  it("changes the next request", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const dialog = await openPanel(app.user);
    await app.user.click(within(dialog).getByRole("radio", { name: panel.statusAll }));
    await app.user.click(within(dialog).getByRole("button", { name: panel.rowName }));
    await app.user.click(within(dialog).getByRole("checkbox", { name: en.lines.column.oldest }));
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await app.user.click(
      within(await openMenu(app.user)).getByRole("menuitem", { name: menu.excel }),
    );
    await waitFor(() => {
      expect(app.saves).toHaveLength(1);
    });
    const choice: ExportChoice = { columns: ["line", "oldest"], rows: "all", status: "All" };
    expect(must(app.saves[0]).request).toEqual(
      buildRequest(LINES, openHoldsFilter(), [], choice, { loaded: 3, selected: [] }),
    );
    expect(must(app.saves[0]).request.columns).toEqual(["line", "oldest"]);
    expect(must(app.saves[0]).request.spec.status).toBe("All");
  });
});

describe("the selected rows, with none selected", () => {
  it("fall back to all rows, and the menu says so", SLOW, async () => {
    writeChoice("lines", { ...DEFAULT_CHOICE, rows: "selected" });
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const open = await openMenu(app.user);
    expect(itemNames(open)).toEqual([
      menu.excelAll,
      menu.workbook,
      menu.csvAll,
      menu.report,
      menu.copyTableAll,
      menu.copyLineIdsAll,
      menu.choice,
    ]);
    expect(menu.excelAll).toBe("Excel, this view (all rows)…");
    await app.user.click(within(open).getByRole("menuitem", { name: menu.excelAll }));
    await waitFor(() => {
      expect(app.saves).toHaveLength(1);
    });
    expect(must(app.saves[0]).request.rows).toEqual({ kind: "All" });

    // The panel shows all rows, and keeps the choice of the selected ones unless another is made.
    const dialog = await openPanel(app.user);
    expect(within(dialog).getByRole("radio", { name: count(panel.rowsAll, 3) })).toBeChecked();
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(readChoice("lines").rows).toBe("selected");

    // With rows selected, the items are as ever, and write those rows.
    await ctrlClick(app.user, await rowOf(lineId(2)));
    const again = await openMenu(app.user);
    expect(itemNames(again)).toContain(menu.excel);
    await app.user.click(within(again).getByRole("menuitem", { name: menu.excel }));
    await waitFor(() => {
      expect(app.saves).toHaveLength(2);
    });
    expect(must(app.saves[1]).request.rows).toEqual({ kind: "Keys", keys: [lineId(2)] });
  });
});

describe("accessibility", () => {
  it("has no violation with the panel open", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    await ctrlClick(app.user, await rowOf(lineId(1)));
    await openPanel(app.user);
    await expectAccessible();
  });
});
