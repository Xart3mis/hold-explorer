import { act, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { useSnapshotActions } from "../../app/actions/snapshots";
import { useWorkspaceActions } from "../../app/actions/workspaces";
import { defaultFilters, useFilters, type Filters } from "../../app/filters/state";
import { Page } from "../../app/shell/Page";
import type { FilterOptions } from "../../bindings/FilterOptions";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { filterOptions } from "../../test/filters";
import { opened, openStart, otherWorkspace, workspace } from "../../test/fixtures";
import { commandFailure, type Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { SettingsPage } from "../settings/SettingsPage";
import { FilterBar } from "./FilterBar";

const text = en.filters;

type Held = ReturnType<typeof useFilters> & {
  select: (id: number) => void;
  rename: (name: string) => void;
  open: (id: string) => void;
};

/** What the page of the test reads: the filters, and two actions on the workspace. */
const probe: { page?: Held } = {};

function now(): Held {
  if (probe.page === undefined) throw new Error("The test expected the page that holds the bar.");
  return probe.page;
}

/** A data screen with nothing but its header and the bar. */
function Screen() {
  const filters = useFilters();
  const { selectSnapshot } = useSnapshotActions();
  const { renameWorkspace, openWorkspace } = useWorkspaceActions();
  useEffect(() => {
    probe.page = {
      ...filters,
      select: (id) => {
        selectSnapshot.mutate(id);
      },
      rename: (name) => {
        renameWorkspace.mutate({ id: workspace().id, name });
      },
      open: (id) => {
        openWorkspace.mutate(id);
      },
    };
  });
  return <Page title="Holds" bar={<FilterBar />} />;
}

type Answer = NonNullable<Handlers["filter_options"]>;

/** Renders the app on the screen above. The answer to `filter_options` is a spy. */
function renderBar(answer: Answer = () => filterOptions(), handlers: Handlers = {}) {
  delete probe.page;
  const options = vi.fn(answer);
  const app = renderApp({
    start: openStart(),
    path: "/overview",
    pages: {
      overview: <Screen />,
      breakdown: <Screen />,
      blockers: <Screen />,
      lines: <Screen />,
      settings: <SettingsPage />,
    },
    handlers: { ...handlers, filter_options: options },
  });
  return { ...app, options };
}

/** The bar, once its counts are there. */
async function bar(): Promise<HTMLElement> {
  const region = await screen.findByRole("group", { name: text.bar });
  await waitFor(() => {
    expect(total(region)).not.toHaveAttribute("aria-busy");
  });
  return region;
}

function total(region: HTMLElement): HTMLElement {
  return must(region.querySelector<HTMLElement>("[data-part='filter-total']"), "the total");
}

function set(filters: Partial<Filters>): void {
  act(() => {
    now().set({ ...defaultFilters, ...filters });
  });
}

const value = (label: string, key = label) => ({ key, label });

/** The chips of the bar, each as the text it reads. */
function chips(region: HTMLElement): string[] {
  return [...region.querySelectorAll("[data-part='filter-chip']")].map((chip) =>
    must(chip.querySelector("button"), "the button of a chip").textContent.trim(),
  );
}

function chip(region: HTMLElement, name: string): HTMLElement {
  return within(region).getByRole("button", { name });
}

function removeButton(region: HTMLElement, field: string): HTMLElement {
  return within(region).getByRole("button", {
    name: en.filterChip.remove.replace("{{field}}", field),
  });
}

const statusName = (status: "Open" | "Released" | "All") =>
  text.status.name.replace("{{status}}", text.status[status]);

const holds = (count: string) => text.total_other.replace("{{count, number}}", count);

const THREE: Partial<Filters> = {
  fields: [
    { dim: "Discipline", values: [value("Civil")], negate: false },
    { dim: "HoldType", values: [value("Vendor data")], negate: false },
    { dim: "Role", values: [value("Lead")], negate: false },
  ],
};

describe("FilterBar", () => {
  it("shows the status, the way to add a filter, and the total, and nothing to clear, with the default filters", async () => {
    const { options } = renderBar();
    const region = await bar();
    expect(within(region).getByRole("button", { name: statusName("Open") })).toBeEnabled();
    expect(chips(region)).toEqual([]);
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeEnabled();
    expect(within(region).queryByRole("button", { name: text.clear })).not.toBeInTheDocument();
    expect(total(region)).toHaveTextContent(holds("5,042"));
    expect(options).toHaveBeenCalledWith({
      spec: openHoldsFilter(),
      view: { workspace_id: workspace().id, snapshot_id: 2 },
    });
  });

  it("puts the status first, then the chips, then Add filter, then Clear all", async () => {
    renderBar();
    const region = await bar();
    set(THREE);
    await waitFor(() => {
      expect(chips(region)).toHaveLength(3);
    });
    const order = within(region)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent.trim());
    const remove = (field: string) => en.filterChip.remove.replace("{{field}}", field);
    expect(order).toEqual([
      statusName("Open"),
      "Discipline Civil",
      remove("Discipline"),
      "Hold type Vendor data",
      remove("Hold type"),
      "Role Lead",
      remove("Role"),
      en.filterChip.add,
      text.clear,
    ]);
  });

  it("reads a chip for each kind of filter: one value, two, five, a negated field, and the filters that are not a field", async () => {
    renderBar();
    const region = await bar();
    const five = ["Ada", "Ben", "Cho", "Dee", "Eli"].map((name) => value(name));
    set({
      fields: [
        { dim: "Discipline", values: [value("Civil")], negate: false },
        { dim: "HoldType", values: [value("Vendor data"), value("Process data")], negate: false },
        { dim: "Name", values: five, negate: false },
        { dim: "Role", values: [value("Lead")], negate: true },
        { dim: { Custom: "Area" }, values: [value("North")], negate: false },
      ],
      ageBands: [{ min_days: 90, max_days: null }],
      created: { from: "2026-09-01", to: "2026-09-30" },
      released: { from: null, to: "2026-09-30" },
      sizeMismatch: true,
      text: "577-PR",
    });
    await waitFor(() => {
      expect(chips(region)).toEqual([
        "Discipline Civil",
        "Hold type Vendor data, Process data",
        "Raised by Ada +4",
        "Role is not Lead",
        "Area North",
        "Age 90 days or more",
        "Creation date 1 Sept 2026 to 30 Sept 2026",
        "Release date until 30 Sept 2026",
        "Model and LDT sizes differ",
        "Text “577-PR”",
      ]);
    });
    // The name of a chip is what it reads, in full.
    expect(chip(region, "Role is not Lead")).toBeEnabled();
    expect(chip(region, "Raised by Ada +4")).toBeEnabled();
  });

  it("asks for the options again with the spec of the filters that are set", async () => {
    const { options } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    await waitFor(() => {
      expect(options).toHaveBeenLastCalledWith({
        spec: {
          ...openHoldsFilter(),
          fields: [{ dim: "Discipline", values: ["Civil"], negate: false }],
        },
        view: { workspace_id: workspace().id, snapshot_id: 2 },
      });
    });
    expect(chips(region)).toEqual(["Discipline Civil"]);
  });

  it("removes a chip by its button, and moves the focus to the chip after it", async () => {
    const { user } = renderBar();
    const region = await bar();
    set(THREE);
    await waitFor(() => {
      expect(chips(region)).toHaveLength(3);
    });

    await user.click(removeButton(region, "Hold type"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil", "Role Lead"]);
    });
    expect(chip(region, "Role Lead")).toHaveFocus();
    expect(now().filters.fields.map((entry) => entry.dim)).toEqual(["Discipline", "Role"]);
  });

  it("moves the focus to Add filter when the last chip of the row is removed", async () => {
    const { user } = renderBar();
    const region = await bar();
    set(THREE);
    await waitFor(() => {
      expect(chips(region)).toHaveLength(3);
    });

    await user.click(removeButton(region, "Role"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil", "Hold type Vendor data"]);
    });
    const add = within(region).getByRole("button", { name: en.filterChip.add });
    expect(add).toHaveFocus();

    // And when the only chip goes, which takes "Clear all" with it.
    set({ text: "valve" });
    await waitFor(() => {
      expect(chips(region)).toEqual(["Text “valve”"]);
    });
    await user.click(removeButton(region, "Text"));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    expect(add).toHaveFocus();
    expect(now().isDefault).toBe(true);
  });

  it("removes a chip by Backspace and by Delete, from either of its two controls, with the focus going on", async () => {
    const { user } = renderBar();
    const region = await bar();
    set(THREE);
    await waitFor(() => {
      expect(chips(region)).toHaveLength(3);
    });

    act(() => {
      chip(region, "Discipline Civil").focus();
    });
    await user.keyboard("{Backspace}");
    await waitFor(() => {
      expect(chips(region)).toEqual(["Hold type Vendor data", "Role Lead"]);
    });
    expect(chip(region, "Hold type Vendor data")).toHaveFocus();

    await user.tab();
    expect(removeButton(region, "Hold type")).toHaveFocus();
    await user.keyboard("{Delete}");
    await waitFor(() => {
      expect(chips(region)).toEqual(["Role Lead"]);
    });
    expect(chip(region, "Role Lead")).toHaveFocus();

    await user.keyboard("{Delete}");
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toHaveFocus();
  });

  it("shows Clear all only while a filter is set, and it resets the status as well", async () => {
    const { user } = renderBar();
    const region = await bar();
    expect(within(region).queryByRole("button", { name: text.clear })).not.toBeInTheDocument();

    // Another status alone is nothing to clear: the status control sets it back.
    set({ status: "Released" });
    await within(region).findByRole("button", { name: statusName("Released") });
    expect(within(region).queryByRole("button", { name: text.clear })).not.toBeInTheDocument();

    set({ status: "Released", ...THREE, text: "valve" });
    await user.click(await within(region).findByRole("button", { name: text.clear }));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    expect(now().filters).toEqual(defaultFilters);
    expect(within(region).getByRole("button", { name: statusName("Open") })).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: text.clear })).not.toBeInTheDocument();
    // The button is gone, and the focus is not left behind on the page.
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toHaveFocus();
  });

  it("offers the three statuses with the counts the command gives, and none for all holds", async () => {
    const { user } = renderBar();
    const region = await bar();
    await user.click(within(region).getByRole("button", { name: statusName("Open") }));
    const menu = await screen.findByRole("menu", { name: text.status.menu });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(items[0]).toHaveAccessibleName(text.status.Open);
    expect(items[0]).toHaveAccessibleDescription("5,042");
    expect(items[1]).toHaveAccessibleName(text.status.Released);
    expect(items[1]).toHaveAccessibleDescription("4,258");
    expect(items[2]).toHaveAccessibleName(text.status.All);
    // The count of all holds would be a sum, and the interface adds nothing up.
    expect(items[2]).toHaveAccessibleDescription("");
  });

  it("changes the status, and reads the options for it", async () => {
    const { user, options } = renderBar((args) =>
      args.spec.status === "Released" ? filterOptions({ total: 4258 }) : filterOptions(),
    );
    const region = await bar();
    await user.click(within(region).getByRole("button", { name: statusName("Open") }));
    const menu = await screen.findByRole("menu", { name: text.status.menu });
    await user.click(within(menu).getByRole("menuitemradio", { name: text.status.Released }));

    await within(region).findByRole("button", { name: statusName("Released") });
    expect(now().filters.status).toBe("Released");
    await waitFor(() => {
      expect(total(region)).toHaveTextContent(holds("4,258"));
    });
    expect(options).toHaveBeenLastCalledWith({
      spec: { ...openHoldsFilter(), status: "Released" },
      view: { workspace_id: workspace().id, snapshot_id: 2 },
    });

    await user.click(within(region).getByRole("button", { name: statusName("Released") }));
    const again = await screen.findByRole("menu", { name: text.status.menu });
    await user.click(within(again).getByRole("menuitemradio", { name: text.status.All }));
    await within(region).findByRole("button", { name: statusName("All") });
    expect(now().filters.status).toBe("All");
  });

  it("keeps the total of before, dimmed, while it is read again", async () => {
    const later = held<FilterOptions>();
    let readings = 0;
    renderBar(() => {
      readings += 1;
      return readings === 1 ? filterOptions() : later.handler();
    });
    const region = await bar();
    expect(total(region)).not.toHaveAttribute("data-stale");

    set({ text: "valve" });
    await waitFor(() => {
      expect(total(region)).toHaveAttribute("data-stale");
    });
    expect(total(region)).toHaveAttribute("aria-busy", "true");
    expect(total(region)).toHaveTextContent(holds("5,042"));
    // The chip is there at once, in its final look.
    expect(chips(region)).toEqual(["Text “valve”"]);

    await act(async () => {
      must(later.waiting[0], "the second reading").resolve(filterOptions({ total: 17 }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(total(region)).toHaveTextContent(holds("17"));
    });
    expect(total(region)).not.toHaveAttribute("data-stale");
    expect(total(region)).not.toHaveAttribute("aria-busy");
  });

  it("writes one hold as one hold", async () => {
    renderBar(() => filterOptions({ total: 1 }));
    const region = await bar();
    expect(total(region)).toHaveTextContent(text.total_one.replace("{{count, number}}", "1"));
  });

  it("stands a skeleton in the place of the total until the first reading is there", async () => {
    const first = held<FilterOptions>();
    renderBar(() => first.handler());
    const region = await screen.findByRole("group", { name: text.bar });
    expect(total(region)).toHaveAttribute("aria-busy", "true");
    expect(total(region).querySelector("[data-part='skeleton']")).not.toBeNull();
    // The status is known without the counts, and so is the way to add a filter.
    expect(within(region).getByRole("button", { name: statusName("Open") })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeEnabled();

    await act(async () => {
      must(first.waiting[0], "the first reading").resolve(filterOptions());
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(total(region)).toHaveTextContent(holds("5,042"));
    });
    expect(total(region).querySelector("[data-part='skeleton']")).toBeNull();
  });

  it("disables everything while an action on the workspace runs, and says why in the place of the total", async () => {
    const select = held<WorkspaceOpen>();
    const { user } = renderBar(undefined, { snapshot_select: select.handler });
    const region = await bar();
    set(THREE);
    await waitFor(() => {
      expect(chips(region)).toHaveLength(3);
    });
    const end = must(region.querySelector<HTMLElement>("[data-part='filter-end']"), "the end");
    const reason = must(end.querySelector<HTMLElement>("[role='status']"), "the reason");
    expect(reason).toBeEmptyDOMElement();
    expect(end).toContainElement(total(region));
    // What the X of a chip is styled by: its circle, as wide as the chip is tall.
    const circle = removeButton(region, "Discipline").className;
    expect(circle).not.toBe("");

    act(() => {
      now().select(1);
    });
    await waitFor(() => {
      expect(reason).toHaveTextContent(text.busySnapshot);
    });
    // The sentence stands where the total stood, which says nothing certain meanwhile.
    expect(region.querySelector("[data-part='filter-total']")).toBeNull();
    expect(region.querySelectorAll("[role='status']")).toHaveLength(1);
    for (const disabled of region.querySelectorAll<HTMLElement>("[data-part='filter-chip']")) {
      expect(disabled).toHaveAttribute("data-disabled");
      expect(within(disabled).getAllByRole("button")).toHaveLength(1);
      expect(within(disabled).getByRole("button")).toBeDisabled();
      // The chip keeps the room of its remove circle, so nothing beside it moves.
      const kept = must(disabled.querySelector("[data-part='filter-chip-x']"), "the X of the chip");
      expect(kept.className).toBe(circle);
    }
    expect(chips(region)).toEqual(["Discipline Civil", "Hold type Vendor data", "Role Lead"]);
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeDisabled();
    expect(within(region).getByRole("button", { name: text.clear })).toBeDisabled();
    // The status control waits as a menu button does: it keeps its look and opens nothing.
    const status = within(region).getByRole("button", { name: statusName("Open") });
    expect(status).toHaveAttribute("aria-disabled", "true");
    expect(status).toHaveAttribute("aria-busy", "true");
    await user.click(status);
    expect(screen.queryByRole("menu", { name: text.status.menu })).not.toBeInTheDocument();

    await act(async () => {
      must(select.waiting[0], "the selection").resolve(opened({ selected: 1 }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(reason).toBeEmptyDOMElement();
    });
    await waitFor(() => {
      expect(total(region)).toHaveTextContent(holds("5,042"));
    });
    expect(end).toContainElement(total(region));
    expect(chip(region, "Discipline Civil")).toBeEnabled();
    expect(removeButton(region, "Discipline")).toBeInTheDocument();
    expect(region.querySelector("[data-part='filter-chip-x']")).toBeNull();
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeEnabled();
    expect(within(region).getByRole("button", { name: text.clear })).toBeEnabled();
    expect(within(region).getByRole("button", { name: statusName("Open") })).not.toHaveAttribute(
      "aria-disabled",
    );
    // The filters are those of before: another snapshot keeps them.
    expect(chips(region)).toEqual(["Discipline Civil", "Hold type Vendor data", "Role Lead"]);
  });

  it("says another reason while the workspace is changed and stays the one in view", async () => {
    const rename = held<ReturnType<typeof workspace>>();
    renderBar(undefined, { workspace_rename: rename.handler });
    const region = await bar();
    const reason = must(region.querySelector<HTMLElement>("[role='status']"), "the reason");

    act(() => {
      now().rename("Unit 573");
    });
    await waitFor(() => {
      expect(reason).toHaveTextContent(text.busyWorkspace);
    });
    expect(region.querySelector("[data-part='filter-total']")).toBeNull();
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeDisabled();

    await act(async () => {
      must(rename.waiting[0], "the rename").resolve(workspace({ name: "Unit 573" }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(reason).toBeEmptyDOMElement();
    });
  });

  it("waits for the workspace, not for a snapshot, while another workspace opens", async () => {
    const open = held<WorkspaceOpen>();
    renderBar(undefined, { workspace_open: open.handler });
    const region = await bar();
    const reason = must(region.querySelector<HTMLElement>("[role='status']"), "the reason");

    act(() => {
      now().open(otherWorkspace.id);
    });
    await waitFor(() => {
      expect(reason).toHaveTextContent(text.busyWorkspace);
    });
    expect(reason).not.toHaveTextContent(text.busySnapshot);

    await act(async () => {
      must(open.waiting[0], "the opening").resolve(opened({ workspace: otherWorkspace }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(reason).toBeEmptyDOMElement();
    });
  });

  it("keeps the reason short: two lines of the trailing part hold it", () => {
    // The trailing part is as wide as about eighteen characters of the caption, and a control is
    // as tall as two of its lines. A longer sentence would make the bar taller while it shows.
    for (const sentence of [text.busySnapshot, text.busyWorkspace]) {
      const words = sentence.split(" ");
      expect(sentence.length).toBeLessThanOrEqual(30);
      expect(Math.max(...words.map((word) => word.length))).toBeLessThanOrEqual(16);
    }
  });

  it("keeps Add filter and Clear all together, and starts the status on the line of the page", async () => {
    renderBar();
    const region = await bar();
    set(THREE);
    const clear = await within(region).findByRole("button", { name: text.clear });
    const add = within(region).getByRole("button", { name: en.filterChip.add });
    // The two wrap as one, so a line never starts with the label of the quiet button.
    const actions = must(add.closest("[data-part='filter-actions']"), "the two actions");
    expect(actions).toContainElement(clear);
    expect(within(actions as HTMLElement).getAllByRole("button")).toHaveLength(2);
    // The status button moves itself out by its own padding.
    expect(within(region).getByRole("button", { name: statusName("Open") })).toHaveAttribute(
      "data-flush",
    );
  });

  /** The line under the controls, and its two sentences, when it has them. */
  function notes(region: HTMLElement) {
    const line = region.querySelector<HTMLElement>("[data-part='filter-notes']");
    return {
      line,
      noReleased: line?.querySelector("[data-part='filter-no-released']")?.textContent ?? null,
      absent: line?.querySelector("[data-part='filter-absent']")?.textContent ?? null,
    };
  }

  it("says once which columns the snapshot lacks, by the names PlantIM gives them", async () => {
    renderBar(() => filterOptions({ absent: ["ModelSize", "LdtSize", "StressCalc"] }));
    const region = await bar();
    expect(notes(region).absent).toBe(
      text.absent_other.replace("{{columns}}", "model_size, ldt_size, stress_calc"),
    );
    // Only size fields are absent: nothing is said about released holds.
    expect(notes(region).noReleased).toBeNull();
    expect(region.querySelectorAll("[data-part='filter-notes']")).toHaveLength(1);
    expect(region.querySelectorAll("[data-part='filter-absent']")).toHaveLength(1);
  });

  it("names one missing column as one, and says nothing when the snapshot lacks none", async () => {
    const { unmount } = renderBar(() => filterOptions({ absent: ["StressCalc"] }));
    const region = await bar();
    expect(notes(region).absent).toBe(text.absent_one.replace("{{columns}}", "stress_calc"));
    unmount();

    renderBar();
    const full = await bar();
    expect(notes(full).line).toBeNull();
  });

  it("says that no hold is released, and names no release column as missing, when only the release fields are absent", async () => {
    // A complete export in which no hold is released yet answers the same as a file without the
    // released column: the sentence is true of both, and "has no values in released" is not.
    renderBar(() => filterOptions({ absent: ["Released", "ReleaseRemark", "ReleaseDate"] }));
    const region = await bar();
    expect(notes(region).noReleased).toBe(text.noReleased);
    expect(notes(region).absent).toBeNull();
    expect(region).not.toHaveTextContent("release_date");
    expect(region).not.toHaveTextContent("release_remark");
  });

  it("says both, and leaves the release columns out of the missing ones, when sizes and release fields are absent", async () => {
    renderBar(() =>
      filterOptions({
        absent: ["SourceId", "Released", "ReleaseRemark", "ReleaseDate", "ModelSize", "LdtSize"],
      }),
    );
    const region = await bar();
    expect(notes(region).noReleased).toBe(text.noReleased);
    expect(notes(region).absent).toBe(
      text.absent_other.replace("{{columns}}", "id, model_size, ldt_size"),
    );
    // The sentence about the holds comes first.
    expect(must(notes(region).line, "the line").textContent).toMatch(
      new RegExp(`^${text.noReleased.replace(/[.]/g, "\\.")}`),
    );
  });

  it("names a release column that is missing while holds are released", async () => {
    renderBar(() => filterOptions({ absent: ["ReleaseRemark", "ReleaseDate"] }));
    const region = await bar();
    expect(notes(region).noReleased).toBeNull();
    expect(notes(region).absent).toBe(
      text.absent_other.replace("{{columns}}", "release_remark, release_date"),
    );
  });

  it("dims the line with the total while the answer is that of before", async () => {
    const later = held<FilterOptions>();
    let readings = 0;
    renderBar(() => {
      readings += 1;
      return readings === 1 ? filterOptions({ absent: ["StressCalc"] }) : later.handler();
    });
    const region = await bar();
    expect(notes(region).line).not.toHaveAttribute("data-stale");

    set({ text: "valve" });
    await waitFor(() => {
      expect(total(region)).toHaveAttribute("data-stale");
    });
    expect(notes(region).line).toHaveAttribute("data-stale");
    expect(notes(region).absent).toBe(text.absent_one.replace("{{columns}}", "stress_calc"));

    await act(async () => {
      must(later.waiting[0], "the second reading").resolve(filterOptions());
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(notes(region).line).toBeNull();
    });
  });

  it("offers only the open holds when no hold of the snapshot is released", async () => {
    const { user } = renderBar(() =>
      filterOptions({
        absent: ["Released", "ReleaseDate"],
        facets: { ...filterOptions().facets, released: 0 },
      }),
    );
    const region = await bar();
    expect(notes(region).noReleased).toBe(text.noReleased);
    await user.click(within(region).getByRole("button", { name: statusName("Open") }));
    const menu = await screen.findByRole("menu", { name: text.status.menu });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAccessibleName(text.status.Open);
    expect(items[0]).toHaveAccessibleDescription("5,042");
  });

  it("still lists the status in view when the snapshot lacks its column, so that it can be left", async () => {
    const { user } = renderBar(() => filterOptions({ absent: ["Released"] }));
    const region = await bar();
    set({ status: "All" });
    await user.click(await within(region).findByRole("button", { name: statusName("All") }));
    const menu = await screen.findByRole("menu", { name: text.status.menu });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAccessibleName(text.status.Open);
    expect(items[1]).toHaveAccessibleName(text.status.All);
    expect(items[1]).toHaveAttribute("aria-checked", "true");

    await user.click(must(items[0], "the open holds"));
    await within(region).findByRole("button", { name: statusName("Open") });
    expect(now().filters.status).toBe("Open");
  });

  it("offers only the open holds, and the status in view, until the counts are there", async () => {
    const first = held<FilterOptions>();
    const { user } = renderBar(() => first.handler());
    const region = await screen.findByRole("group", { name: text.bar });
    // Whether the snapshot has released holds is not known yet.
    await user.click(within(region).getByRole("button", { name: statusName("Open") }));
    const menu = await screen.findByRole("menu", { name: text.status.menu });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAccessibleName(text.status.Open);
    expect(items[0]).toHaveAccessibleDescription("");
    await user.keyboard("{Escape}");

    await act(async () => {
      must(first.waiting[0], "the first reading").resolve(filterOptions());
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(total(region)).toHaveTextContent(holds("5,042"));
    });
    await user.click(within(region).getByRole("button", { name: statusName("Open") }));
    const full = await screen.findByRole("menu", { name: text.status.menu });
    expect(within(full).getAllByRole("menuitemradio")).toHaveLength(3);
  });

  it("offers only the open holds, and the status in view, while the counts cannot be read", async () => {
    const { user } = renderBar(() => {
      throw commandFailure("Io", "The workspace file could not be read. Try again.");
    });
    const region = await screen.findByRole("group", { name: text.bar });
    await within(region).findByRole("alert");
    set({ status: "Released" });
    await user.click(await within(region).findByRole("button", { name: statusName("Released") }));
    const menu = await screen.findByRole("menu", { name: text.status.menu });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAccessibleName(text.status.Open);
    expect(items[1]).toHaveAccessibleName(text.status.Released);
  });

  it("says that the counts could not be read, keeps the chips, and reads again on a retry", async () => {
    let fail = true;
    const { user, options } = renderBar(() => {
      if (fail) {
        throw commandFailure(
          "Io",
          "The workspace file could not be read (it is locked by another program). Close the other program, then try again.",
        );
      }
      return filterOptions();
    });
    const region = await screen.findByRole("group", { name: text.bar });
    const alert = await within(region).findByRole("alert");
    expect(alert).toHaveTextContent(text.error);
    expect(alert).toHaveTextContent("it is locked by another program");
    expect(region.querySelector("[data-part='filter-total']")).toBeNull();
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeEnabled();

    fail = false;
    const before = options.mock.calls.length;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await waitFor(() => {
      expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(options.mock.calls.length).toBeGreaterThan(before);
    expect(total(region)).toHaveTextContent(holds("5,042"));
  });

  it("opens the picker for the field of a chip, and gives the focus back when it closes", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    const discipline = await within(region).findByRole("button", { name: "Discipline Civil" });
    expect(discipline).toHaveAttribute("aria-expanded", "false");

    await user.click(discipline);
    const picker = await screen.findByRole("dialog", {
      name: text.picker.filterBy.replace("{{field}}", "Discipline"),
    });
    expect(picker).toHaveTextContent("Discipline");
    expect(discipline).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(discipline).toHaveFocus();
    });
    // Opening the picker removed nothing.
    expect(chips(region)).toEqual(["Discipline Civil"]);
  });

  it("stands the picker under the place its chip had when it opened, and keeps it there when the chip widens", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    const discipline = await within(region).findByRole("button", { name: "Discipline Civil" });
    const pill = must(discipline.closest<HTMLElement>("[data-part='filter-chip']"), "the chip");
    const rect = (left: number, top: number, width: number, height: number) =>
      new DOMRect(left, top, width, height);
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue(rect(200, 100, 1000, 80));
    const placed = vi.spyOn(pill, "getBoundingClientRect").mockReturnValue(rect(340, 112, 120, 24));

    await user.click(discipline);
    await screen.findByRole("dialog", {
      name: text.picker.filterBy.replace("{{field}}", "Discipline"),
    });
    const anchor = must(
      region.querySelector<HTMLElement>("[data-part='filter-picker-anchor']"),
      "the anchor",
    );
    const at = { left: "140px", top: "12px", width: "120px", height: "24px" };
    expect(anchor.style).toMatchObject(at);

    // A second value widens the chip, and moves what comes after it; the anchor stays.
    placed.mockReturnValue(rect(340, 112, 190, 24));
    await user.click(await screen.findByRole("option", { name: "Piping" }));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil, Piping"]);
    });
    expect(anchor.style).toMatchObject(at);
  });

  it("closes the picker when an action on the workspace starts, and gives the focus to the bar", async () => {
    const select = held<WorkspaceOpen>();
    const { user } = renderBar(undefined, { snapshot_select: select.handler });
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    await user.click(await within(region).findByRole("button", { name: "Discipline Civil" }));
    await screen.findByRole("dialog");

    act(() => {
      now().select(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Every control of the bar is disabled now: the bar itself holds the focus, and says why.
    await waitFor(() => {
      expect(region).toHaveFocus();
    });
    expect(chip(region, "Discipline Civil")).toBeDisabled();
    expect(within(region).getByRole("status")).toHaveTextContent(text.busySnapshot);
  });

  it("takes no focus from a click while no action runs", async () => {
    const { user } = renderBar();
    const region = await bar();
    expect(region).not.toHaveAttribute("tabindex");
    await user.click(total(region));
    expect(region).not.toHaveFocus();
  });

  it("keeps the focus it took for an action once the action has ended, until it goes", async () => {
    const select = held<WorkspaceOpen>();
    const { user } = renderBar(undefined, { snapshot_select: select.handler });
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    act(() => {
      now().select(1);
    });
    await waitFor(() => {
      expect(region).toHaveAttribute("tabindex", "-1");
    });
    act(() => {
      region.focus();
    });
    expect(region).toHaveFocus();
    await act(async () => {
      must(select.waiting[0], "the selection").resolve(opened({ selected: 1 }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(chip(region, "Discipline Civil")).toBeEnabled();
    });
    // Still able to hold the focus while it has it, so the focus is not dropped on the page.
    expect(region).toHaveAttribute("tabindex", "-1");
    expect(region).toHaveFocus();
    await user.tab();
    expect(region).not.toHaveAttribute("tabindex");
  });

  it("does not open the picker from the remove button of a chip", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ ...THREE });
    await waitFor(() => {
      expect(chips(region)).toHaveLength(3);
    });
    await user.click(removeButton(region, "Discipline"));
    await waitFor(() => {
      expect(chips(region)).toHaveLength(2);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the picker from Add filter", async () => {
    const { user } = renderBar();
    const region = await bar();
    const add = within(region).getByRole("button", { name: en.filterChip.add });
    await user.click(add);
    expect(await screen.findByRole("dialog", { name: text.picker.add })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(add).toHaveFocus();
    });
  });

  it("reaches every control by Tab, in the order of the bar", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    await within(region).findByRole("button", { name: "Discipline Civil" });

    act(() => {
      within(region)
        .getByRole("button", { name: statusName("Open") })
        .focus();
    });
    await user.tab();
    expect(chip(region, "Discipline Civil")).toHaveFocus();
    await user.tab();
    expect(removeButton(region, "Discipline")).toHaveFocus();
    await user.tab();
    expect(within(region).getByRole("button", { name: en.filterChip.add })).toHaveFocus();
    await user.tab();
    expect(within(region).getByRole("button", { name: text.clear })).toHaveFocus();
  });

  it(
    "is accessible: at rest, with chips, with its picker open, and while it is disabled",
    SLOW,
    async () => {
      const select = held<WorkspaceOpen>();
      const { user } = renderBar(() => filterOptions({ absent: ["StressCalc"] }), {
        snapshot_select: select.handler,
      });
      const region = await bar();
      await expectAccessible(document.body, { page: true });

      set({ ...THREE, text: "valve" });
      await waitFor(() => {
        expect(chips(region)).toHaveLength(4);
      });
      await expectAccessible(document.body, { page: true });

      await user.click(chip(region, "Discipline Civil"));
      await screen.findByRole("dialog");
      await expectAccessible();
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      act(() => {
        now().select(1);
      });
      await waitFor(() => {
        expect(within(region).getByRole("button", { name: en.filterChip.add })).toBeDisabled();
      });
      await expectAccessible(document.body, { page: true });
    },
  );
});

describe("where the filter bar is", () => {
  it("is on Overview and Lines, and not on Settings, the welcome page, a coming soon screen, or the import page", async () => {
    const { router } = renderApp({ start: openStart(), path: "/overview" });
    expect(await screen.findByRole("group", { name: text.bar })).toBeInTheDocument();
    await act(() => router.navigate("/lines"));
    await screen.findByRole("heading", { level: 1, name: en.destinations.name.lines });
    expect(await screen.findByRole("group", { name: text.bar })).toBeInTheDocument();

    for (const path of ["/settings", "/welcome", "/history", "/import"]) {
      await act(() => router.navigate(path));
      await screen.findByRole("heading", { level: 1 });
      expect(router.state.location.pathname).toBe(path);
      expect(screen.queryByRole("group", { name: text.bar })).not.toBeInTheDocument();
    }

    await act(() => router.navigate("/overview"));
    expect(await screen.findByRole("group", { name: text.bar })).toBeInTheDocument();
  });

  it("is not on Overview while the workspace has no snapshot: there is nothing to filter", async () => {
    const options = vi.fn(() => filterOptions());
    renderApp({
      start: openStart({ open: opened({ snapshots: [], selected: null }) }),
      path: "/overview",
      handlers: { filter_options: options },
    });
    await screen.findByText(en.overview.emptyTitle);
    expect(screen.queryByRole("group", { name: text.bar })).not.toBeInTheDocument();
    expect(options).not.toHaveBeenCalled();
  });
});
