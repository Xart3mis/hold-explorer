import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import type { CopyFormat } from "../../bindings/CopyFormat";
import type { SaveFormat } from "../../bindings/SaveFormat";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { breakdownGroups } from "../../test/breakdown";
import { solveView } from "../../test/blockers";
import { selectOlderSnapshot } from "../../test/flow";
import { openStart, opened, workspace } from "../../test/fixtures";
import { overviewView } from "../../test/overview";
import { commandFailure } from "../../test/ipc";
import { lineId, linePage } from "../../test/lines";
import { ctrlClick, exportButton, itemNames, openMenu, renderAt, rowOf } from "../../test/export";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";
import { DEFAULT_BREAKDOWN_STATE } from "../breakdown/address";
import { DEFAULT_HOLDS_STATE } from "../lines/address";
import { presetQuery } from "../lines/presets";
import { DEFAULT_CHOICE, writeChoice, type ExportChoice } from "./choices";
import { buildRequest, type ScreenState, type TableRows } from "./requests";

const menu = en.export.menu;
const IN_USE =
  "Hold Explorer could not save out.xlsx: another program has it open. Close the file or choose another name.";

/** The request a screen sends for its state, with the default choice unless another is given. */
function expected(state: ScreenState, table?: TableRows, choice: ExportChoice = DEFAULT_CHOICE) {
  return buildRequest(state, openHoldsFilter(), [], choice, table);
}

const LINES: ScreenState = { screen: "lines", query: presetQuery("all") };
const HOLDS: ScreenState = { screen: "holds", sort: "FileOrder", reverse: false };
const GROUP_KEYS = breakdownGroups().map((group) => group.key);
const BREAKDOWN: ScreenState = {
  screen: "breakdown",
  dim: DEFAULT_BREAKDOWN_STATE.by,
  shownKeys: GROUP_KEYS,
};
const MATRIX: ScreenState = {
  screen: "matrix",
  rows: DEFAULT_BREAKDOWN_STATE.rows,
  cols: DEFAULT_BREAKDOWN_STATE.cols,
};
const STEP_KEYS = solveView().rows.map((row) => row.key);
const BLOCKERS: ScreenState = { screen: "blockers", shownKeys: STEP_KEYS };

const SAVES = [menu.excel, menu.workbook, menu.csv, menu.report];
const COPIES = [menu.copyTable, menu.copyLineIds];
const CHART = [menu.chartPng, menu.chartSvg, menu.copyChart];

beforeEach(() => {
  window.localStorage.clear();
});

describe("the Export menu offers what each screen can export", () => {
  it("on the Overview: the view, the workbook, the report, and the four charts", async () => {
    const { user } = renderAt("/overview");
    const open = await openMenu(user);
    expect(itemNames(open)).toEqual([
      menu.excel,
      menu.workbook,
      menu.report,
      menu.chartsPng,
      menu.chartsSvg,
      menu.copyCharts,
    ]);
    // The view is several tables: no CSV, no table to copy, no rows to choose.
    expect(within(open).queryByRole("menuitem", { name: menu.csv })).not.toBeInTheDocument();
    expect(within(open).queryByRole("menuitem", { name: menu.copyTable })).not.toBeInTheDocument();
  });

  it.each([
    ["Lines", "/lines", [...SAVES, ...COPIES, menu.choice]],
    ["the holds of Lines", "/lines?rows=holds", [...SAVES, ...COPIES, menu.choice]],
    ["the list of Breakdown", "/breakdown", [...SAVES, ...COPIES, ...CHART, menu.choice]],
    [
      "the matrix of Breakdown",
      "/breakdown?mode=matrix",
      [menu.excel, menu.workbook, menu.csvHolds, menu.report, menu.copyHolds, ...CHART],
    ],
    ["Blockers", "/blockers", [...SAVES, ...COPIES, ...CHART, menu.choice]],
  ])("on %s", async (_, path, items) => {
    const { user } = renderAt(path);
    const open = await openMenu(user);
    expect(itemNames(open)).toEqual(items);
    // Nothing is selected, so there are no selected rows to copy.
    expect(itemNames(open).some((name) => name.startsWith("Copy selected"))).toBe(false);
  });

  it("names the save items by their result, ending in an ellipsis, and the copies without one", async () => {
    const { user } = renderAt("/blockers");
    const names = itemNames(await openMenu(user));
    for (const name of [menu.excel, menu.workbook, menu.csv, menu.report, menu.chartPng]) {
      expect(names).toContain(name);
      expect(name.endsWith("…")).toBe(true);
    }
    for (const name of [menu.copyTable, menu.copyLineIds, menu.copyChart]) {
      expect(name.endsWith("…")).toBe(false);
    }
    expect(en.export.menu.label).toBe("Export");
  });
});

describe("the shortcut of the first item", () => {
  it.each(["/overview", "/lines", "/breakdown", "/breakdown?mode=matrix", "/blockers"])(
    "is shown beside Excel, this view, and told to assistive technology on %s",
    async (path) => {
      const { user } = renderAt(path);
      const open = await openMenu(user);
      const excel = within(open).getByRole("menuitem", { name: menu.excel });
      expect(excel).toHaveAccessibleDescription(`${en.keys.ctrl}+E`);
      expect(excel).toHaveTextContent(`${en.keys.ctrl}+E`);
      expect(excel).toHaveAttribute("aria-keyshortcuts", "Control+E");
      // No other item has a shortcut.
      expect(open.querySelectorAll("[aria-keyshortcuts]")).toHaveLength(1);
    },
  );
});

type Expected =
  | { label: string; save: SaveFormat; copy?: never }
  | { label: string; copy: CopyFormat; save?: never };

/** Chooses each item in turn and checks the command it sent: its format, and the request. */
async function expectEach(
  app: ReturnType<typeof renderAt>,
  items: readonly Expected[],
  request: ReturnType<typeof expected>,
): Promise<void> {
  for (const item of items) {
    const open = await openMenu(app.user);
    const saved = app.saves.length;
    const copied = app.copies.length;
    await app.user.click(within(open).getByRole("menuitem", { name: item.label }));
    if (item.save !== undefined) {
      await waitFor(() => {
        expect(app.saves).toHaveLength(saved + 1);
      });
      const sent = must(app.saves.at(-1));
      expect(sent.format, item.label).toEqual(item.save);
      expect(sent.request, item.label).toEqual(request);
    } else {
      await waitFor(() => {
        expect(app.copies).toHaveLength(copied + 1);
      });
      const sent = must(app.copies.at(-1));
      expect(sent.format, item.label).toEqual(item.copy);
      expect(sent.request, item.label).toEqual(request);
    }
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  }
}

const TABLE_ITEMS: Expected[] = [
  { label: menu.excel, save: { kind: "Excel" } },
  { label: menu.workbook, save: { kind: "Workbook" } },
  { label: menu.csv, save: { kind: "Csv" } },
  { label: menu.report, save: { kind: "Report" } },
  { label: menu.copyTable, copy: { kind: "Table" } },
  { label: menu.copyLineIds, copy: { kind: "LineIds" } },
];

describe("each item exports the screen as it is", () => {
  it("on Lines", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    await expectEach(app, TABLE_ITEMS, expected(LINES, { loaded: 3, selected: [] }));
    // The dialog offers the name of the file, after the workspace, the view, and the snapshot.
    expect(windowApi.chooseSavePath).toHaveBeenCalledWith(
      expect.stringMatching(/^HoldExplorer_.+_Lines_\d{4}-\d{2}-\d{2}\.xlsx$/),
      "xlsx",
    );
  });

  it("on the holds of Lines", SLOW, async () => {
    const app = renderAt("/lines?rows=holds");
    await rowOf(lineId(0));
    await expectEach(app, TABLE_ITEMS, expected(HOLDS, { loaded: 3, selected: [] }));
    expect(DEFAULT_HOLDS_STATE).toMatchObject({ sort: "FileOrder", reverse: false });
  });

  it("on the list of Breakdown, with the bars of its groups", SLOW, async () => {
    const app = renderAt("/breakdown");
    await rowOf("Piping");
    const bars = { kind: "Bars", dim: DEFAULT_BREAKDOWN_STATE.by } as const;
    await expectEach(
      app,
      [
        ...TABLE_ITEMS,
        { label: menu.chartPng, save: { kind: "ChartPng", chart: bars } },
        { label: menu.chartSvg, save: { kind: "ChartSvg", chart: bars } },
        { label: menu.copyChart, copy: { kind: "Chart", chart: bars } },
      ],
      expected(BREAKDOWN, { loaded: 3, selected: [] }),
    );
  });

  it("on the matrix of Breakdown, its holds and its heatmap", SLOW, async () => {
    const app = renderAt("/breakdown?mode=matrix");
    const heatmap = { kind: "Heatmap", rows: MATRIX.rows, cols: MATRIX.cols } as const;
    await expectEach(
      app,
      [
        { label: menu.excel, save: { kind: "Excel" } },
        { label: menu.workbook, save: { kind: "Workbook" } },
        { label: menu.csvHolds, save: { kind: "Csv" } },
        { label: menu.report, save: { kind: "Report" } },
        { label: menu.copyHolds, copy: { kind: "Table" } },
        { label: menu.chartPng, save: { kind: "ChartPng", chart: heatmap } },
        { label: menu.chartSvg, save: { kind: "ChartSvg", chart: heatmap } },
        { label: menu.copyChart, copy: { kind: "Chart", chart: heatmap } },
      ],
      expected(MATRIX),
    );
  });

  it("on Blockers, with the curve as it is drawn", SLOW, async () => {
    const app = renderAt("/blockers");
    await rowOf("1");
    // The four steps are the head of the curve, which draws them all.
    const curve = { kind: "Curve", steps: 4 } as const;
    await expectEach(
      app,
      [
        ...TABLE_ITEMS,
        { label: menu.chartPng, save: { kind: "ChartPng", chart: curve } },
        { label: menu.chartSvg, save: { kind: "ChartSvg", chart: curve } },
        { label: menu.copyChart, copy: { kind: "Chart", chart: curve } },
      ],
      expected(BLOCKERS, { loaded: 4, selected: [] }),
    );
  });

  it("on the Overview, a chart from a submenu of each action", SLOW, async () => {
    const app = renderAt("/overview");
    await expectEach(
      app,
      [
        { label: menu.excel, save: { kind: "Excel" } },
        { label: menu.workbook, save: { kind: "Workbook" } },
        { label: menu.report, save: { kind: "Report" } },
      ],
      expected({ screen: "overview" }),
    );
    const charts = [
      [en.overview.byDiscipline, { kind: "Bars", dim: "Discipline" }],
      [en.overview.byHoldType, { kind: "Bars", dim: "HoldType" }],
      [en.overview.byRole, { kind: "Bars", dim: "Role" }],
      [en.overview.topBlockers, { kind: "TopBlockers" }],
    ] as const;
    for (const [label, chart] of charts) {
      for (const [action, saved] of [
        [menu.chartsPng, "ChartPng"],
        [menu.chartsSvg, "ChartSvg"],
        [menu.copyCharts, null],
      ] as const) {
        const open = await openMenu(app.user);
        await app.user.click(within(open).getByRole("menuitem", { name: action }));
        const submenu = await screen.findByRole("menu", { name: action });
        const name = saved === null ? label : `${label}…`;
        const before = saved === null ? app.copies.length : app.saves.length;
        await app.user.click(within(submenu).getByRole("menuitem", { name }));
        await waitFor(() => {
          expect(saved === null ? app.copies : app.saves).toHaveLength(before + 1);
        });
        const sent = must(saved === null ? app.copies.at(-1) : app.saves.at(-1));
        expect(sent.format).toEqual(
          saved === null ? { kind: "Chart", chart } : { kind: saved, chart },
        );
        expect(sent.request).toEqual(expected({ screen: "overview" }));
      }
    }
  });

  it("takes the columns and rows remembered for the screen", async () => {
    // Under the filters' status: another status writes every row (see the panel's tests).
    const choice: ExportChoice = {
      columns: ["holds", "line"],
      rows: "loaded",
      status: "filters",
    };
    writeChoice("lines", choice);
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    await expectEach(
      app,
      [{ label: menu.excel, save: { kind: "Excel" } }],
      expected(LINES, { loaded: 3, selected: [] }, choice),
    );
    const sent = must(app.saves[0]);
    expect(sent.request.columns).toEqual(["line", "holds"]);
    expect(sent.request.rows).toEqual({ kind: "First", count: 3 });
    expect(sent.request.spec.status).toBe("Open");
  });
});

describe("the selected rows", () => {
  it("are copied from Lines, with their count in the item", SLOW, async () => {
    const app = renderAt("/lines");
    await ctrlClick(app.user, await rowOf(lineId(0)), await rowOf(lineId(2)));
    const open = await openMenu(app.user);
    const label = menu.copySelected.replace("{{count, number}}", "2");
    expect(itemNames(open)).toEqual([
      ...SAVES,
      menu.copyTable,
      label,
      menu.copyLineIds,
      menu.choice,
    ]);
    await app.user.click(within(open).getByRole("menuitem", { name: label }));
    await waitFor(() => {
      expect(app.copies).toHaveLength(1);
    });
    const sent = must(app.copies[0]);
    expect(sent.format).toEqual({ kind: "Table" });
    expect(sent.request.rows).toEqual({ kind: "Keys", keys: [lineId(0), lineId(2)] });
  });

  it("are copied from Breakdown and from Blockers, in the order shown", SLOW, async () => {
    const app = renderAt("/breakdown");
    await ctrlClick(app.user, await rowOf("(blank)"), await rowOf("Piping"));
    const label = menu.copySelected.replace("{{count, number}}", "2");
    await app.user.click(within(await openMenu(app.user)).getByRole("menuitem", { name: label }));
    await waitFor(() => {
      expect(app.copies).toHaveLength(1);
    });
    expect(must(app.copies[0]).request.rows).toEqual({ kind: "Keys", keys: ["Piping", ""] });
    app.unmount();

    const blockers = renderAt("/blockers");
    const [first, , third] = solveView().rows;
    // A step is named by its number.
    await ctrlClick(blockers.user, await rowOf("3"), await rowOf("1"));
    await blockers.user.click(
      within(await openMenu(blockers.user)).getByRole("menuitem", { name: label }),
    );
    await waitFor(() => {
      expect(blockers.copies).toHaveLength(1);
    });
    expect(must(blockers.copies[0]).request.rows).toEqual({
      kind: "Keys",
      keys: [must(first).key, must(third).key],
    });
  });
});

describe("the groups selected on Breakdown", () => {
  it("are let go when the page shows the matrix, and not back with the list", SLOW, async () => {
    const app = renderAt("/breakdown");
    await ctrlClick(app.user, await rowOf("Piping"), await rowOf("Civil"));
    const label = menu.copySelected.replace("{{count, number}}", "2");
    expect(itemNames(await openMenu(app.user))).toContain(label);
    await app.user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    await app.user.click(screen.getByRole("radio", { name: en.breakdown.modeMatrix }));
    await app.user.click(await screen.findByRole("radio", { name: en.breakdown.modeList }));
    await rowOf("Piping");
    expect(screen.queryAllByRole("row", { selected: true })).toHaveLength(0);
    expect(
      itemNames(await openMenu(app.user)).some((name) => name.startsWith("Copy selected")),
    ).toBe(false);
  });
});

describe("Ctrl+E", () => {
  it.each([
    ["the Overview", "/overview", { screen: "overview" }, undefined],
    ["Lines", "/lines", LINES, { loaded: 3, selected: [] }],
    ["the list of Breakdown", "/breakdown", BREAKDOWN, { loaded: 3, selected: [] }],
    ["the matrix of Breakdown", "/breakdown?mode=matrix", MATRIX, undefined],
    ["Blockers", "/blockers", BLOCKERS, { loaded: 4, selected: [] }],
  ] as const)("saves the view of %s as Excel", SLOW, async (_, path, state, table) => {
    const app = renderAt(path);
    await exportButton();
    if (state.screen !== "overview" && state.screen !== "matrix") {
      await screen.findByRole(state.screen === "breakdown" ? "treegrid" : "grid");
      await waitFor(() => {
        expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
      });
    }
    await app.user.keyboard("{Control>}e{/Control}");
    await waitFor(() => {
      expect(app.saves).toHaveLength(1);
    });
    expect(must(app.saves[0]).format).toEqual({ kind: "Excel" });
    expect(must(app.saves[0]).request).toEqual(expected(state, table));
  });

  it("saves while the focus is in a table", SLOW, async () => {
    const app = renderAt("/lines");
    const row = await rowOf(lineId(1));
    await app.user.click(row);
    expect(screen.getByRole("grid")).toContainElement(document.activeElement as HTMLElement);
    await app.user.keyboard("{Control>}e{/Control}");
    await waitFor(() => {
      expect(app.saves).toHaveLength(1);
    });
  });

  it("does nothing while a text field has focus, or while a menu is open", SLOW, async () => {
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const button = await exportButton();
    const field = document.createElement("input");
    document.body.append(field);
    try {
      act(() => {
        field.focus();
      });
      await app.user.keyboard("{Control>}e{/Control}");
      await app.user.click(button);
      await screen.findByRole("menu", { name: menu.name });
      await app.user.keyboard("{Control>}e{/Control}");
      await app.user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      });
      expect(windowApi.chooseSavePath).not.toHaveBeenCalled();
      expect(app.saves).toHaveLength(0);
    } finally {
      field.remove();
    }
  });
});

describe("while an export runs", () => {
  it("the button shows it, opens nothing, and no other export starts", SLOW, async () => {
    let finish: () => void = () => undefined;
    const app = renderAt("/lines", {
      export_save: (args) =>
        new Promise((resolve) => {
          finish = () => {
            resolve({ path: args.path, rows: 3 });
          };
        }),
    });
    await rowOf(lineId(0));
    const open = await openMenu(app.user);
    await app.user.click(within(open).getByRole("menuitem", { name: menu.excel }));
    const button = screen.getByRole("button", { name: menu.label });
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-busy", "true");
    });
    expect(button.querySelector('[data-part="spinner"]')).not.toBeNull();
    await app.user.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    act(() => {
      button.blur();
    });
    await app.user.keyboard("{Control>}e{/Control}");
    expect(windowApi.chooseSavePath).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
    });
  });

  it("the notice of a failure waits too, and its buttons start nothing", SLOW, async () => {
    let saves = 0;
    let finish: () => void = () => undefined;
    const app = renderAt("/lines", {
      export_save: () => {
        saves += 1;
        throw commandFailure("FileInUse", IN_USE);
      },
      export_copy: () =>
        new Promise((resolve) => {
          finish = () => {
            resolve(null);
          };
        }),
    });
    await rowOf(lineId(0));
    await app.user.click(
      within(await openMenu(app.user)).getByRole("menuitem", { name: menu.excel }),
    );
    const notice = await screen.findByRole("alert");
    await app.user.click(
      within(await openMenu(app.user)).getByRole("menuitem", { name: menu.copyTable }),
    );
    const retry = within(notice).getByRole("button", { name: en.common.retry });
    const another = within(notice).getByRole("button", { name: en.export.chooseAnother });
    await waitFor(() => {
      expect(retry).toHaveAttribute("aria-busy", "true");
    });
    expect(another).toHaveAttribute("aria-busy", "true");
    await app.user.click(retry);
    await app.user.click(another);
    expect(saves).toBe(1);
    expect(windowApi.chooseSavePath).toHaveBeenCalledTimes(1);

    finish();
    // The copy worked, and had the last result: the notice of the save is put away (one failure
    // stands at a time), and nothing was saved again meanwhile.
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(saves).toBe(1);
  });

  it("the menu waits while the rows on screen are of another request", SLOW, async () => {
    let calls = 0;
    const app = renderAt("/lines", {
      lines: () => {
        calls += 1;
        return calls === 1 ? linePage() : new Promise(() => undefined);
      },
    });
    await rowOf(lineId(0));
    const button = await exportButton();
    // Another sort: the rows of before stay, dimmed, until the new ones are there.
    await app.user.click(
      within(screen.getByRole("grid")).getByRole("columnheader", { name: en.lines.column.line }),
    );
    await waitFor(() => {
      expect(button).toHaveAttribute("data-inert");
    });
    expect(screen.getByRole("rowheader", { name: lineId(0) })).toBeInTheDocument();
    await app.user.keyboard("{Control>}e{/Control}");
    expect(windowApi.chooseSavePath).not.toHaveBeenCalled();
  });

  it("the menu waits on a first load", async () => {
    renderAt("/blockers", { solve_order: () => new Promise(() => undefined) });
    const button = await screen.findByRole("button", { name: menu.label });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-inert");
  });
});

describe("the menu waits", () => {
  it("while a switch of snapshot runs, and Ctrl+E saves nothing", SLOW, async () => {
    const app = renderAt("/lines", { snapshot_select: () => new Promise(() => undefined) });
    await rowOf(lineId(0));
    const button = await exportButton();
    await selectOlderSnapshot(app.user);
    await waitFor(() => {
      expect(button).toHaveAttribute("data-inert");
    });
    expect(button).toHaveAttribute("aria-busy", "true");
    act(() => {
      button.focus();
      button.blur();
    });
    await app.user.keyboard("{Control>}e{/Control}");
    expect(windowApi.chooseSavePath).not.toHaveBeenCalled();
  });

  it("on the Overview while the numbers of the snapshot before stand in", SLOW, async () => {
    let calls = 0;
    const app = renderAt("/overview", {
      snapshot_select: ({ id }) => opened({ selected: id }),
      overview: () => {
        calls += 1;
        return calls === 1 ? overviewView() : new Promise(() => undefined);
      },
    });
    const button = await exportButton();
    await selectOlderSnapshot(app.user);
    await waitFor(() => {
      expect(calls).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(button).toHaveAttribute("data-inert");
    });
    await app.user.keyboard("{Control>}e{/Control}");
    expect(windowApi.chooseSavePath).not.toHaveBeenCalled();
  });
});

describe("the phase of a save", () => {
  it("is in the name of the button while the command runs", SLOW, async () => {
    const app = renderAt("/lines", {
      export_save: (args) => {
        args.onProgress.onmessage("Writing");
        return new Promise(() => undefined);
      },
    });
    await rowOf(lineId(0));
    await app.user.click(
      within(await openMenu(app.user)).getByRole("menuitem", { name: menu.excel }),
    );
    expect(await screen.findByRole("button", { name: menu.phase.Writing })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(menu.phase.Writing.startsWith(menu.label)).toBe(true);
  });
});

describe("a saved status other than the filters'", () => {
  it("is named in every item it changes", SLOW, async () => {
    writeChoice("lines", { ...DEFAULT_CHOICE, status: "Released" });
    const app = renderAt("/lines");
    await rowOf(lineId(0));
    const note = menu.note.Released;
    const noted = (label: string) => label.replace("{{note}}", note);
    expect(itemNames(await openMenu(app.user))).toEqual([
      noted(menu.noted.excel),
      noted(menu.noted.workbook),
      noted(menu.noted.csv),
      noted(menu.noted.report),
      noted(menu.noted.copyTable),
      noted(menu.noted.copyLineIds),
      menu.choice,
    ]);
    expect(noted(menu.noted.excel)).toBe("Excel, this view (released holds)…");
  });

  it("is named in the chart items of the Overview", SLOW, async () => {
    writeChoice("overview", { ...DEFAULT_CHOICE, status: "All" });
    const app = renderAt("/overview");
    const noted = (label: string) => label.replace("{{note}}", menu.note.All);
    expect(itemNames(await openMenu(app.user))).toEqual([
      noted(menu.noted.excel),
      noted(menu.noted.workbook),
      noted(menu.noted.report),
      noted(menu.noted.chartsPng),
      noted(menu.noted.chartsSvg),
      noted(menu.noted.copyCharts),
    ]);
  });
});

describe("a screen without rows", () => {
  it("offers no copy of its rows on Lines", SLOW, async () => {
    const app = renderAt("/lines", { lines: () => linePage({ total: 0 }) });
    const names = itemNames(await openMenu(app.user));
    expect(names).not.toContain(menu.copyTable);
    expect(names).not.toContain(menu.copyLineIds);
    expect(names).toContain(menu.excel);
  });

  it("offers no copy of its table on an empty matrix", SLOW, async () => {
    const app = renderAt("/breakdown?mode=matrix", {
      matrix: () => ({
        rows: [],
        cols: [],
        other_row: null,
        other_col: null,
        cells: [],
        max_cell: 0,
        folded_rows: 0,
        folded_cols: 0,
      }),
    });
    const names = itemNames(await openMenu(app.user));
    expect(names).not.toContain(menu.copyHolds);
    expect(names).toContain(menu.csvHolds);
  });
});

describe("one failure at a time", () => {
  it(
    "a copy that works puts away the failure of a save, and a copy that fails replaces it",
    SLOW,
    async () => {
      let copyFails = false;
      const app = renderAt("/lines", {
        export_save: () => {
          throw commandFailure("FileInUse", IN_USE);
        },
        export_copy: () => {
          if (copyFails) throw commandFailure("Clipboard", "The clipboard is busy. Copy again.");
          return null;
        },
      });
      await rowOf(lineId(0));
      await app.user.click(
        within(await openMenu(app.user)).getByRole("menuitem", { name: menu.excel }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(IN_USE);
      await app.user.click(
        within(await openMenu(app.user)).getByRole("menuitem", { name: menu.copyTable }),
      );
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });

      await app.user.click(
        within(await openMenu(app.user)).getByRole("menuitem", { name: menu.excel }),
      );
      await screen.findByRole("alert");
      copyFails = true;
      await app.user.click(
        within(await openMenu(app.user)).getByRole("menuitem", { name: menu.copyTable }),
      );
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("The clipboard is busy.");
      });
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    },
  );
});

describe("a workspace without snapshots", () => {
  it.each([
    ["/overview", en.overview.emptyTitle],
    ["/lines", en.lines.emptyTitle],
    ["/breakdown", en.breakdown.emptyTitle],
    ["/blockers", en.blockers.emptyTitle],
  ])("has no Export menu on %s", async (path, empty) => {
    renderApp({
      path,
      start: openStart({
        open: opened({
          workspace: workspace({ snapshot_count: 0, latest_taken_at: null }),
          snapshots: [],
          selected: null,
        }),
      }),
      handlers: { overview: () => null },
    });
    await screen.findByText(empty);
    expect(screen.queryByRole("button", { name: menu.label })).not.toBeInTheDocument();
  });
});

describe("a failed export", () => {
  it("is said in a notice under the header of the page", SLOW, async () => {
    const app = renderAt("/lines", {
      export_save: () => {
        throw commandFailure("FileInUse", IN_USE);
      },
    });
    await rowOf(lineId(0));
    await app.user.click(
      within(await openMenu(app.user)).getByRole("menuitem", { name: menu.excel }),
    );
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(en.export.saveFailed);
    expect(notice).toHaveTextContent(IN_USE);
    expect(notice.previousElementSibling?.tagName).toBe("HEADER");
    expect(within(notice).getByRole("button", { name: en.export.chooseAnother })).toBeVisible();
  });
});

describe("the Export menu by keyboard", () => {
  it("opens a submenu of the Overview and saves a chart", SLOW, async () => {
    const app = renderAt("/overview");
    const button = await exportButton();
    act(() => {
      button.focus();
    });
    await app.user.keyboard("{Enter}");
    const open = await screen.findByRole("menu", { name: menu.name });
    const png = within(open).getByRole("menuitem", { name: menu.chartsPng });
    for (let step = 0; step < 3; step += 1) await app.user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(png).toHaveFocus();
    });
    await app.user.keyboard("{ArrowRight}");
    const submenu = await screen.findByRole("menu", { name: menu.chartsPng });
    await waitFor(() => {
      expect(
        within(submenu).getByRole("menuitem", { name: `${en.overview.byDiscipline}…` }),
      ).toHaveFocus();
    });
    await app.user.keyboard("{ArrowDown}");
    await app.user.keyboard("{Enter}");
    await waitFor(() => {
      expect(app.saves).toHaveLength(1);
    });
    expect(must(app.saves[0]).format).toEqual({
      kind: "ChartPng",
      chart: { kind: "Bars", dim: "HoldType" },
    });
  });
});

describe("accessibility", () => {
  it("has no violation with the menu open, and with a submenu open", SLOW, async () => {
    const lines = renderAt("/lines");
    await rowOf(lineId(0));
    await openMenu(lines.user);
    await expectAccessible();
    lines.unmount();

    const overview = renderAt("/overview");
    const open = await openMenu(overview.user);
    await overview.user.click(within(open).getByRole("menuitem", { name: menu.chartsSvg }));
    await screen.findByRole("menu", { name: menu.chartsSvg });
    await expectAccessible();
  });
});
