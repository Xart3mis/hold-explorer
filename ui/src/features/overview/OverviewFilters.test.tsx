import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import fixture from "../../api/open-holds-filter.json";
import { keys } from "../../api/keys";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import type { OverviewView } from "../../bindings/OverviewView";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { must, renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { openStart, workspace } from "../../test/fixtures";
import type { Handlers } from "../../test/ipc";
import { group, overviewView } from "../../test/overview";
import { SLOW } from "../../test/slow";

const text = en.overview;
const VIEW = { workspace_id: workspace().id, snapshot_id: 2 };

type Answer = NonNullable<Handlers["overview"]>;

/** The Overview with the test's own answers to `overview` and to `filter_options`, both spies. */
function renderOverview(answer: Answer = () => overviewView()) {
  const overview = vi.fn(answer);
  const options = vi.fn(() => filterOptions());
  const app = renderApp({
    start: openStart(),
    path: "/overview",
    handlers: { overview, filter_options: options },
  });
  return { ...app, overview, options };
}

/** The figures and the groups of the page, once they are read. */
async function content(): Promise<HTMLElement> {
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview });
  const found = await waitFor(() =>
    must(document.querySelector<HTMLElement>("[data-part='overview']"), "the content of the page"),
  );
  await waitFor(() => {
    expect(found).not.toHaveAttribute("aria-busy");
  });
  return found;
}

/** Sets the filters of the open workspace, as a control of the filter bar does. */
function set(filters: Partial<Filters>): void {
  act(() => {
    queryClient.setQueryData<Filters>(keys.workspaceFilters(workspace().id), {
      ...defaultFilters,
      ...filters,
    });
  });
}

/** Chooses a status in the filter bar. */
async function chooseStatus(
  user: ReturnType<typeof renderApp>["user"],
  from: "Open" | "Released" | "All",
  to: "Open" | "Released" | "All",
) {
  const name = en.filters.status.name.replace("{{status}}", en.filters.status[from]);
  await user.click(screen.getByRole("button", { name }));
  const menu = await screen.findByRole("menu", { name: en.filters.status.menu });
  await user.click(within(menu).getByRole("menuitemradio", { name: en.filters.status[to] }));
}

function tile(figures: string, label: string): HTMLElement {
  const group = screen.getByRole("group", { name: figures });
  return must(within(group).getByText(label).parentElement, `the tile ${label}`);
}

describe("the Overview and the filters", () => {
  it("asks with the default filters for exactly what it asked for before there were filters", async () => {
    const { overview, options } = renderOverview();
    await content();
    expect(overview).toHaveBeenCalledTimes(1);
    expect(overview).toHaveBeenCalledWith({ spec: openHoldsFilter(), view: VIEW });
    expect(overview).toHaveBeenCalledWith({ spec: fixture, view: VIEW });
    // The bar under its header counts with the same filter.
    expect(options).toHaveBeenCalledWith({ spec: fixture, view: VIEW });
  });

  it("reads the overview again with the spec of a filter that is set", async () => {
    const { overview, options } = renderOverview();
    await content();
    set({
      fields: [{ dim: "Discipline", values: [{ key: "Civil", label: "Civil" }], negate: false }],
    });
    const spec = {
      ...openHoldsFilter(),
      fields: [{ dim: "Discipline", values: ["Civil"], negate: false }],
    };
    await waitFor(() => {
      expect(overview).toHaveBeenLastCalledWith({ spec, view: VIEW });
    });
    expect(overview).toHaveBeenCalledTimes(2);
    expect(options).toHaveBeenLastCalledWith({ spec, view: VIEW });
    expect(screen.getByRole("button", { name: "Discipline Civil" })).toBeInTheDocument();
  });

  it(
    "keeps the numbers of before, dimmed, until those of the new filter are there",
    SLOW,
    async () => {
      const later = held<OverviewView | null>();
      let readings = 0;
      const { user, overview } = renderOverview(() => {
        readings += 1;
        return readings === 1 ? overviewView() : later.handler();
      });
      const shown = await content();
      expect(tile(text.figures, text.openHolds)).toHaveTextContent("5,042");

      await chooseStatus(user, "Open", "Released");
      await waitFor(() => {
        expect(shown).toHaveAttribute("data-stale");
      });
      expect(shown).toHaveAttribute("aria-busy", "true");
      expect(shown).toHaveTextContent("5,042");
      expect(shown).toHaveTextContent("1,515");
      expect(screen.getByText(text.updating)).toBeInTheDocument();
      expect(overview).toHaveBeenLastCalledWith({
        spec: { ...openHoldsFilter(), status: "Released" },
        view: VIEW,
      });

      await act(async () => {
        must(later.waiting[0], "the second reading").resolve(
          overviewView({
            summary: {
              holds: 4258,
              lines: 1904,
              single_hold_lines: 655,
              median_age_days: null,
              median_duration_days: 18,
            },
            by_discipline: [group("Civil", 1290, 540)],
            by_hold_type: [group("Vendor data", 1802, 1211)],
          }),
        );
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(shown).not.toHaveAttribute("data-stale");
      });
      expect(shown).not.toHaveAttribute("aria-busy");
      expect(tile(text.releasedFigures, text.releasedHolds)).toHaveTextContent("4,258");
      expect(shown).not.toHaveTextContent("5,042");
      expect(screen.getByText(text.updated)).toBeInTheDocument();
    },
  );

  it(
    "names what it shows after the status: the released holds, with how long they were on hold",
    SLOW,
    async () => {
      const { user } = renderOverview((args) =>
        args.spec.status === "Released"
          ? overviewView({
              summary: {
                holds: 4258,
                lines: 1904,
                single_hold_lines: 655,
                median_age_days: null,
                median_duration_days: 18,
              },
            })
          : overviewView(),
      );
      await content();
      await chooseStatus(user, "Open", "Released");
      await screen.findByRole("group", { name: text.releasedFigures });
      await content();

      const figures = text.releasedFigures;
      expect(tile(figures, text.releasedHolds)).toHaveTextContent(`${text.releasedHolds} 4,258`);
      expect(tile(figures, text.releasedLines)).toHaveTextContent(`${text.releasedLines} 1,904`);
      expect(tile(figures, text.singleHoldLines)).toHaveTextContent(`${text.singleHoldLines} 655`);
      expect(tile(figures, text.releasedMedianDuration)).toHaveTextContent(
        `${text.releasedMedianDuration} 18 d`,
      );
      // Nothing on the page still calls the released holds open.
      expect(screen.queryByText(text.openHolds)).not.toBeInTheDocument();
      expect(screen.queryByText(text.linesOnHold)).not.toBeInTheDocument();
      expect(screen.queryByText(text.medianAge)).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: text.releasedByDiscipline }),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { level: 2, name: text.releasedByHoldType }),
      ).toBeVisible();
      expect(screen.getByRole("list", { name: text.releasedByDiscipline })).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: text.releasedShowDisciplineAsTable }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: text.releasedShowHoldTypeAsTable }),
      ).toBeInTheDocument();
    },
  );

  it("says why there is no duration when no released hold has both of its dates", async () => {
    renderOverview(() =>
      overviewView({
        summary: {
          holds: 12,
          lines: 9,
          single_hold_lines: 7,
          median_age_days: null,
          median_duration_days: null,
        },
      }),
    );
    await content();
    set({ status: "Released" });
    await screen.findByRole("group", { name: text.releasedFigures });
    expect(tile(text.releasedFigures, text.releasedMedianDuration)).toHaveTextContent(
      text.releasedMedianDurationMissing,
    );
  });

  it("names what it shows for all holds, and says whose age the median is", async () => {
    renderOverview();
    await content();
    set({ status: "All" });
    await screen.findByRole("group", { name: text.allFigures });
    const figures = text.allFigures;
    expect(tile(figures, text.allHolds)).toHaveTextContent(`${text.allHolds} 5,042`);
    expect(tile(figures, text.allLines)).toHaveTextContent(`${text.allLines} 2,208`);
    expect(tile(figures, text.allMedianAge)).toHaveTextContent(`${text.allMedianAge} 41 d`);
    expect(screen.getByRole("heading", { level: 2, name: text.allByDiscipline })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: text.allByHoldType })).toBeVisible();
    expect(screen.queryByText(text.openHolds)).not.toBeInTheDocument();
  });

  it("says that no hold matches the filters, and not that the snapshot has no open hold, when filters are set", async () => {
    const { user } = renderOverview(() =>
      overviewView({
        summary: {
          holds: 0,
          lines: 0,
          single_hold_lines: 0,
          median_age_days: null,
          median_duration_days: null,
        },
        by_discipline: [],
        by_hold_type: [],
      }),
    );
    await content();
    expect(screen.getAllByText(text.noOpenHolds)).toHaveLength(2);

    set({ text: "no such remark" });
    await waitFor(() => {
      expect(screen.getAllByText(text.noneMatch)).toHaveLength(2);
    });
    expect(screen.queryByText(text.noOpenHolds)).not.toBeInTheDocument();

    // Clearing the filters brings the sentence about the snapshot back.
    await user.click(screen.getByRole("button", { name: en.filters.clear }));
    await waitFor(() => {
      expect(screen.getAllByText(text.noOpenHolds)).toHaveLength(2);
    });
  });
});
