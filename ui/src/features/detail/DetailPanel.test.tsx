import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LineDetail } from "../../bindings/LineDetail";
import type { ViewRef } from "../../bindings/ViewRef";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { opened, openStart, workspace } from "../../test/fixtures";
import { commandFailure, type Handlers } from "../../test/ipc";
import { holdRef, lineDetail, lineId } from "../../test/lines";
import { SLOW } from "../../test/slow";
import { formatDate, formatDateTime, formatDays, formatSize } from "../../text/format";

const text = en.detail;
const fact = text.fact;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };
const LINE = lineId(0);
const NEWEST = "2026-10-07T08:00:00";

/** The text of the catalog with its placeholders filled. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)(, number)?\}\}/g, (_, name: string) => String(values[name]));
}

interface Options {
  path?: string;
  handlers?: Handlers;
}

/** The app on Lines at `path`, with the test's own answers. */
function renderDetail({ path = `/lines?line=${LINE}`, handlers = {} }: Options = {}) {
  return renderApp({ start: openStart(), path, handlers });
}

/** The detail panel, once it is there. */
async function panel(name = LINE): Promise<HTMLElement> {
  return screen.findByRole("complementary", { name });
}

function factValue(list: HTMLElement, label: string): string {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.firstElementChild?.textContent === label);
  return must(row, `the fact ${label}`).textContent.slice(label.length);
}

function factLabels(list: HTMLElement): string[] {
  return (
    within(list)
      .getAllByRole("listitem")
      .map((item) => item.firstElementChild?.textContent ?? "")
      // A list that loads says so in a row of its own, to assistive technology only.
      .filter((label) => label !== "" && label !== en.common.loading)
  );
}

/** The row of a table that holds a line ID, once the table shows it. */
async function rowOf(id: string, table = en.lines.linesTable): Promise<HTMLElement> {
  const grid = await screen.findByRole("grid", { name: table });
  return must((await within(grid).findByRole("rowheader", { name: id })).closest("[role='row']"));
}

function layout(): HTMLElement {
  return must(document.querySelector<HTMLElement>("[data-part='detail-panel']")?.parentElement);
}

function setWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  Reflect.deleteProperty(window, "innerWidth");
});

describe("The panel of a line", () => {
  it("asks for the line with the view, and shows its facts", async () => {
    const line = vi.fn(({ lineId: id }: { lineId: string }) => lineDetail(id));
    renderDetail({ handlers: { line_detail: line } });
    const region = await panel();
    expect(within(region).getByRole("heading", { level: 2, name: LINE })).toBeInTheDocument();
    const facts = await within(region).findByRole("list", { name: text.lineFacts });
    expect(line).toHaveBeenCalledWith({ lineId: LINE, view: VIEW });
    expect(factValue(facts, fact.modelSize)).toBe(formatSize(8));
    expect(factValue(facts, fact.ldtSize)).toBe(`${formatSize(10)}${text.sizeMismatch}`);
    expect(factValue(facts, fact.stressCalc)).toBe("Required");
  });

  it("lists the blockers in order, with their step or the words for none", async () => {
    renderDetail();
    const region = await panel();
    const chain = await within(region).findByRole("list", { name: text.blockers });
    const items = within(chain).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Piping / 577-PK-400");
    expect(items[0]).toHaveTextContent("PK");
    expect(items[0]).toHaveTextContent(fill(text.step, { step: 3 }));
    expect(items[0]).toHaveTextContent(fill(text.blocksLines_other, { count: 12 }));
    expect(items[1]).toHaveTextContent("Civil / Client decision");
    expect(items[1]).toHaveTextContent(text.noStep);
    expect(items[1]).toHaveTextContent(fill(text.blocksLines_one, { count: 1 }));
  });

  it("lists the open holds and, one press away, the released ones", async () => {
    const { user } = renderDetail();
    const region = await panel();
    const open = await within(region).findByRole("list", { name: text.openHolds });
    const holds = within(open).getAllByRole("button");
    expect(holds).toHaveLength(2);
    const first = must(holds[0]);
    expect(first).toHaveTextContent("Piping, Vendor data");
    expect(first).toHaveTextContent("HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400");
    expect(first).toHaveTextContent(
      fill(text.raisedByOn, { who: "A. Haddad, Lead engineer", date: formatDate("2026-08-27") }),
    );
    expect(first).toHaveTextContent(fill(text.age, { days: formatDays(41) }));
    expect(holds[1]).toHaveTextContent("HOLD UNTIL CLIENT CONFIRMS THE ROUTING NEAR THE PIPE RACK");

    const released = within(region).getByRole("button", {
      name: `${text.releasedHolds} ${fill(text.holdCount_one, { count: 1 })}`,
    });
    expect(released).toHaveAttribute("aria-expanded", "false");
    await user.click(released);
    const list = await within(region).findByRole("list", { name: text.releasedHolds });
    const hold = within(list).getByRole("button");
    expect(hold).toHaveTextContent("HOLD FOR STRESS CALCULATION");
    expect(hold).toHaveTextContent(fill(text.duration, { days: formatDays(23) }));
  });

  it("opens a hold that is pressed", async () => {
    const hold = vi.fn(({ position }: { position: number }) => holdRef(position));
    const { user, router } = renderDetail({ handlers: { hold_detail: hold } });
    const region = await panel();
    const open = await within(region).findByRole("list", { name: text.openHolds });
    await user.click(must(within(open).getAllByRole("button")[1]));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?hold=3");
    });
    const holdPanel = await panel(text.holdTitle);
    expect(hold).toHaveBeenCalledWith({ position: 3, view: VIEW });
    // The button is gone, so the focus is on the heading of what it opened.
    await waitFor(() => {
      expect(within(holdPanel).getByRole("heading", { level: 2 })).toHaveFocus();
    });
  });

  it("copies the line ID and says so", async () => {
    const { user } = renderDetail();
    const region = await panel();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(within(region).getByRole("button", { name: text.copyLineId }));
    expect(write).toHaveBeenCalledWith(LINE);
    expect(await within(region).findByText(text.copied)).toHaveAttribute("role", "status");
    expect(await navigator.clipboard.readText()).toBe(LINE);
  });

  it("says why the line ID could not be copied when the system refuses", async () => {
    const { user } = renderDetail();
    const region = await panel();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Write permission denied."),
    );
    await user.click(within(region).getByRole("button", { name: text.copyLineId }));
    const alert = await within(region).findByRole("alert");
    expect(alert).toHaveTextContent(text.copyFailedTitle);
    expect(alert).toHaveTextContent("Write permission denied.");
    expect(within(region).queryByText(text.copied)).not.toBeInTheDocument();
  });

  it("says that a line is not in the snapshot, and closes", async () => {
    const { user, router } = renderDetail({
      path: "/lines?line=78B99-000-NOPE",
      handlers: { line_detail: () => null },
    });
    const region = await panel("78B99-000-NOPE");
    expect(
      await within(region).findByRole("heading", { name: text.lineMissingTitle }),
    ).toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    // The close button of the head, and the action of the empty state.
    const closes = within(region).getAllByRole("button", { name: text.closePanel });
    expect(closes).toHaveLength(2);
    await user.click(must(closes.at(-1), "the action of the empty state"));
    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows skeletons in the shape of its sections on a first load", async () => {
    renderDetail({
      handlers: { line_detail: () => new Promise<LineDetail | null>(() => undefined) },
    });
    const region = await panel();
    const facts = within(region).getByRole("list", { name: text.lineFacts });
    expect(facts).toHaveAttribute("aria-busy", "true");
    expect(factLabels(facts)).toEqual([fact.modelSize, fact.ldtSize, fact.stressCalc]);
    expect(within(region).getByRole("heading", { level: 3, name: text.blockers })).toBeVisible();
    expect(within(region).getByRole("heading", { level: 3, name: text.openHolds })).toBeVisible();
    expect(region.querySelectorAll("[data-part='detail-skeleton']")).toHaveLength(2);
  });

  it("shows the error with a retry, and the line once it is read", async () => {
    let calls = 0;
    const { user } = renderDetail({
      handlers: {
        line_detail: ({ lineId: id }) => {
          calls += 1;
          if (calls === 1) {
            throw commandFailure("Io", "The workspace file could not be read (it is locked).");
          }
          return lineDetail(id);
        },
      },
    });
    const region = await panel();
    const alert = await within(region).findByRole("alert");
    expect(alert).toHaveTextContent(text.errorLine);
    expect(alert).toHaveTextContent("The workspace file could not be read (it is locked).");
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    expect(await within(region).findByRole("list", { name: text.lineFacts })).toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves out what a limited snapshot without sizes cannot fill", async () => {
    renderDetail({
      handlers: {
        filter_options: () =>
          filterOptions({
            absent: [
              "Released",
              "ReleaseRemark",
              "ReleaseDate",
              "ModelSize",
              "LdtSize",
              "StressCalc",
            ],
          }),
      },
    });
    const region = await panel();
    await within(region).findByRole("list", { name: text.openHolds });
    expect(within(region).queryByRole("list", { name: text.lineFacts })).not.toBeInTheDocument();
    expect(within(region).queryByText(fact.modelSize)).not.toBeInTheDocument();
    expect(within(region).queryByText(text.releasedHolds)).not.toBeInTheDocument();
    expect(within(region).queryByText(text.noReleasedHolds)).not.toBeInTheDocument();
  });
});

describe("The panel of a hold", () => {
  const extra = { Area: "North rack", "Work pack": "", Isometric: "ISO-573-0012" };

  it("asks for the hold, and shows every fact, extras with a value included", async () => {
    const hold = vi.fn(({ position }: { position: number }) =>
      holdRef(position, { extra, line_id: LINE }),
    );
    renderDetail({ path: "/lines?rows=holds&hold=7", handlers: { hold_detail: hold } });
    const region = await panel(text.holdTitle);
    const facts = await within(region).findByRole("list", { name: text.holdFacts });
    expect(hold).toHaveBeenCalledWith({ position: 7, view: VIEW });
    expect(
      within(region).getByText("HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400"),
    ).toBeVisible();
    expect(factLabels(facts)).toEqual([
      fact.line,
      fact.discipline,
      fact.holdType,
      fact.name,
      fact.role,
      fact.created,
      fact.age,
      fact.blocker,
      fact.blockerType,
      fact.sourceId,
    ]);
    expect(factValue(facts, fact.line)).toBe(LINE);
    expect(factValue(facts, fact.discipline)).toBe("Piping");
    expect(factValue(facts, fact.holdType)).toBe("Vendor data");
    expect(factValue(facts, fact.name)).toBe("A. Haddad");
    expect(factValue(facts, fact.role)).toBe("Lead engineer");
    expect(factValue(facts, fact.created)).toBe(formatDate("2026-08-27"));
    expect(factValue(facts, fact.age)).toBe(formatDays(41));
    expect(factValue(facts, fact.blocker)).toBe("577-PK-400");
    expect(factValue(facts, fact.blockerType)).toBe("PK");
    expect(factValue(facts, fact.sourceId)).toBe("1001");
    // An open hold has no release.
    expect(within(region).queryByText(fact.releasedOn)).not.toBeInTheDocument();
    expect(within(region).queryByText(fact.releaseRemark)).not.toBeInTheDocument();
    const others = within(region).getByRole("list", { name: text.otherColumns });
    expect(factLabels(others)).toEqual(["Area", "Isometric"]);
    expect(factValue(others, "Isometric")).toBe("ISO-573-0012");
  });

  it("shows the release of a released hold, and no age", async () => {
    renderDetail({
      path: "/lines?hold=2",
      handlers: {
        hold_detail: ({ position }) =>
          holdRef(position, {
            released: true,
            release_date: "2026-09-19T00:00:00",
            release_remark: "",
            source_id: null,
          }),
      },
    });
    const region = await panel(text.holdTitle);
    const facts = await within(region).findByRole("list", { name: text.holdFacts });
    expect(factValue(facts, fact.releasedOn)).toBe(formatDate("2026-09-19"));
    expect(factValue(facts, fact.duration)).toBe(formatDays(23));
    expect(factValue(facts, fact.releaseRemark)).toBe(text.noReleaseRemark);
    expect(factLabels(facts)).not.toContain(fact.age);
    expect(factLabels(facts)).not.toContain(fact.sourceId);
  });

  it("leads back to its line by the breadcrumb", async () => {
    const { user, router } = renderDetail({ path: "/lines?rows=holds&hold=1" });
    const region = await panel(text.holdTitle);
    const trail = await within(region).findByRole("navigation", { name: en.breadcrumb.label });
    await user.click(within(trail).getByRole("link", { name: LINE }));
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?rows=holds&line=${LINE}`);
    });
    expect(await panel(LINE)).toBeInTheDocument();
  });

  it("says that a position past the end is not in the snapshot", async () => {
    renderDetail({ path: "/lines?hold=99999", handlers: { hold_detail: () => null } });
    const region = await panel(text.holdTitle);
    expect(
      await within(region).findByRole("heading", { name: text.holdMissingTitle }),
    ).toBeInTheDocument();
    expect(within(region).getAllByRole("button", { name: text.closePanel })).toHaveLength(2);
  });
});

describe("The panel and the keyboard", () => {
  it(
    "opens on Enter with the focus on its heading, and Escape gives it back to the row",
    SLOW,
    async () => {
      const { user, router } = renderDetail({ path: "/lines" });
      const row = await rowOf(lineId(1));
      act(() => {
        row.focus();
      });
      await user.keyboard("{Enter}");
      const region = await panel(lineId(1));
      const heading = within(region).getByRole("heading", { level: 2, name: lineId(1) });
      await waitFor(() => {
        expect(heading).toHaveFocus();
      });
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(router.state.location.search).toBe("");
      expect(await rowOf(lineId(1))).toHaveFocus();
    },
  );

  it(
    "opens on a press and leaves the focus on the row; Escape on the table closes it",
    SLOW,
    async () => {
      const { user } = renderDetail({ path: "/lines" });
      await user.click(await rowOf(lineId(2)));
      const region = await panel(lineId(2));
      await within(region).findByRole("list", { name: text.lineFacts });
      expect(await rowOf(lineId(2))).toHaveFocus();
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      });
      expect(await rowOf(lineId(2))).toHaveFocus();
    },
  );

  it("gives the focus to the table when the row that opened the panel is gone", SLOW, async () => {
    const { user } = renderDetail({ path: "/lines" });
    await user.click(await rowOf(lineId(0)));
    const region = await panel(lineId(0));
    const open = await within(region).findByRole("list", { name: text.openHolds });
    // The hold opens in the panel; its line is not a row of the holds of this table.
    await user.click(must(within(open).getAllByRole("button")[0]));
    const holdPanel = await panel(text.holdTitle);
    await user.click(await within(holdPanel).findByRole("button", { name: text.closePanel }));
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    });
    const grid = screen.getByRole("grid", { name: en.lines.linesTable });
    expect(grid.contains(document.activeElement)).toBe(true);
  });

  it("closes only the popover of the filter bar on Escape", SLOW, async () => {
    const { user, router } = renderDetail();
    await panel();
    await user.click(await screen.findByRole("button", { name: en.filterChip.add }));
    const dialog = await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
    expect(router.state.location.search).toBe(`?line=${LINE}`);
    expect(screen.getByRole("complementary", { name: LINE })).toBeInTheDocument();
  });
});

describe("The panel and the snapshot in view", () => {
  async function selectOlder(user: ReturnType<typeof renderApp>["user"]) {
    await user.click(
      await screen.findByRole("button", {
        name: fill(en.snapshots.trigger, { date: formatDate(NEWEST) }),
      }),
    );
    const menu = await screen.findByRole("menu", { name: en.snapshots.menu });
    await user.click(must(within(menu).getAllByRole("menuitemradio")[1], "the older snapshot"));
  }

  it("closes on a hold when another snapshot is selected", SLOW, async () => {
    const { user, router } = renderDetail({
      path: "/lines?rows=holds&hold=1",
      handlers: { snapshot_select: ({ id }) => opened({ selected: id }) },
    });
    await within(await panel(text.holdTitle)).findByRole("list", { name: text.holdFacts });
    await selectOlder(user);
    await waitFor(() => {
      expect(router.state.location.search).toBe("?rows=holds");
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    });
    await screen.findByText(
      fill(en.snapshots.older, { date: formatDateTime("2026-09-30T14:05:00") }),
    );
  });

  it("reads a line again for the other snapshot, dimmed meanwhile", SLOW, async () => {
    const second = held<LineDetail | null>();
    const line = vi.fn(({ lineId: id, view }: { lineId: string; view: ViewRef }) =>
      view.snapshot_id === 2 ? lineDetail(id) : second.handler(),
    );
    const { user, router } = renderDetail({
      handlers: { line_detail: line, snapshot_select: ({ id }) => opened({ selected: id }) },
    });
    const region = await panel();
    await within(region).findByRole("list", { name: text.lineFacts });
    await selectOlder(user);
    await waitFor(() => {
      expect(line).toHaveBeenCalledWith({ lineId: LINE, view: { ...VIEW, snapshot_id: 1 } });
    });
    expect(router.state.location.search).toBe(`?line=${LINE}`);
    const body = must(region.querySelector("[data-part='detail-body']"));
    expect(body).toHaveAttribute("data-stale");
    expect(body).toHaveAttribute("aria-busy", "true");
    expect(within(region).getByRole("list", { name: text.lineFacts })).toBeInTheDocument();
    await act(async () => {
      must(second.waiting[0], "the reading of the older snapshot").resolve(
        lineDetail(LINE, { stress_calc: "Done" }),
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(body).not.toHaveAttribute("data-stale");
    });
    const facts = within(region).getByRole("list", { name: text.lineFacts });
    expect(factValue(facts, fact.stressCalc)).toBe("Done");
  });
});

describe("The place of the panel", () => {
  it("overlays the content below the wide breakpoint and sits beside it above", async () => {
    setWidth(1100);
    renderDetail();
    await panel();
    expect(layout()).toHaveAttribute("data-detail", "overlay");
    act(() => {
      setWidth(1400);
    });
    expect(layout()).toHaveAttribute("data-detail", "beside");
    act(() => {
      setWidth(1100);
    });
    expect(layout()).toHaveAttribute("data-detail", "overlay");
  });

  it("is shown on a data destination only", async () => {
    renderDetail({ path: `/settings?line=${LINE}` });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("passes the accessibility check with a line and with a hold", SLOW, async () => {
    const { user } = renderDetail();
    const region = await panel();
    await within(region).findByRole("list", { name: text.lineFacts });
    await within(await screen.findByRole("grid", { name: en.lines.linesTable })).findAllByRole(
      "rowheader",
    );
    await expectAccessible(document.body, { page: true });
    await user.click(
      within(region).getByRole("button", {
        name: `${text.releasedHolds} ${fill(text.holdCount_one, { count: 1 })}`,
      }),
    );
    await expectAccessible(document.body, { page: true });
    const open = within(region).getByRole("list", { name: text.openHolds });
    await user.click(must(within(open).getAllByRole("button")[0]));
    const holdPanel = await panel(text.holdTitle);
    await within(holdPanel).findByRole("list", { name: text.holdFacts });
    await expectAccessible(document.body, { page: true });
  });
});
