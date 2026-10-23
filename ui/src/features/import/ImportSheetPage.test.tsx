import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { ImportDraft } from "../../bindings/ImportDraft";
import en from "../../locales/en.json";
import { expectNoAxeViolations } from "../../test/axe";
import { openFlow, pageTitled } from "../../test/flow";
import { exportDraft, freeTarget, review, unmappedDraft } from "../../test/import";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";

const text = en.import.sheet;

function workbook(): ImportDraft {
  const base = exportDraft();
  return { ...base, file: { ...base.file, sheets: ["info", "data", "Sheet3"] } };
}

function use(sheet: string): string {
  return text.useNamed.replace("{{sheet}}", sheet);
}

describe("the sheet page", () => {
  it("lists the sheets of the workbook and marks the one that was read", async () => {
    openFlow("/import/sheet", { draft: workbook() });
    const main = await pageTitled(text.title);
    const list = within(main).getByRole("list", {
      name: text.list.replace("{{file}}", "Holds_2026-10-14.xlsx"),
    });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByText(/^(info|data|Sheet3)$/).textContent)).toEqual(
      ["info", "data", "Sheet3"],
    );
    expect(items[1]).toHaveTextContent(text.inUse);
    expect(items[1]).toHaveTextContent("9,702 rows");
    expect(within(must(items[1])).queryByRole("button")).not.toBeInTheDocument();
    expect(within(must(items[0])).getByRole("button", { name: use("info") })).toBeEnabled();
    expect(items[0]).not.toHaveTextContent(text.inUse);
  });

  it("writes out the roles of the list, which a list drawn without markers loses in WebKit", async () => {
    openFlow("/import/sheet", { draft: workbook() });
    const main = await pageTitled(text.title);
    const list = within(main).getByRole("list", {
      name: text.list.replace("{{file}}", "Holds_2026-10-14.xlsx"),
    });
    expect(list).toHaveAttribute("role", "list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) expect(item).toHaveAttribute("role", "listitem");
  });

  it("while a sheet is read, shows the spinner on its button alone and keeps the others inert", async () => {
    const { user } = openFlow("/import/sheet", {
      draft: workbook(),
      handlers: { import_choose_sheet: () => new Promise<ImportDraft>(() => undefined) },
    });
    const main = await pageTitled(text.title);
    await user.click(within(main).getByRole("button", { name: use("Sheet3") }));
    const pressed = within(main).getByRole("button", { name: use("Sheet3") });
    await waitFor(() => {
      expect(pressed.querySelector('[data-part="spinner"]')).not.toBeNull();
    });
    expect(pressed).toHaveAttribute("aria-busy", "true");
    const others = [
      within(main).getByRole("button", { name: use("info") }),
      within(main).getByRole("button", { name: text.keep.replace("{{sheet}}", "data") }),
      within(main).getByRole("button", { name: en.common.cancel }),
    ];
    for (const other of others) {
      expect(other).toHaveAttribute("data-inert");
      expect(other).toHaveAttribute("aria-busy", "true");
      expect(other).not.toBeDisabled();
      expect(other.querySelector('[data-part="spinner"]')).toBeNull();
    }
  });

  it("while the import is cancelled, shows the spinner on Cancel alone and keeps the sheets inert", async () => {
    const { user } = openFlow("/import/sheet", {
      draft: workbook(),
      handlers: { import_cancel: () => new Promise<null>(() => undefined) },
    });
    const main = await pageTitled(text.title);
    const cancel = within(main).getByRole("button", { name: en.common.cancel });
    await user.click(cancel);
    await waitFor(() => {
      expect(cancel.querySelector('[data-part="spinner"]')).not.toBeNull();
    });
    const others = [
      within(main).getByRole("button", { name: use("info") }),
      within(main).getByRole("button", { name: use("Sheet3") }),
      within(main).getByRole("button", { name: text.keep.replace("{{sheet}}", "data") }),
    ];
    for (const other of others) {
      expect(other).toHaveAttribute("data-inert");
      expect(other).toHaveAttribute("aria-busy", "true");
      expect(other.querySelector('[data-part="spinner"]')).toBeNull();
    }
  });

  it("names the step in the breadcrumb, under Import", async () => {
    openFlow("/import/sheet", { draft: workbook() });
    await pageTitled(text.title);
    const trail = screen.getByRole("navigation", { name: en.breadcrumb.label });
    expect(within(trail).getByRole("link", { name: en.import.title })).toBeInTheDocument();
    expect(within(trail).getByText(text.title)).toHaveAttribute("aria-current", "page");
  });

  it("reads the chosen sheet, replaces the draft, and goes on to the review", async () => {
    const other: ImportDraft = {
      ...workbook(),
      file: { ...workbook().file, sheet_name: "Sheet3", row_count: 12 },
    };
    const chosen = vi.fn(() => other);
    const { user, router } = openFlow("/import/sheet", {
      draft: workbook(),
      handlers: {
        import_choose_sheet: chosen,
        import_review: () => review(),
        import_check_target: () => freeTarget,
      },
    });
    // A review of the sheet that was read before is not the review of the new one.
    queryClient.setQueryData(keys.importReview, review({ row_count: 1 }));
    const main = await pageTitled(text.title);
    await user.click(within(main).getByRole("button", { name: use("Sheet3") }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
    expect(chosen).toHaveBeenCalledWith({ sheet: "Sheet3" });
    expect(queryClient.getQueryData(keys.importDraft)).toEqual(other);
    expect(router.state.location.state).toMatchObject({ from: "/lines" });
    const figures = await screen.findByRole("group", { name: en.import.review.figures });
    expect(figures).toHaveTextContent("9,702");
  });

  it("goes on to the mapping page when the chosen sheet lacks required fields", async () => {
    const other = unmappedDraft();
    const { user, router } = openFlow("/import/sheet", {
      draft: workbook(),
      handlers: {
        import_choose_sheet: () => ({
          ...other,
          file: { ...other.file, sheets: ["info", "data", "Sheet3"], sheet_name: "info" },
        }),
      },
    });
    const main = await pageTitled(text.title);
    await user.click(within(main).getByRole("button", { name: use("info") }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/mapping");
    });
  });

  it("shows why a sheet could not be read, by the kind of the error, and keeps the draft", async () => {
    const message =
      'The sheet named "Sheet3" is not in the file. The sheets in the file are: info, data. Choose one of them.';
    const { user, router } = openFlow("/import/sheet", {
      draft: workbook(),
      handlers: {
        import_choose_sheet: () => {
          throw commandFailure("SheetNotFound", message);
        },
      },
    });
    const main = await pageTitled(text.title);
    await user.click(within(main).getByRole("button", { name: use("Sheet3") }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.import.error.SheetNotFound);
    expect(alert).toHaveTextContent(message);
    expect(alert.closest("[data-kind]")).toHaveAttribute("data-kind", "SheetNotFound");
    expect(router.state.location.pathname).toBe("/import/sheet");
    expect(queryClient.getQueryData(keys.importDraft)).toEqual(workbook());
  });

  it("goes back to the review with the sheet as it is on Keep", async () => {
    const { user, router } = openFlow("/import/sheet", {
      draft: workbook(),
      handlers: { import_review: () => review(), import_check_target: () => freeTarget },
    });
    const main = await pageTitled(text.title);
    await user.click(
      within(main).getByRole("button", { name: text.keep.replace("{{sheet}}", "data") }),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
  });

  it("says that there is nothing to choose for a file without several sheets", async () => {
    openFlow("/import/sheet", { draft: unmappedDraft() });
    const main = await pageTitled(text.title);
    expect(within(main).getByText(text.none)).toBeVisible();
    expect(within(main).queryByRole("list", { name: /^Sheets of/ })).not.toBeInTheDocument();
  });

  it("drops the draft on Cancel and returns to where the import was started", async () => {
    const cancel = vi.fn(() => null);
    const { user, router } = openFlow("/import/sheet", {
      draft: workbook(),
      from: "/history",
      handlers: { import_cancel: cancel },
    });
    const main = await pageTitled(text.title);
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/history");
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violation", SLOW, async () => {
    openFlow("/import/sheet", { draft: workbook() });
    await pageTitled(text.title);
    await expectNoAxeViolations(document.body, { page: true });
  });
});

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("The test expected an item of the list.");
  return value;
}
