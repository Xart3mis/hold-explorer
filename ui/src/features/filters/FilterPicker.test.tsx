import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { openHoldsFilter } from "../../api/filter";
import { defaultFilters, useFilters, type Filters } from "../../app/filters/state";
import { Page } from "../../app/shell/Page";
import type { FilterOptions } from "../../bindings/FilterOptions";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { ValuePage } from "../../bindings/ValuePage";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { expectNoAxeViolations } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { filterOptions, group, valuePage } from "../../test/filters";
import { openStart, workspace } from "../../test/fixtures";
import { commandFailure, type Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { formatDate } from "../../text/format";
import { SettingsPage } from "../settings/SettingsPage";
import { FilterBar } from "./FilterBar";

const text = en.filters;
const picker = text.picker;
const view = { workspace_id: workspace().id, snapshot_id: 2 };

type Held = ReturnType<typeof useFilters>;

/** The filters as the page of the test holds them. */
const probe: { page?: Held } = {};

function now(): Held {
  if (probe.page === undefined) throw new Error("The test expected the page that holds the bar.");
  return probe.page;
}

/** A data screen with nothing but its header and the bar. */
function Screen() {
  const filters = useFilters();
  useEffect(() => {
    probe.page = filters;
  });
  return <Page title="Holds" bar={<FilterBar />} />;
}

type Values = NonNullable<Handlers["filter_values"]>;

/** Renders the app on the screen above. The answer to `filter_values` is a spy. */
function renderBar(answer: Values = () => valuePage(), handlers: Handlers = {}) {
  delete probe.page;
  const values = vi.fn(answer);
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
    handlers: { ...handlers, filter_values: values },
  });
  return { ...app, values };
}

/** The bar, once its counts are there. */
async function bar(): Promise<HTMLElement> {
  const region = await screen.findByRole("group", { name: text.bar });
  await waitFor(() => {
    expect(
      must(region.querySelector("[data-part='filter-total']"), "the total"),
    ).not.toHaveAttribute("aria-busy");
  });
  return region;
}

function set(filters: Partial<Filters>): void {
  act(() => {
    now().set({ ...defaultFilters, ...filters });
  });
}

const value = (label: string, key = label) => ({ key, label });

/** The spec the page holds, without the parts a test says nothing about. */
function spec(part: Partial<FilterSpec>): FilterSpec {
  return { ...openHoldsFilter(), ...part };
}

/** The chips of the bar, each as the text it reads. */
function chips(region: HTMLElement): string[] {
  return [...region.querySelectorAll("[data-part='filter-chip']")].map((chip) =>
    must(chip.querySelector("button"), "the button of a chip").textContent.trim(),
  );
}

function addFilter(region: HTMLElement): HTMLElement {
  return within(region).getByRole("button", { name: en.filterChip.add });
}

const filterBy = (field: string) => picker.filterBy.replace("{{field}}", field);
const valuesOf = (field: string) => picker.values.replace("{{field}}", field);

/** Opens "Add filter" and answers the list of fields. */
async function openFields(user: UserEvent, region: HTMLElement): Promise<HTMLElement> {
  await user.click(addFilter(region));
  return screen.findByRole("menu", { name: picker.fields });
}

/** Opens "Add filter", chooses a field, and answers the popover of its editor. */
async function openEditor(user: UserEvent, region: HTMLElement, field: string) {
  const fields = await openFields(user, region);
  await user.click(within(fields).getByRole("menuitem", { name: field }));
  return screen.findByRole("dialog", { name: filterBy(field) });
}

function option(name: string): HTMLElement {
  return screen.getByRole("option", { name });
}

/** The labels of the options of the list, in order. */
function options(list: HTMLElement): string[] {
  return within(list)
    .queryAllByRole("option")
    .map((entry) => must(entry.querySelector("[slot='label']"), "the label").textContent);
}

/** The count an option shows; `null` when it shows none. */
function count(name: string): string | null {
  return option(name).querySelector("[data-part='count']")?.textContent ?? null;
}

async function closed(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

describe("the list of fields", () => {
  it("lists the fields of the snapshot in the order of the picker, and takes the focus", async () => {
    const { user } = renderBar();
    const region = await bar();
    const fields = await openFields(user, region);
    expect(screen.getByRole("dialog", { name: picker.add })).toContainElement(fields);
    expect(
      within(fields)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Discipline",
      "Hold type",
      "Role",
      "Raised by",
      "Blocker type",
      "Blocker",
      "Hold remark",
      "Line ID",
      "Age",
      "Creation date",
      "Release date",
      "Model size",
      "Stress calculation",
      "Model and LDT sizes",
      "Text",
    ]);
    await waitFor(() => {
      expect(within(fields).getByRole("menuitem", { name: "Discipline" })).toHaveFocus();
    });
  });

  it("lists no field whose column the snapshot lacks, and the custom columns last", async () => {
    const { user } = renderBar(undefined, {
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
          custom_dims: ["Area", "Contractor"],
        }),
    });
    const region = await bar();
    const fields = await openFields(user, region);
    const names = within(fields)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(names).not.toContain("Model size");
    expect(names).not.toContain("Stress calculation");
    expect(names).not.toContain("Model and LDT sizes");
    expect(names).not.toContain("Release date");
    expect(names.slice(-3)).toEqual(["Text", "Area", "Contractor"]);
  });

  it("says a Remark or a Blocker known by its key alone under the label the snapshot gives it", async () => {
    const remark = "HOLD PENDING 573-PR-1450";
    const blocker = "Process|573-PR-1450";
    const { user } = renderBar(() => valuePage(), {
      filter_labels: () => [
        { dim: "Remark", key: remark, label: "Hold pending 573-PR-1450" },
        { dim: "Blocker", key: blocker, label: "Process / 573-PR-1450" },
      ],
    });
    const region = await bar();
    // As a saved view applied with nothing kept this session sets them: labelled by their keys.
    set({
      fields: [
        { dim: "Remark", values: [value(remark)], negate: false },
        { dim: "Blocker", values: [value(blocker)], negate: false },
      ],
    });
    await within(region).findByRole("button", { name: /Hold pending 573-PR-1450/ });
    const fields = await openFields(user, region);
    expect(
      within(fields).getByRole("menuitem", { name: "Hold remark" }),
    ).toHaveAccessibleDescription("Hold pending 573-PR-1450");
    expect(within(fields).getByRole("menuitem", { name: "Blocker" })).toHaveAccessibleDescription(
      "Process / 573-PR-1450",
    );
  });

  it("says what a field is filtered to, and opens its editor with those values ticked", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({
      fields: [
        { dim: "Discipline", values: [value("Civil"), value("Piping")], negate: false },
        { dim: "HoldType", values: [value("Vendor data")], negate: true },
      ],
    });
    const fields = await openFields(user, region);
    const discipline = within(fields).getByRole("menuitem", { name: "Discipline" });
    expect(discipline).toHaveAccessibleDescription("Civil, Piping");
    expect(within(fields).getByRole("menuitem", { name: "Hold type" })).toHaveAccessibleDescription(
      picker.isNot.replace("{{value}}", "Vendor data"),
    );
    expect(within(fields).getByRole("menuitem", { name: "Role" })).toHaveAccessibleDescription("");

    await user.click(discipline);
    await screen.findByRole("dialog", { name: filterBy("Discipline") });
    await waitFor(() => {
      expect(option("Civil")).toHaveAttribute("aria-selected", "true");
    });
    expect(option("Piping")).toHaveAttribute("aria-selected", "true");
    expect(option("Process")).toHaveAttribute("aria-selected", "false");
    // The chips are as they were: opening an editor changes nothing.
    expect(chips(region)).toEqual(["Discipline Civil, Piping", "Hold type is not Vendor data"]);
  });

  it("says that the options could not be read, in the place of the list, with a retry", async () => {
    let fails = true;
    const { user } = renderBar(undefined, {
      filter_options: () => {
        if (fails) throw commandFailure("Io", "The workspace file could not be read.");
        return filterOptions();
      },
    });
    const region = await screen.findByRole("group", { name: text.bar });
    await within(region).findByRole("alert");
    await user.click(addFilter(region));
    const dialog = await screen.findByRole("dialog", { name: picker.add });
    expect(within(dialog).queryByRole("menu")).not.toBeInTheDocument();
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("The workspace file could not be read.");

    fails = false;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    expect(await within(dialog).findByRole("menu", { name: picker.fields })).toBeInTheDocument();
  });
});

describe("the editor of a field of values", () => {
  it("asks for the values with the spec, the dimension, and the text typed in its search field", async () => {
    const { user, values } = renderBar();
    const region = await bar();
    set({ text: "valve" });
    const dialog = await openEditor(user, region, "Discipline");
    const search = within(dialog).getByRole("textbox", { name: "Discipline" });
    await waitFor(() => {
      expect(search).toHaveFocus();
    });
    await waitFor(() => {
      expect(options(screen.getByRole("listbox", { name: valuesOf("Discipline") }))).toEqual([
        "Piping",
        "Process",
        "Civil",
      ]);
    });
    expect(values).toHaveBeenLastCalledWith({
      spec: spec({ text: "valve" }),
      dim: "Discipline",
      search: "",
      view,
    });
    expect(count("Piping")).toBe("1,186");
    expect(option("Piping")).toHaveAccessibleDescription("1,186");

    await user.type(search, "civ");
    await waitFor(() => {
      expect(values).toHaveBeenLastCalledWith({
        spec: spec({ text: "valve" }),
        dim: "Discipline",
        search: "civ",
        view,
      });
    });
  });

  it("asks for a custom column by its header", async () => {
    const { user, values } = renderBar(undefined, {
      filter_options: () => filterOptions({ custom_dims: ["Area"] }),
    });
    const region = await bar();
    await openEditor(user, region, "Area");
    await waitFor(() => {
      expect(values).toHaveBeenLastCalledWith({
        spec: openHoldsFilter(),
        dim: { Custom: "Area" },
        search: "",
        view,
      });
    });
  });

  it("adds a chip when a value is ticked, stays open, and asks again with the new spec", async () => {
    const { user, values } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Discipline");
    await user.click(await screen.findByRole("option", { name: "Civil" }));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil"]);
    });
    const one = spec({ fields: [{ dim: "Discipline", values: ["Civil"], negate: false }] });
    expect(now().spec).toEqual(one);
    await waitFor(() => {
      expect(values).toHaveBeenLastCalledWith({ spec: one, dim: "Discipline", search: "", view });
    });
    expect(dialog).toBeInTheDocument();
    expect(option("Civil")).toHaveAttribute("aria-selected", "true");

    await user.click(option("Piping"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil, Piping"]);
    });
    // The values are sent by their keys, in the order they were ticked.
    expect(now().spec.fields).toEqual([
      { dim: "Discipline", values: ["Civil", "Piping"], negate: false },
    ]);
  });

  it("sends a value by its key and shows it by its label, the blank one included", async () => {
    const { user } = renderBar(() =>
      valuePage({ values: [group("Piping", 1186), group("Unspecified", 30, "")] }),
    );
    const region = await bar();
    await openEditor(user, region, "Discipline");
    await user.click(await screen.findByRole("option", { name: "Unspecified" }));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Unspecified"]);
    });
    expect(now().filters.fields).toEqual([
      { dim: "Discipline", values: [{ key: "", label: "Unspecified" }], negate: false },
    ]);
    expect(option("Unspecified")).toHaveAttribute("aria-selected", "true");
  });

  it("removes the chip when the last value is unticked, stays usable, and gives the focus to Add filter when it closes", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    const chip = await within(region).findByRole("button", { name: "Discipline Civil" });
    // While the picker is open the page behind it is hidden from assistive technology.
    const add = addFilter(region);
    await user.click(chip);
    const dialog = await screen.findByRole("dialog", { name: filterBy("Discipline") });
    await user.click(await screen.findByRole("option", { name: "Civil" }));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    expect(now().spec).toEqual(openHoldsFilter());
    // The picker is still there, and what opened it now is "Add filter".
    expect(dialog).toBeInTheDocument();
    expect(option("Civil")).toHaveAttribute("aria-selected", "false");
    expect(add).toHaveAttribute("aria-expanded", "true");

    await user.click(option("Process"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Process"]);
    });
    await user.click(option("Process"));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });

    await user.keyboard("{Escape}");
    await closed();
    await waitFor(() => {
      expect(add).toHaveFocus();
    });
    expect(add).toHaveAttribute("aria-expanded", "false");
  });

  it("gives the focus back to the chip of its field when that chip went and came back while it was open", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }] });
    await user.click(await within(region).findByRole("button", { name: "Discipline Civil" }));
    await screen.findByRole("dialog", { name: filterBy("Discipline") });
    await user.click(await screen.findByRole("option", { name: "Civil" }));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    await user.click(option("Process"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Process"]);
    });
    // A new chip, drawn while the page behind the picker is hidden from assistive technology.
    const chip = within(region).getByRole("button", { name: "Discipline Process", hidden: true });
    expect(chip).toHaveAttribute("aria-expanded", "true");
    // The keyboard is on the ticked option: Escape closes the picker and unticks nothing.
    expect(option("Process")).toHaveFocus();

    await user.keyboard("{Escape}");
    await closed();
    await waitFor(() => {
      expect(chip).toHaveFocus();
    });
    expect(chips(region)).toEqual(["Discipline Process"]);
  });

  it("shows a ticked value the answer no longer lists first, with the count 0, so it can be unticked", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({
      fields: [{ dim: "Discipline", values: [value("Marine"), value("Civil")], negate: false }],
    });
    await user.click(
      await within(region).findByRole("button", { name: "Discipline Marine, Civil" }),
    );
    const list = await screen.findByRole("listbox", { name: valuesOf("Discipline") });
    await waitFor(() => {
      expect(options(list)).toEqual(["Marine", "Piping", "Process", "Civil"]);
    });
    expect(count("Marine")).toBe("0");
    expect(option("Marine")).toHaveAttribute("data-zero");
    expect(option("Marine")).toHaveAttribute("aria-selected", "true");

    await user.click(option("Marine"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil"]);
    });
    // Unticked, it is a value like any other the answer does not list: it is gone.
    await waitFor(() => {
      expect(options(list)).toEqual(["Piping", "Process", "Civil"]);
    });
  });

  it("shows a ticked value without a count when the answer holds only the first of many values", async () => {
    const { user } = renderBar(() => valuePage({ total: 1500 }));
    const region = await bar();
    set({ fields: [{ dim: "LineId", values: [value("577-PR-1400")], negate: false }] });
    await user.click(await within(region).findByRole("button", { name: "Line ID 577-PR-1400" }));
    const list = await screen.findByRole("listbox", { name: valuesOf("Line ID") });
    await waitFor(() => {
      expect(options(list)).toEqual(["577-PR-1400", "Piping", "Process", "Civil"]);
    });
    // Its count is not known, and no number is invented for it.
    expect(count("577-PR-1400")).toBeNull();
    expect(option("577-PR-1400")).not.toHaveAttribute("data-zero");
  });

  it("holds what matches the text while text is typed, and the ticked values again when it is cleared", async () => {
    const { user } = renderBar(({ search }) =>
      search === "" ? valuePage() : valuePage({ total: 1, values: [group("Civil", 702)] }),
    );
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Marine")], negate: false }] });
    await user.click(await within(region).findByRole("button", { name: "Discipline Marine" }));
    const list = await screen.findByRole("listbox", { name: valuesOf("Discipline") });
    await waitFor(() => {
      expect(options(list)).toEqual(["Marine", "Piping", "Process", "Civil"]);
    });
    const search = screen.getByRole("textbox", { name: "Discipline" });
    await user.type(search, "civ");
    await waitFor(() => {
      expect(options(list)).toEqual(["Civil"]);
    });
    // A value ticked while the list is narrowed joins the ones ticked before.
    await user.click(option("Civil"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Marine, Civil"]);
    });
    await user.clear(search);
    await waitFor(() => {
      expect(options(list)).toEqual(["Marine", "Piping", "Process", "Civil"]);
    });
  });

  it("says how many more values exist, and to type to narrow, when the answer does not hold them all", async () => {
    const { user } = renderBar(() => valuePage({ total: 1500 }));
    const region = await bar();
    const dialog = await openEditor(user, region, "Line ID");
    await screen.findByRole("option", { name: "Civil" });
    expect(dialog).toHaveTextContent(picker.moreValues_other.replace("{{count, number}}", "1,497"));
  });

  it("shows the number of more values the command answers, without working it out", async () => {
    // An answer whose numbers do not add up shows that the footer takes `more` as it is.
    const { user } = renderBar(() => valuePage({ total: 1500, more: 12 }));
    const region = await bar();
    const dialog = await openEditor(user, region, "Line ID");
    await screen.findByRole("option", { name: "Civil" });
    expect(dialog).toHaveTextContent(picker.moreValues_other.replace("{{count, number}}", "12"));
  });

  it("writes one more value as one, and has no such line when every value is listed", async () => {
    const { user } = renderBar(({ dim }) =>
      dim === "LineId" ? valuePage({ total: 4 }) : valuePage(),
    );
    const region = await bar();
    const lines = await openEditor(user, region, "Line ID");
    await screen.findByRole("option", { name: "Civil" });
    expect(lines).toHaveTextContent(picker.moreValues_one.replace("{{count, number}}", "1"));
    await user.keyboard("{Escape}");
    await closed();

    const disciplines = await openEditor(user, region, "Discipline");
    await screen.findByRole("option", { name: "Civil" });
    expect(disciplines).not.toHaveTextContent("Type to narrow");
  });

  it("sets the whole field to is not, before or after a value is ticked", async () => {
    const { user } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Discipline");
    const is = within(dialog).getByRole("radio", { name: picker.condition.is });
    const isNot = within(dialog).getByRole("radio", { name: picker.condition.isNot });
    expect(is).toBeChecked();

    // Chosen first, it filters nothing yet.
    await user.click(isNot);
    expect(isNot).toBeChecked();
    expect(now().spec).toEqual(openHoldsFilter());
    await user.click(await screen.findByRole("option", { name: "Civil" }));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline is not Civil"]);
    });
    expect(now().spec.fields).toEqual([{ dim: "Discipline", values: ["Civil"], negate: true }]);

    await user.click(is);
    await waitFor(() => {
      expect(chips(region)).toEqual(["Discipline Civil"]);
    });
    expect(now().spec.fields).toEqual([{ dim: "Discipline", values: ["Civil"], negate: false }]);
  });

  it("opens with the condition of the filter that is set", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "Discipline", values: [value("Civil")], negate: true }] });
    await user.click(
      await within(region).findByRole("button", { name: "Discipline is not Civil" }),
    );
    const dialog = await screen.findByRole("dialog", { name: filterBy("Discipline") });
    expect(within(dialog).getByRole("radio", { name: picker.condition.isNot })).toBeChecked();
  });

  it("shows that the list is loading on a first read, and dims its counts while it is read again", async () => {
    const answers = held<ValuePage>();
    const { user } = renderBar(() => answers.handler());
    const region = await bar();
    const dialog = await openEditor(user, region, "Discipline");
    const list = within(dialog).getByRole("listbox", { name: valuesOf("Discipline") });
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list).not.toHaveAttribute("data-stale");
    expect(list).toHaveTextContent(en.common.loading);
    // The field and the choice are there meanwhile.
    expect(within(dialog).getByRole("textbox", { name: "Discipline" })).toBeEnabled();
    expect(within(dialog).getByRole("radio", { name: picker.condition.isNot })).toBeEnabled();

    await act(async () => {
      must(answers.waiting[0], "the first reading").resolve(valuePage());
      await Promise.resolve();
    });
    await screen.findByRole("option", { name: "Civil" });
    expect(list).not.toHaveAttribute("aria-busy");

    await user.click(option("Civil"));
    await waitFor(() => {
      expect(list).toHaveAttribute("data-stale");
    });
    expect(list).toHaveAttribute("aria-busy", "true");
    // The options of before stay where they were, the ticked one ticked.
    expect(options(list)).toEqual(["Piping", "Process", "Civil"]);
    expect(option("Civil")).toHaveAttribute("aria-selected", "true");
    expect(count("Civil")).toBe("702");

    await act(async () => {
      must(answers.waiting[1], "the second reading").resolve(
        valuePage({ values: [group("Piping", 1186), group("Process", 913), group("Civil", 688)] }),
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(count("Civil")).toBe("688");
    });
    expect(list).not.toHaveAttribute("data-stale");
    expect(list).not.toHaveAttribute("aria-busy");
  });

  it("says what is absent: no value for the text, or no value at all", async () => {
    const { user } = renderBar(() => valuePage({ total: 0, values: [] }));
    const region = await bar();
    const dialog = await openEditor(user, region, "Discipline");
    const list = within(dialog).getByRole("listbox", { name: valuesOf("Discipline") });
    await waitFor(() => {
      expect(list).toHaveTextContent(picker.noValues);
    });
    await user.type(within(dialog).getByRole("textbox", { name: "Discipline" }), "flange");
    await waitFor(() => {
      expect(list).toHaveTextContent(picker.noMatch.replace("{{text}}", "flange"));
    });
  });

  it("says that the values could not be read, in the place of the list, and reads again on a retry", async () => {
    let fails = true;
    const { user } = renderBar(() => {
      if (fails) throw commandFailure("Io", "The workspace file could not be read.");
      return valuePage();
    });
    const region = await bar();
    const dialog = await openEditor(user, region, "Discipline");
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(picker.valuesError);
    expect(alert).toHaveTextContent("The workspace file could not be read.");
    expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Discipline" })).toBeEnabled();

    fails = false;
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    expect(await screen.findByRole("option", { name: "Civil" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the other editors", () => {
  it("offers the age bands in words with the count of each, and sends the ticked ones", async () => {
    const { user } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Age");
    const list = within(dialog).getByRole("listbox", { name: "Age" });
    expect(options(list)).toEqual([
      "0 to 13 days",
      "14 to 29 days",
      "30 to 59 days",
      "60 to 89 days",
      "90 days or more",
    ]);
    expect(count("0 to 13 days")).toBe("412");
    expect(count("90 days or more")).toBe("1,886");
    // Without a field to type in, the list has the focus, on its first band.
    await waitFor(() => {
      expect(option("0 to 13 days")).toHaveFocus();
    });

    await user.click(option("90 days or more"));
    await waitFor(() => {
      expect(chips(region)).toEqual(["Age 90 days or more"]);
    });
    await user.click(option("0 to 13 days"));
    await waitFor(() => {
      expect(now().spec).toEqual(
        spec({
          age_bands: [
            { min_days: 0, max_days: 13 },
            { min_days: 90, max_days: null },
          ],
        }),
      );
    });
    await user.click(option("0 to 13 days"));
    await user.click(option("90 days or more"));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    expect(now().spec).toEqual(openHoldsFilter());
  });

  it("lists a ticked band that is not one of the bands first, without a count", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ ageBands: [{ min_days: 100, max_days: 200 }] });
    await user.click(await within(region).findByRole("button", { name: "Age 100 to 200 days" }));
    const list = await screen.findByRole("listbox", { name: "Age" });
    expect(options(list)[0]).toBe("100 to 200 days");
    expect(count("100 to 200 days")).toBeNull();
    expect(option("100 to 200 days")).toHaveAttribute("aria-selected", "true");
  });

  it("sends a date as soon as it is whole, one bound or both", async () => {
    const { user } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Creation date");
    const from = within(dialog).getByRole("textbox", { name: picker.date.from });
    const to = within(dialog).getByRole("textbox", { name: picker.date.to });
    await waitFor(() => {
      expect(from).toHaveFocus();
    });

    await user.type(from, "2026-09");
    expect(now().spec).toEqual(openHoldsFilter());
    await user.type(from, "-01");
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ created: { from: "2026-09-01", to: null } }));
    });
    expect(chips(region)).toEqual([`Creation date from ${formatDate("2026-09-01")}`]);
    // The date is read back in words, so a day taken for a month shows.
    expect(from).toHaveAccessibleDescription("Tuesday, 1 September 2026");

    await user.type(to, "2026-09-30");
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ created: { from: "2026-09-01", to: "2026-09-30" } }));
    });

    await user.clear(from);
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ created: { from: null, to: "2026-09-30" } }));
    });
    await user.clear(to);
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
  });

  it("sends the release date as its own range", async () => {
    const { user } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Release date");
    await user.type(within(dialog).getByRole("textbox", { name: picker.date.to }), "2026-10-07");
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ released: { from: null, to: "2026-10-07" } }));
    });
  });

  it("opens the editor of a date with the range that is set", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ created: { from: "2026-06-01", to: "2026-09-30" } });
    await user.click(
      await within(region).findByRole("button", {
        name: `Creation date ${formatDate("2026-06-01")} to ${formatDate("2026-09-30")}`,
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: filterBy("Creation date") });
    expect(within(dialog).getByRole("textbox", { name: picker.date.from })).toHaveValue(
      "2026-06-01",
    );
    expect(within(dialog).getByRole("textbox", { name: picker.date.to })).toHaveValue("2026-09-30");
  });

  it("sends nothing while From is after To, and says so at the field that was changed", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ created: { from: "2026-09-01", to: "2026-09-30" } });
    const before = spec({ created: { from: "2026-09-01", to: "2026-09-30" } });
    await user.click(await within(region).findByRole("button", { name: /^Creation date/ }));
    const dialog = await screen.findByRole("dialog", { name: filterBy("Creation date") });
    const from = within(dialog).getByRole("textbox", { name: picker.date.from });
    const to = within(dialog).getByRole("textbox", { name: picker.date.to });

    await user.clear(to);
    await user.type(to, "2026-08-15");
    await waitFor(() => {
      expect(to).toBeInvalid();
    });
    expect(to).toHaveAccessibleDescription(
      picker.date.toBeforeFrom.replace("{{from}}", formatDate("2026-09-01")),
    );
    expect(from).toBeValid();
    // The bound that was emptied on the way was sent; the range that is wrong was not.
    expect(now().spec).toEqual(spec({ created: { from: "2026-09-01", to: null } }));

    await user.clear(to);
    await user.type(to, "2026-09-30");
    await waitFor(() => {
      expect(now().spec).toEqual(before);
    });
    expect(to).toBeValid();

    await user.clear(from);
    await user.type(from, "2026-10-02");
    await waitFor(() => {
      expect(from).toBeInvalid();
    });
    expect(from).toHaveAccessibleDescription(
      picker.date.fromAfterTo.replace("{{to}}", formatDate("2026-09-30")),
    );
    expect(to).toBeValid();
    expect(now().spec).toEqual(spec({ created: { from: null, to: "2026-09-30" } }));
  });

  it("says the range is reversed at the other field while the field changed last holds no whole day", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ created: { from: "2026-09-01", to: "2026-09-30" } });
    await user.click(await within(region).findByRole("button", { name: /^Creation date/ }));
    const dialog = await screen.findByRole("dialog", { name: filterBy("Creation date") });
    const from = within(dialog).getByRole("textbox", { name: picker.date.from });
    const to = within(dialog).getByRole("textbox", { name: picker.date.to });

    await user.clear(from);
    await user.type(from, "2026-10-05");
    await waitFor(() => {
      expect(from).toBeInvalid();
    });
    // To is typed over: while it holds no whole day, its bound of before is the one in force.
    await user.tripleClick(to);
    await user.keyboard("2026-10-");
    expect(to).toHaveValue("2026-10-");
    expect(to).toBeValid();
    expect(from).toBeInvalid();
    expect(from).toHaveAccessibleDescription(
      picker.date.fromAfterTo.replace("{{to}}", formatDate("2026-09-30")),
    );
    // From was emptied on the way and that was sent; nothing reversed was.
    expect(now().spec).toEqual(spec({ created: { from: null, to: "2026-09-30" } }));
  });

  it("says that a date cannot be read once the field is left, sends nothing for it, and keeps the bound of before", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ created: { from: "2026-09-01", to: null } });
    await user.click(await within(region).findByRole("button", { name: /^Creation date/ }));
    const dialog = await screen.findByRole("dialog", { name: filterBy("Creation date") });
    const from = within(dialog).getByRole("textbox", { name: picker.date.from });

    await user.type(from, "x");
    // While it is typed, nothing is wrong yet.
    expect(from).toBeValid();
    await user.tab();
    await waitFor(() => {
      expect(from).toBeInvalid();
    });
    expect(from).toHaveAccessibleDescription(picker.date.invalid);
    expect(now().spec).toEqual(spec({ created: { from: "2026-09-01", to: null } }));
  });

  it("keeps the holds whose sizes differ or match, one choice, and clears it when it is chosen again", async () => {
    const { user } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Model and LDT sizes");
    const list = within(dialog).getByRole("listbox", { name: "Model and LDT sizes" });
    expect(options(list)).toEqual([picker.size.differ, picker.size.match]);
    expect(count(picker.size.differ)).toBe("318");
    expect(count(picker.size.match)).toBe("4,724");
    // The mark of one choice: a circle.
    expect(
      must(option(picker.size.differ).querySelector("[data-part='mark']"), "the mark"),
    ).toHaveAttribute("data-mark", "circle");

    await user.click(option(picker.size.differ));
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ size_mismatch: true }));
    });
    expect(chips(region)).toEqual(["Model and LDT sizes differ"]);

    await user.click(option(picker.size.match));
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ size_mismatch: false }));
    });
    expect(chips(region)).toEqual(["Model and LDT sizes match"]);

    await user.click(option(picker.size.match));
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
    expect(now().spec).toEqual(openHoldsFilter());
  });

  it("shows the sizes as being read until the counts are there for the first time", async () => {
    const first = held<FilterOptions>();
    const { user } = renderBar(undefined, { filter_options: first.handler });
    const region = await screen.findByRole("group", { name: text.bar });
    set({ sizeMismatch: true });
    await user.click(
      await within(region).findByRole("button", { name: "Model and LDT sizes differ" }),
    );
    const list = await screen.findByRole("listbox", { name: "Model and LDT sizes" });
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(count(picker.size.differ)).toBeNull();

    await act(async () => {
      for (const waiting of first.waiting) waiting.resolve(filterOptions());
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(count(picker.size.differ)).toBe("318");
    });
    expect(list).not.toHaveAttribute("aria-busy");
  });

  it("applies the text on Enter, not at every key, and removes the filter when the field is emptied", async () => {
    const { user } = renderBar();
    const region = await bar();
    const dialog = await openEditor(user, region, "Text");
    const field = within(dialog).getByRole("textbox", { name: "Text" });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    expect(field).toHaveAccessibleDescription(picker.text.help);

    await user.type(field, " valve ");
    expect(now().spec).toEqual(openHoldsFilter());
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(now().spec).toEqual(spec({ text: "valve" }));
    });
    expect(chips(region)).toEqual(["Text “valve”"]);
    expect(dialog).toBeInTheDocument();

    await user.clear(field);
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(chips(region)).toEqual([]);
    });
  });

  it("applies the text when the field is left by a press outside, and when the picker is closed by Escape", async () => {
    const { user } = renderBar();
    const region = await bar();
    const first = await openEditor(user, region, "Text");
    await user.type(within(first).getByRole("textbox", { name: "Text" }), "flange");
    await user.click(must(document.querySelector("[data-testid='underlay']"), "the page behind"));
    await closed();
    expect(now().spec).toEqual(spec({ text: "flange" }));

    await user.click(within(region).getByRole("button", { name: "Text “flange”" }));
    const second = await screen.findByRole("dialog", { name: filterBy("Text") });
    const field = within(second).getByRole("textbox", { name: "Text" });
    expect(field).toHaveValue("flange");
    await user.clear(field);
    await user.type(field, "gasket");
    await user.keyboard("{Escape}");
    await closed();
    expect(now().spec).toEqual(spec({ text: "gasket" }));
  });
});

describe("the picker and the keyboard", () => {
  it(
    "adds a filter of two values by the keyboard alone, and gives the focus back to Add filter",
    SLOW,
    async () => {
      const { user } = renderBar();
      const region = await bar();
      const add = addFilter(region);
      act(() => {
        add.focus();
      });
      await user.keyboard("{Enter}");
      const fields = await screen.findByRole("menu", { name: picker.fields });
      await waitFor(() => {
        expect(within(fields).getByRole("menuitem", { name: "Discipline" })).toHaveFocus();
      });
      await user.keyboard("{Enter}");

      const dialog = await screen.findByRole("dialog", { name: filterBy("Discipline") });
      const search = within(dialog).getByRole("textbox", { name: "Discipline" });
      await waitFor(() => {
        expect(search).toHaveFocus();
      });
      await screen.findByRole("option", { name: "Civil" });

      // Tab goes from the search field to the choice, and from the choice to the list.
      await user.tab();
      expect(within(dialog).getByRole("radio", { name: picker.condition.is })).toHaveFocus();
      await user.tab();
      await waitFor(() => {
        expect(option("Piping")).toHaveFocus();
      });
      await user.keyboard(" ");
      await waitFor(() => {
        expect(chips(region)).toEqual(["Discipline Piping"]);
      });
      await user.keyboard("{ArrowDown}");
      await waitFor(() => {
        expect(option("Process")).toHaveFocus();
      });
      await user.keyboard(" ");
      await waitFor(() => {
        expect(chips(region)).toEqual(["Discipline Piping, Process"]);
      });
      // Tab stays inside the picker.
      await user.tab();
      expect(search).toHaveFocus();

      await user.keyboard("{Escape}");
      await closed();
      await waitFor(() => {
        expect(addFilter(region)).toHaveFocus();
      });
      // The two values are in one chip.
      expect(chips(region)).toEqual(["Discipline Piping, Process"]);
    },
  );

  it("jumps to a field by its first letters", async () => {
    const { user } = renderBar();
    const region = await bar();
    const fields = await openFields(user, region);
    await waitFor(() => {
      expect(within(fields).getByRole("menuitem", { name: "Discipline" })).toHaveFocus();
    });
    await user.keyboard("li");
    await waitFor(() => {
      expect(within(fields).getByRole("menuitem", { name: "Line ID" })).toHaveFocus();
    });
  });

  it("opens the editor of a chip at once, with its values ticked and the focus in its search field", async () => {
    const { user } = renderBar();
    const region = await bar();
    set({ fields: [{ dim: "HoldType", values: [value("Process")], negate: false }] });
    const chip = await within(region).findByRole("button", { name: "Hold type Process" });
    const add = addFilter(region);
    await user.click(chip);
    const dialog = await screen.findByRole("dialog", { name: filterBy("Hold type") });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(add).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(within(dialog).getByRole("textbox", { name: "Hold type" })).toHaveFocus();
    });
    await waitFor(() => {
      expect(option("Process")).toHaveAttribute("aria-selected", "true");
    });

    await user.keyboard("{Escape}");
    await closed();
    await waitFor(() => {
      expect(chip).toHaveFocus();
    });
  });

  it(
    "has no accessibility violation with the list of fields open, and with each editor open",
    SLOW,
    async () => {
      const { user } = renderBar(() => valuePage({ total: 1500 }));
      const region = await bar();
      set({ fields: [{ dim: "Discipline", values: [value("Marine")], negate: true }] });
      await openFields(user, region);
      await expectNoAxeViolations();
      await user.keyboard("{Escape}");
      await closed();

      for (const field of ["Discipline", "Age", "Creation date", "Model and LDT sizes", "Text"]) {
        const dialog = await openEditor(user, region, field);
        if (field === "Discipline") await screen.findByRole("option", { name: "Civil" });
        if (field === "Creation date") {
          // An error at a field is part of what is checked.
          await user.type(within(dialog).getByRole("textbox", { name: picker.date.from }), "x");
          await user.tab();
        }
        await expectNoAxeViolations();
        await user.keyboard("{Escape}");
        await closed();
      }
    },
  );
});
