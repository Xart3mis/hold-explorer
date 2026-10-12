import { screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { ImportReview } from "../../bindings/ImportReview";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must } from "../../test/app";
import { choose, openFlow, pageTitled } from "../../test/flow";
import { exportDraft, review, savedMappingDraft, unmappedDraft } from "../../test/import";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";

const text = en.import.mapping;
const names = en.import.field;

/** The name of the select of a field: what is chosen, then its label. */
function field(label: string, required = false): RegExp {
  const shown = required ? text.requiredLabel.replace("{{field}}", label) : label;
  return new RegExp(` ${shown.replace(/[()]/g, "\\$&")}$`);
}

const lineId = field(names.LineId, true);
const remark = field(names.Remark, true);
const holdType = field(names.HoldType, true);

async function mapping() {
  return pageTitled(text.title);
}

describe("the mapping page", () => {
  it("lists the required fields first, marked as required in words, then the optional ones", async () => {
    openFlow("/import/mapping", { draft: unmappedDraft() });
    const main = await mapping();
    const order = [...main.querySelectorAll("[data-field]")].map((row) =>
      row.getAttribute("data-field"),
    );
    expect(order.slice(0, 3)).toEqual(["LineId", "Remark", "HoldType"]);
    expect(order).toHaveLength(14);
    expect(new Set(order).size).toBe(14);
    for (const required of [lineId, remark, holdType]) {
      expect(within(main).getByRole("button", { name: required })).toBeVisible();
    }
    expect(within(main).getByRole("button", { name: field(names.SourceId) })).toBeVisible();
    expect(within(main).getByRole("button", { name: field(names.StressCalc) })).toBeVisible();
    expect(within(main).getByRole("heading", { level: 2, name: text.required })).toBeVisible();
    expect(within(main).getByRole("heading", { level: 2, name: text.optional })).toBeVisible();
  });

  it("names the step in the breadcrumb, under Import", async () => {
    openFlow("/import/mapping", { draft: unmappedDraft() });
    await mapping();
    const trail = screen.getByRole("navigation", { name: en.breadcrumb.label });
    expect(within(trail).getByRole("link", { name: en.import.title })).toBeInTheDocument();
    expect(within(trail).getByText(text.title)).toHaveAttribute("aria-current", "page");
  });

  it("marks each required field without a column with what to do, and blocks Continue with the reason", async () => {
    openFlow("/import/mapping", { draft: unmappedDraft() });
    const main = await mapping();
    expect(within(main).getAllByText(text.missing)).toHaveLength(3);
    expect(within(main).getByRole("button", { name: text.continue })).toBeDisabled();
    const reason = text.blocked.replace(
      "{{fields}}",
      `${names.LineId}, ${names.Remark}, ${names.HoldType}`,
    );
    expect(within(main).getByText(reason)).toBeVisible();
  });

  it("offers each column with its header and its first value", SLOW, async () => {
    const { user } = openFlow("/import/mapping", { draft: unmappedDraft() });
    const main = await mapping();
    await user.click(within(main).getByRole("button", { name: lineId }));
    const list = await screen.findByRole("listbox");
    const options = within(list).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "KindVendor data",
      "Line78B01-573-4434-FW-001",
      "WhyHOLD FOR 577-PR-400",
      "Raised on03/08/2026",
      'Size6"',
    ]);
  });

  it(
    "enables Continue once every required field has a column, and reviews with that mapping",
    SLOW,
    async () => {
      const reviewed = vi.fn<(args: { fields: unknown }) => ImportReview>(() => review());
      const { user, router } = openFlow("/import/mapping", {
        draft: unmappedDraft(),
        handlers: {
          import_review: reviewed,
          import_check_target: () => ({ already_imported: null, same_day: [] }),
        },
      });
      const main = await mapping();
      const next = within(main).getByRole("button", { name: text.continue });
      await choose(user, lineId, /^Line/);
      await choose(user, remark, /^Why/);
      expect(next).toBeDisabled();
      await choose(user, holdType, /^Kind/);
      expect(next).toBeEnabled();
      expect(within(main).queryByText(text.missing)).not.toBeInTheDocument();

      await user.click(next);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/import/review");
      });
      expect(reviewed).toHaveBeenCalledTimes(1);
      expect(reviewed).toHaveBeenCalledWith({ fields: { LineId: 1, Remark: 2, HoldType: 0 } });
      // The review that was made is the one the next page shows: it is not asked for again.
      await pageTitled(en.import.review.title);
      expect(reviewed).toHaveBeenCalledTimes(1);
      expect(router.state.location.state).toMatchObject({ from: "/lines" });
    },
  );

  it(
    "gives a column to one field only: choosing it again clears the earlier field and says so",
    SLOW,
    async () => {
      const { user } = openFlow("/import/mapping", { draft: unmappedDraft() });
      const main = await mapping();
      await choose(user, lineId, /^Line/);
      expect(within(main).getByRole("button", { name: lineId })).toHaveTextContent("Line");

      await user.click(within(main).getByRole("button", { name: remark }));
      const list = await screen.findByRole("listbox");
      // The column that is taken says which field has it.
      const taken = within(list).getByRole("option", { name: /^Line/ });
      expect(taken).toHaveTextContent(text.usedBy.replace("{{field}}", names.LineId));
      await user.click(taken);

      expect(within(main).getByRole("button", { name: remark })).toHaveTextContent("Line");
      expect(within(main).getByRole("button", { name: lineId })).toHaveTextContent(
        text.placeholder,
      );
      const said = text.moved
        .replace("{{column}}", "Line")
        .replace("{{field}}", names.Remark)
        .replace("{{previous}}", names.LineId);
      expect(within(main).getByText(said).closest('[role="status"]')).toBeVisible();
    },
  );

  it("lets an optional field have no column, and a required one not", SLOW, async () => {
    const { user } = openFlow("/import/mapping", { draft: exportDraft() });
    const main = await mapping();
    const size = field(names.ModelSize);
    expect(within(main).getByRole("button", { name: size })).toHaveTextContent("model_size");
    await choose(user, size, text.none);
    expect(within(main).getByRole("button", { name: size })).toHaveTextContent(text.none);

    await user.click(within(main).getByRole("button", { name: lineId }));
    const list = await screen.findByRole("listbox");
    expect(within(list).queryByRole("option", { name: text.none })).not.toBeInTheDocument();
  });

  it("says that the saved mapping of the workspace was applied", async () => {
    openFlow("/import/mapping", { draft: savedMappingDraft() });
    const main = await mapping();
    expect(within(main).getByText(text.savedTitle)).toBeVisible();
    expect(within(main).getByText(text.savedText)).toBeVisible();
    expect(within(main).getByRole("button", { name: lineId })).toHaveTextContent("Line");
    expect(within(main).getByRole("button", { name: text.continue })).toBeEnabled();
  });

  it("says nothing about a saved mapping when none was applied", async () => {
    openFlow("/import/mapping", { draft: exportDraft() });
    const main = await mapping();
    expect(within(main).queryByText(text.savedTitle)).not.toBeInTheDocument();
  });

  it("goes back to the automatic mapping on Reset to automatic, and says so", async () => {
    const { user } = openFlow("/import/mapping", { draft: savedMappingDraft() });
    const main = await mapping();
    await user.click(within(main).getByRole("button", { name: text.reset }));
    expect(within(main).getByRole("button", { name: lineId })).toHaveTextContent(text.placeholder);
    expect(within(main).getByText(text.resetDone)).toBeVisible();
    expect(within(main).getByRole("button", { name: text.continue })).toBeDisabled();
  });

  it("shows the first rows of the file, with the field each mapped column supplies", async () => {
    openFlow("/import/mapping", { draft: savedMappingDraft() });
    const main = await mapping();
    const table = within(main).getByRole("grid", { name: text.preview });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual([
      `Kind (used for ${names.HoldType})`,
      `Line (used for ${names.LineId})`,
      `Why (used for ${names.Remark})`,
      `Raised on (used for ${names.Created})`,
      "Size",
    ]);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("78B01-573-4434-FW-002")).toBeInTheDocument();
    // The rows are there to be read: none says that it can be selected.
    for (const row of within(table).getAllByRole("row")) {
      expect(row).not.toHaveAttribute("aria-selected");
    }
  });

  it(
    "shows why the file cannot be read with the mapping, by the kind of the error, and stays",
    SLOW,
    async () => {
      const message =
        'No hold could be read: 5042 rows were skipped, for example row 2: unparseable date "Vendor data". Check the column mapping and the date format.';
      const { user, router } = openFlow("/import/mapping", {
        draft: savedMappingDraft(),
        handlers: {
          import_review: () => {
            throw commandFailure("NoHolds", message);
          },
        },
      });
      const main = await mapping();
      await user.click(within(main).getByRole("button", { name: text.continue }));
      const alert = await within(main).findByRole("alert");
      expect(alert).toHaveTextContent(en.import.error.NoHolds);
      expect(alert).toHaveTextContent(message);
      expect(alert.closest("[data-kind]")).toHaveAttribute("data-kind", "NoHolds");
      expect(router.state.location.pathname).toBe("/import/mapping");
      // The choices are kept.
      expect(within(main).getByRole("button", { name: lineId })).toHaveTextContent("Line");
    },
  );

  it("takes the required fields from the draft and keeps no list of its own", SLOW, async () => {
    const { user } = openFlow("/import/mapping", {
      draft: unmappedDraft({
        required: ["LineId", "Created"],
        missing_required: ["LineId", "Created"],
      }),
    });
    const main = await mapping();
    const order = [...main.querySelectorAll("[data-field]")].map((row) =>
      row.getAttribute("data-field"),
    );
    expect(order.slice(0, 2)).toEqual(["LineId", "Created"]);
    expect(order).toHaveLength(14);
    expect(new Set(order).size).toBe(14);
    expect(within(main).getByRole("button", { name: lineId })).toBeVisible();
    expect(within(main).getByRole("button", { name: field(names.Created, true) })).toBeVisible();
    expect(within(main).getAllByText(text.missing)).toHaveLength(2);
    expect(
      within(main).getByText(
        text.blocked.replace("{{fields}}", `${names.LineId}, ${names.Created}`),
      ),
    ).toBeVisible();

    // A field the draft does not call required is optional here, whatever it is elsewhere.
    const type = field(names.HoldType);
    expect(within(main).getByRole("button", { name: type })).toHaveTextContent(text.none);
    await choose(user, lineId, /^Line/);
    await choose(user, field(names.Created, true), /^Raised on/);
    expect(within(main).getByRole("button", { name: text.continue })).toBeEnabled();
  });

  it(
    "says why Continue is disabled in a region that is announced, and as the description of the button",
    SLOW,
    async () => {
      const { user } = openFlow("/import/mapping", { draft: unmappedDraft() });
      const main = await mapping();
      const reason = text.blocked.replace(
        "{{fields}}",
        `${names.LineId}, ${names.Remark}, ${names.HoldType}`,
      );
      const region = main.querySelector('[data-part="continue-status"]');
      expect(region).toHaveAttribute("role", "status");
      expect(region).toHaveTextContent(reason);
      const next = within(main).getByRole("button", { name: text.continue });
      expect(next).toHaveAccessibleDescription(reason);

      await choose(user, lineId, /^Line/);
      await choose(user, remark, /^Why/);
      await choose(user, holdType, /^Kind/);
      expect(main.querySelector('[data-part="continue-status"]')).toBe(region);
      expect(region).toBeEmptyDOMElement();
      expect(next).toHaveAccessibleDescription("");
    },
  );

  it("offers another sheet only for a workbook that has several", async () => {
    const first = openFlow("/import/mapping", { draft: exportDraft() });
    const main = await mapping();
    await first.user.click(within(main).getByRole("button", { name: en.import.chooseSheet }));
    expect(first.router.state.location.pathname).toBe("/import/sheet");
    first.unmount();

    openFlow("/import/mapping", { draft: unmappedDraft() });
    expect(
      within(await mapping()).queryByRole("button", { name: en.import.chooseSheet }),
    ).not.toBeInTheDocument();
  });

  it("drops the draft on Cancel and returns to where the import was started", async () => {
    const cancel = vi.fn(() => null);
    const { user, router } = openFlow("/import/mapping", {
      draft: unmappedDraft(),
      from: "/history",
      handlers: { import_cancel: cancel },
    });
    const main = await mapping();
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/history");
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
  });

  it("leads back to the import page, with the reason, when no file is open", async () => {
    const { router } = openFlow("/import/mapping", { draft: unmappedDraft() });
    queryClient.removeQueries({ queryKey: keys.importDraft });
    const main = await pageTitled(en.import.title);
    expect(router.state.location.pathname).toBe("/import");
    expect(within(main).getByText(en.import.reopen.title)).toBeVisible();
    expect(within(main).getByText(en.import.reopen.text)).toBeVisible();
    expect(within(main).getByRole("button", { name: en.welcome.openFile })).toBeInTheDocument();
  });

  it(
    "says why the review sent the user back, marks the fields, and stops saying it once they have columns",
    SLOW,
    async () => {
      const message =
        "Missing required columns: line_id, hold_remark, hold_type. Map them to columns of the file.";
      const { user, router } = openFlow("/import/review", {
        draft: unmappedDraft(),
        handlers: {
          import_review: () => {
            throw commandFailure("MissingColumns", message);
          },
        },
      });
      const main = await mapping();
      expect(router.state.location.pathname).toBe("/import/mapping");
      const title = within(main).getByText(text.sentBackTitle);
      const notice = title.closest("[data-kind]");
      expect(notice).toHaveAttribute("data-kind", "MissingColumns");
      expect(notice).toHaveTextContent(message);
      expect(within(main).getAllByText(text.missing)).toHaveLength(3);
      // Where the import was started is still known.
      expect(router.state.location.state).toMatchObject({ from: "/lines" });

      await choose(user, lineId, /^Line/);
      await choose(user, remark, /^Why/);
      expect(within(main).getByText(text.sentBackTitle)).toBeVisible();
      await choose(user, holdType, /^Kind/);
      expect(within(main).queryByText(text.sentBackTitle)).not.toBeInTheDocument();
    },
  );

  it(
    "says why the review sent the user back also when the page sees every required field with a column, until the mapping is changed",
    SLOW,
    async () => {
      const message =
        "Missing required columns: hold_type. The column mapped to it is not in the sheet that was read. Map it to a column of the file.";
      const { user, router } = openFlow("/import/review", {
        draft: exportDraft(),
        handlers: {
          import_review: () => {
            throw commandFailure("MissingColumns", message);
          },
        },
      });
      const main = await mapping();
      expect(router.state.location.pathname).toBe("/import/mapping");
      // The page itself finds nothing missing, and Continue is not held back.
      expect(within(main).queryByText(text.missing)).not.toBeInTheDocument();
      expect(within(main).getByRole("button", { name: text.continue })).toBeEnabled();
      // The review said otherwise, and the user is told why they are here.
      const title = within(main).getByText(text.sentBackTitle);
      const notice = title.closest("[data-kind]");
      expect(notice).toHaveAttribute("data-kind", "MissingColumns");
      expect(notice).toHaveTextContent(message);

      // A changed mapping answers it: what the review said was about the mapping of before.
      await choose(user, holdType, /^discipline/);
      expect(within(main).queryByText(text.sentBackTitle)).not.toBeInTheDocument();
    },
  );

  it("says nothing of the kind on a mapping page the user came to by choice", async () => {
    openFlow("/import/mapping", { draft: unmappedDraft() });
    const main = await mapping();
    expect(within(main).queryByText(text.sentBackTitle)).not.toBeInTheDocument();
  });

  it("keeps its fields at the width of a form and gives the preview the width of the content area", async () => {
    openFlow("/import/mapping", { draft: exportDraft() });
    const main = await mapping();
    // The page is not capped; the part that is a form is.
    const page = must(main.querySelector("[data-part='page']"), "the page");
    expect(page).toHaveAttribute("data-width", "full");
    const form = must(main.querySelector<HTMLElement>("[data-part='mapping-form']"), "the form");
    expect(form.querySelectorAll("[data-field]")).toHaveLength(14);
    expect(form).toContainElement(within(main).getByRole("button", { name: text.continue }));
    // A real export has fifteen columns: its table is outside the form, so it is as wide as the
    // content area and scrolls sideways only past that.
    const table = within(main).getByRole("grid", { name: text.preview });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(15);
    expect(form).not.toContainElement(table);
    expect(page).toContainElement(table);
    // What caps the form is the token of the form width, and nothing caps the table.
    const stylesheet = readFileSync(join(import.meta.dirname, "Import.module.css"), "utf8");
    const rule = /\.form\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? "";
    expect(rule).toContain("max-inline-size: var(--layout-form-max-width)");
    const classes = (element: Element) => [...element.classList].join(" ");
    expect(classes(form)).toMatch(/form/);
    for (let box = table.parentElement; box !== null && box !== page; box = box.parentElement) {
      expect(classes(box)).not.toMatch(/\bform\b|_form_/);
    }
  });

  it("has no accessibility violation, with fields missing and with a list open", SLOW, async () => {
    const { user } = openFlow("/import/mapping", { draft: unmappedDraft() });
    const main = await mapping();
    await expectAccessible(document.body, { page: true });
    await user.click(within(main).getByRole("button", { name: lineId }));
    await screen.findByRole("listbox");
    await expectAccessible(document.body, { page: true });
  });
});
