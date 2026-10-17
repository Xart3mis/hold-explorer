import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { keys } from "../../api/keys";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import type { FilterSpec } from "../../bindings/FilterSpec";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { breakdownGroups, groupDetail } from "../../test/breakdown";
import { filterOptions } from "../../test/filters";
import { openStart, opened, workspace } from "../../test/fixtures";
import { choose } from "../../test/flow";
import { commandFailure, type Handlers } from "../../test/ipc";
import { lineId, linePage } from "../../test/lines";
import { SLOW } from "../../test/slow";

const text = en.breakdown;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };

type BreakdownAnswer = NonNullable<Handlers["breakdown"]>;
type DetailAnswer = NonNullable<Handlers["group_detail"]>;

interface Options {
  path?: string;
  breakdown?: BreakdownAnswer;
  groupDetail?: DetailAnswer;
  handlers?: Handlers;
  filters?: Filters;
}

/** The app on Breakdown, with the test's own answers to `breakdown` and `group_detail`, both spies. */
function renderBreakdown({
  path = "/breakdown",
  breakdown = () => breakdownGroups(),
  groupDetail: detail = ({ key }) => groupDetail(key),
  handlers = {},
  filters,
}: Options = {}) {
  const breakdownSpy = vi.fn(breakdown);
  const detailSpy = vi.fn(detail);
  const app = renderApp({
    start: openStart(),
    path,
    handlers: { breakdown: breakdownSpy, group_detail: detailSpy, ...handlers },
  });
  // The filters of the workspace, as the filter bar would have left them.
  if (filters !== undefined)
    queryClient.setQueryData(keys.workspaceFilters(workspace().id), filters);
  return { ...app, breakdown: breakdownSpy, groupDetail: detailSpy };
}

function specWith(part: Partial<FilterSpec>): FilterSpec {
  return { ...openHoldsFilter(), ...part };
}

/** The table of the groups, once it is there. */
async function groupTable(name = "Discipline"): Promise<HTMLElement> {
  return screen.findByRole("treegrid", {
    name: text.table.replace("{{dim}}", name),
  });
}

/** The row whose header cell reads this text. */
function rowNamed(table: HTMLElement, name: string): HTMLElement {
  return must(
    within(table).getByRole("rowheader", { name }).closest<HTMLElement>('[role="row"]'),
    `the row ${name}`,
  );
}

async function findRow(table: HTMLElement, name: string): Promise<HTMLElement> {
  await within(table).findByRole("rowheader", { name });
  return rowNamed(table, name);
}

describe("BreakdownPage", () => {
  it("asks for the groups by discipline, and shows each with a bar, its holds, and its lines", async () => {
    const { breakdown } = renderBreakdown();
    const table = await groupTable();
    const piping = await findRow(table, "Piping");
    expect(breakdown).toHaveBeenCalledWith({ spec: specWith({}), dim: "Discipline", view: VIEW });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Discipline", text.column.share, text.column.holds, text.column.lines]);
    expect(within(piping).getByText("1,204")).toBeInTheDocument();
    expect(within(piping).getByText("312")).toBeInTheDocument();
    // The bar is as long as the group's holds of the largest group's: that one is the whole track.
    const bar = (row: HTMLElement) =>
      must(row.querySelector<HTMLElement>("[data-part='bar']"), "a bar");
    expect(bar(piping).style.inlineSize).toBe("100%");
    expect(bar(rowNamed(table, "Civil")).style.inlineSize).toBe("50%");
    expect(bar(rowNamed(table, "(blank)")).style.inlineSize).toBe(`${String((12 / 1204) * 100)}%`);
    expect(
      screen.getByText(en.breakdown.count_other.replace("{{count, number}}", "3")),
    ).toBeVisible();
  });

  it(
    "asks for the groups of another dimension when the group-by changes, and closes the groups",
    SLOW,
    async () => {
      const { user, router, breakdown } = renderBreakdown({
        path: "/breakdown?mode=list&by=Discipline&open=Piping",
      });
      const table = await groupTable();
      await findRow(table, lineId(0));
      await choose(user, new RegExp(text.groupBy), en.import.field.HoldType);
      await waitFor(() => {
        expect(breakdown).toHaveBeenLastCalledWith({
          spec: specWith({}),
          dim: "HoldType",
          view: VIEW,
        });
      });
      expect(router.state.location.search).toBe("?mode=list&by=HoldType");
      const byType = await groupTable(en.import.field.HoldType);
      await findRow(byType, "Piping");
      expect(within(byType).queryByRole("rowheader", { name: lineId(0) })).not.toBeInTheDocument();
    },
  );

  it("offers each dimension the snapshot has values for, and its extra columns", SLOW, async () => {
    const { user } = renderBreakdown({
      handlers: {
        filter_options: () => filterOptions({ absent: ["Role", "Name"], custom_dims: ["Area"] }),
      },
    });
    await groupTable();
    await user.click(screen.getByRole("button", { name: new RegExp(text.groupBy) }));
    const list = await screen.findByRole("listbox");
    await waitFor(() => {
      expect(
        within(list)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual([
        en.import.field.Discipline,
        en.import.field.HoldType,
        en.filters.dim.BlockerType,
        en.filters.dim.Blocker,
        en.import.field.Remark,
        en.import.field.ModelSize,
        en.import.field.StressCalc,
        "Area",
      ]);
    });
  });

  it("reads a group's lines once, when it is expanded, and shows them under it", SLOW, async () => {
    const { user, router, groupDetail: detail } = renderBreakdown();
    const table = await groupTable();
    const civil = await findRow(table, "Civil");
    expect(detail).not.toHaveBeenCalled();
    await user.click(civil);
    const first = await findRow(table, lineId(0));
    expect(detail).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledWith({
      spec: specWith({}),
      dim: "Discipline",
      key: "Civil",
      view: VIEW,
    });
    expect(first).toHaveAttribute("aria-level", "2");
    expect(rowNamed(table, "Civil")).toHaveAttribute("aria-expanded", "true");
    // A line shows its holds, its disciplines, and its oldest hold.
    const second = rowNamed(table, lineId(1));
    expect(second).toHaveTextContent("Piping, Civil");
    expect(second).toHaveTextContent("118");
    expect(router.state.location.search).toBe("?mode=list&by=Discipline&open=Civil");

    // Closed and opened again, the group is not read again.
    await user.click(rowNamed(table, "Civil"));
    await waitFor(() => {
      expect(within(table).queryByRole("rowheader", { name: lineId(0) })).not.toBeInTheDocument();
    });
    expect(router.state.location.search).toBe("?mode=list&by=Discipline");
    await user.click(rowNamed(table, "Civil"));
    await findRow(table, lineId(0));
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("opens the groups its address names, and keeps them in it", SLOW, async () => {
    const {
      user,
      router,
      groupDetail: detail,
    } = renderBreakdown({
      path: "/breakdown?mode=list&by=Discipline&open=Piping",
    });
    const table = await groupTable();
    await findRow(table, lineId(0));
    expect(detail).toHaveBeenCalledTimes(1);
    await user.click(rowNamed(table, "(blank)"));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?mode=list&by=Discipline&open=Piping%2C");
    });
    await waitFor(() => {
      expect(detail).toHaveBeenCalledWith(expect.objectContaining({ key: "" }));
    });
  });

  it(
    "shows a skeleton row while a group is read, and a row with a retry when it fails",
    SLOW,
    async () => {
      let fail = true;
      let answer: (() => void) | null = null;
      const { user, groupDetail: detail } = renderBreakdown({
        groupDetail: ({ key }) => {
          if (key === "Civil") {
            return new Promise((resolve) => {
              answer = () => {
                resolve(groupDetail(key));
              };
            });
          }
          if (fail) {
            throw commandFailure(
              "Io",
              "The workspace file could not be read (it is locked by another program). Close the other program, then try again.",
            );
          }
          return groupDetail(key);
        },
      });
      const table = await groupTable();
      await user.click(await findRow(table, "Civil"));
      const loading = await waitFor(() =>
        must(table.querySelector("[data-part='loading-row']"), "the loading row"),
      );
      expect(loading).toHaveTextContent(en.table.childLoading);
      act(() => {
        must(answer, "the reading of Civil")();
      });
      await findRow(table, lineId(0));
      expect(table.querySelector("[data-part='loading-row']")).toBeNull();

      await user.click(rowNamed(table, "Piping"));
      const error = await waitFor(() =>
        must(table.querySelector<HTMLElement>("[data-part='error-row']"), "the error row"),
      );
      // The command's own message says what happened and what to do; the row is under its group.
      expect(error).toHaveTextContent(
        "The workspace file could not be read (it is locked by another program). Close the other program, then try again.",
      );
      fail = false;
      const calls = detail.mock.calls.length;
      await user.click(within(error).getByRole("button", { name: en.common.retry }));
      await waitFor(() => {
        expect(table.querySelector("[data-part='error-row']")).toBeNull();
      });
      expect(detail.mock.calls.length).toBe(calls + 1);
    },
  );

  it("says when the filters no longer keep an expanded group, and collapses it", SLOW, async () => {
    const { user, router } = renderBreakdown({
      path: "/breakdown?mode=list&by=Discipline&open=Civil",
      groupDetail: ({ key }) => (key === "Civil" ? null : groupDetail(key)),
    });
    const table = await groupTable();
    const notice = await waitFor(() =>
      must(table.querySelector<HTMLElement>("[data-part='notice-row']"), "the notice row"),
    );
    expect(notice).toHaveTextContent(text.groupGone);
    await user.click(within(notice).getByRole("button", { name: text.collapse }));
    await waitFor(() => {
      expect(router.state.location.search).toBe("?mode=list&by=Discipline");
    });
    expect(rowNamed(table, "Civil")).toHaveAttribute("aria-expanded", "false");
  });

  it("expands none of the groups of before while another dimension is read", SLOW, async () => {
    const {
      user,
      router,
      groupDetail: detail,
    } = renderBreakdown({
      breakdown: ({ dim }) =>
        dim === "Discipline" ? breakdownGroups() : new Promise(() => undefined),
    });
    const table = await groupTable();
    await findRow(table, "Piping");
    await choose(user, new RegExp(text.groupBy), en.import.field.HoldType);
    await waitFor(() => {
      expect(router.state.location.search).toBe("?mode=list&by=HoldType");
    });
    // The groups of the discipline stay, dimmed, and do not expand.
    const piping = rowNamed(table, "Piping");
    expect(piping).not.toHaveAttribute("aria-expanded");
    await user.click(piping);
    expect(router.state.location.search).toBe("?mode=list&by=HoldType");
    expect(detail).not.toHaveBeenCalled();
  });

  it("opens a line of a group in the detail panel", SLOW, async () => {
    const { user, router } = renderBreakdown({
      path: "/breakdown?mode=list&by=Discipline&open=Civil",
    });
    const table = await groupTable();
    await user.click(await findRow(table, lineId(1)));
    await waitFor(() => {
      expect(router.state.location.search).toBe(
        `?mode=list&by=Discipline&open=Civil&line=${lineId(1)}`,
      );
    });
    expect(rowNamed(table, lineId(1))).toHaveAttribute("aria-selected", "true");
    const panel = await screen.findByRole("complementary");
    expect(
      await within(panel).findByRole("heading", { name: new RegExp(lineId(1)) }),
    ).toBeInTheDocument();
  });

  it(
    "opens all the lines of a group in Lines, filtered by its value in place of the field's",
    SLOW,
    async () => {
      const lines = vi.fn(() => linePage());
      const { user, router } = renderBreakdown({
        path: "/breakdown?mode=list&by=Discipline&open=Piping",
        groupDetail: ({ key }) => groupDetail(key, 900),
        handlers: { lines },
        filters: {
          ...defaultFilters,
          fields: [
            { dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false },
            {
              dim: "HoldType",
              values: [{ key: "Vendor data", label: "Vendor data" }],
              negate: true,
            },
          ],
        },
      });
      const table = await groupTable();
      const more = await waitFor(() =>
        must(table.querySelector<HTMLElement>("[data-part='more-row']"), "the last row"),
      );
      expect(more).toHaveTextContent(text.openAll_other.replace("{{count, number}}", "900"));
      // The group shows the lines it came with, not all of them.
      expect(table.querySelectorAll("[role='row'][aria-level='2']")).toHaveLength(201);
      await user.click(within(more).getByText(/900/));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/lines");
      });
      await waitFor(() => {
        expect(lines).toHaveBeenLastCalledWith(
          expect.objectContaining({
            spec: specWith({
              fields: [
                { dim: "Discipline", values: ["Piping"], negate: false },
                { dim: "HoldType", values: ["Vendor data"], negate: true },
              ],
            }),
          }),
        );
      });
    },
  );

  it("says nothing more of a group whose lines all came with it", SLOW, async () => {
    renderBreakdown({ path: "/breakdown?mode=list&by=Discipline&open=Civil" });
    const table = await groupTable();
    await findRow(table, lineId(2));
    expect(table.querySelector("[data-part='more-row']")).toBeNull();
  });

  describe("without groups", () => {
    it("leads to an import in a workspace without snapshots", async () => {
      const start = openStart({ open: opened({ snapshots: [], selected: null }) });
      const breakdown = vi.fn(() => breakdownGroups());
      renderApp({ start, path: "/breakdown", handlers: { breakdown } });
      const title = await screen.findByRole("heading", { level: 2, name: text.emptyTitle });
      expect(
        within(must(title.parentElement)).getByRole("button", { name: text.emptyAction }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
      expect(breakdown).not.toHaveBeenCalled();
    });

    it("offers to clear the filters that keep no hold", async () => {
      const { user, breakdown } = renderBreakdown({
        breakdown: ({ spec }) => (spec.fields.length === 0 ? breakdownGroups() : []),
        filters: {
          ...defaultFilters,
          fields: [{ dim: "Role", values: [{ key: "Checker", label: "Checker" }], negate: false }],
        },
      });
      const title = await screen.findByRole("heading", { level: 2, name: text.noneTitle });
      await user.click(
        within(must(title.parentElement)).getByRole("button", { name: text.noneAction }),
      );
      await findRow(await groupTable(), "Piping");
      expect(breakdown).toHaveBeenLastCalledWith(expect.objectContaining({ spec: specWith({}) }));
    });

    it("says when the snapshot has no open hold, and offers all holds", async () => {
      const { user, breakdown } = renderBreakdown({
        breakdown: ({ spec }) => (spec.status === "Open" ? [] : breakdownGroups()),
      });
      const title = await screen.findByRole("heading", { level: 2, name: text.noOpenTitle });
      await user.click(
        within(must(title.parentElement)).getByRole("button", { name: text.noOpenAction }),
      );
      await findRow(await groupTable(), "Piping");
      expect(breakdown).toHaveBeenLastCalledWith(
        expect.objectContaining({ spec: specWith({ status: "All" }) }),
      );
    });
  });

  it("shows an error with a retry when the groups cannot be read", async () => {
    let fail = true;
    const { user } = renderBreakdown({
      breakdown: () => {
        if (fail) throw commandFailure("Io", "The workspace file could not be read.");
        return breakdownGroups();
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text.error);
    fail = false;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await findRow(await groupTable(), "Piping");
  });

  it("is opened by Ctrl+2, has no Soon tag, and passes the accessibility check", SLOW, async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
    const nav = screen.getByRole("navigation", { name: en.destinations.label });
    const item = within(nav).getByRole("link", { name: en.destinations.name.breakdown });
    expect(item).not.toHaveTextContent(en.destinations.soon);
    await user.keyboard("{Control>}2{/Control}");
    expect(router.state.location.pathname).toBe("/breakdown");
    expect(
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.breakdown }),
    ).toBeInTheDocument();
    const table = await groupTable();
    await user.click(await findRow(table, "Civil"));
    await findRow(table, lineId(0));
    await expectAccessible(document.body, { page: true });
  });
});
