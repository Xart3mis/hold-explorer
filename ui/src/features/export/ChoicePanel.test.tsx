import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { must } from "../../test/app";
import { manySteps } from "../../test/blockers";
import { filterOptions } from "../../test/filters";
import { lineId, linePage } from "../../test/lines";
import { ctrlClick, exportButton, itemNames, openMenu, renderAt, rowOf } from "../../test/export";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";
import { formatCount } from "../../text/format";
import { presetQuery } from "../lines/presets";
import { DEFAULT_CHOICE, readChoice, writeChoice, type ExportChoice } from "./choices";
import { buildRequest, FILE_COLUMNS, type ScreenState } from "./requests";

const menu = en.export.menu;
const panel = en.export.panel;

const count = (text: string, value: number) =>
  text.replace("{{count, number}}", formatCount(value));
const titleOf = (screen: string) => panel.title.replace("{{screen}}", screen);
const saveOf = (screen: string) => panel.save.replace("{{screen}}", screen);

/** Opens the panel from the menu by the pointer, and returns it. */
async function openPanel(user: UserEvent, screenTitle = "Lines"): Promise<HTMLElement> {
  const open = await openMenu(user);
  await user.click(within(open).getByRole("menuitem", { name: menu.choice }));
  return screen.findByRole("dialog", { name: titleOf(screenTitle) });
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

/** The radio of a status in the panel: "All" names a choice of rows as well. */
function statusRadio(dialog: HTMLElement, name: string): HTMLElement {
  const group = within(dialog).getByRole("radiogroup", { name: panel.status });
  return within(group).getByRole("radio", { name });
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
    await app.user.click(statusRadio(dialog, panel.statusAll));
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
    // Open is the status the rows on screen were read under: the loaded rows stay offered.
    await app.user.click(within(status).getByRole("radio", { name: panel.statusOpen }));
    await app.user.click(within(dialog).getByRole("checkbox", { name: en.lines.column.holds }));
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(readChoice("lines")).toEqual({
      columns: FILE_COLUMNS.lines.filter((id) => id !== "holds"),
      rows: "loaded",
      status: "Open",
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
      expect(readChoice("blockers").columns).toEqual(["blocker"]);
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
      await app.user.click(statusRadio(dialog, panel.statusAll));
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

describe("the count of every row", () => {
  it("on Blockers is every step, also those the table has not been handed yet", SLOW, async () => {
    const app = renderAt("/blockers", { solve_order: () => manySteps(450, 10) });
    await rowOf("1");
    const dialog = await openPanel(app.user, "Blockers");
    const rows = within(dialog).getByRole("radiogroup", { name: panel.rows });
    expect(within(rows).getByRole("radio", { name: count(panel.rowsAll, 450) })).toBeChecked();
  });
});

describe("a status other than the one of the rows on screen", () => {
  it("offers every row only, uncounted, says why, and saves all rows", SLOW, async () => {
    const app = renderAt("/lines", { lines: () => linePage({ total: 500 }) });
    await rowOf(lineId(0));
    await ctrlClick(app.user, await rowOf(lineId(0)), await rowOf(lineId(2)));
    const dialog = await openPanel(app.user);
    const rows = within(dialog).getByRole("radiogroup", { name: panel.rows });
    const status = within(dialog).getByRole("radiogroup", { name: panel.status });
    await app.user.click(within(rows).getByRole("radio", { name: count(panel.rowsSelected, 2) }));

    await app.user.click(within(status).getByRole("radio", { name: panel.statusReleased }));
    const radios = within(rows).getAllByRole("radio");
    expect(radios.map((radio) => labelOf(radio).replace(panel.rowsByStatus, ""))).toEqual([
      panel.rowsAllUncounted,
    ]);
    expect(radios[0]).toBeChecked();
    expect(radios[0]).toHaveAccessibleDescription(panel.rowsByStatus);

    // Back to the filters' status: the rows on screen are offered again, with their counts.
    await app.user.click(within(status).getByRole("radio", { name: panel.statusFilters }));
    expect(
      within(rows)
        .getAllByRole("radio")
        .map((radio) => labelOf(radio)),
    ).toEqual([
      count(panel.rowsAll, 500),
      count(panel.rowsLoaded, 200),
      count(panel.rowsSelected, 2),
    ]);

    await app.user.click(within(status).getByRole("radio", { name: panel.statusAll }));
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(readChoice("lines")).toEqual({ ...DEFAULT_CHOICE, rows: "all", status: "All" });
  });

  it(
    "on Breakdown, asks for every group of the status, and the menu leaves out the selected ones",
    SLOW,
    async () => {
      writeChoice("breakdown", { ...DEFAULT_CHOICE, rows: "selected", status: "Released" });
      const app = renderAt("/breakdown");
      const first = await screen.findAllByRole("rowheader");
      await ctrlClick(app.user, must(first[0]?.closest<HTMLElement>("[role='row']")));
      const open = await openMenu(app.user);
      const names = itemNames(open);
      expect(names.some((name) => name.startsWith("Copy selected"))).toBe(false);
      const noted = (key: string, note: string) => key.replace("{{note}}", note);
      const both = en.export.menu.note.both.replace("{{status}}", en.export.menu.note.Released);
      expect(names).toContain(noted(menu.noted.excel, both));
      await app.user.click(
        within(open).getByRole("menuitem", { name: noted(menu.noted.excel, both) }),
      );
      await waitFor(() => {
        expect(app.saves).toHaveLength(1);
      });
      expect(must(app.saves[0]).request.rows).toEqual({ kind: "All" });
      expect(must(app.saves[0]).request.spec.status).toBe("Released");
    },
  );
});

describe("a saved choice", () => {
  it("changes the next request", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const dialog = await openPanel(app.user);
    await app.user.click(statusRadio(dialog, panel.statusAll));
    await app.user.click(within(dialog).getByRole("button", { name: panel.rowName }));
    await app.user.click(within(dialog).getByRole("checkbox", { name: en.lines.column.oldest }));
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The status saved is named in the items.
    const excel = menu.noted.excel.replace("{{note}}", menu.note.All);
    await app.user.click(within(await openMenu(app.user)).getByRole("menuitem", { name: excel }));
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

  it("show as all rows in the panel, which saves the rows it shows", SLOW, async () => {
    writeChoice("lines", { ...DEFAULT_CHOICE, rows: "selected" });
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const dialog = await openPanel(app.user);
    expect(within(dialog).getByRole("radio", { name: count(panel.rowsAll, 3) })).toBeChecked();
    await app.user.click(within(dialog).getByRole("button", { name: saveOf("Lines") }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(readChoice("lines").rows).toBe("all");
    // The menu follows the choice saved: nothing falls back any more.
    const open = await openMenu(app.user);
    expect(itemNames(open)).toEqual([
      menu.excel,
      menu.workbook,
      menu.csv,
      menu.report,
      menu.copyTable,
      menu.copyLineIds,
      menu.choice,
    ]);
  });
});

describe("Ctrl+E", () => {
  it("does nothing while the panel is open", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    await openPanel(app.user);
    await app.user.keyboard("{Control>}e{/Control}");
    await app.user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(windowApi.chooseSavePath).not.toHaveBeenCalled();
    expect(app.saves).toHaveLength(0);
  });
});

describe("accessibility", () => {
  it("has no violation with the panel open", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    await ctrlClick(app.user, await rowOf(lineId(1)));
    await openPanel(app.user);
    await expectNoAxeViolations();
  });
});
