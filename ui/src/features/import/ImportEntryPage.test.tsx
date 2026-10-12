import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { ImportDraft } from "../../bindings/ImportDraft";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import { draft, openStart, startState } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { fileDrag, windowApi } from "../../test/window";

const FILE = "/home/ada/exports/Holds_2026-10-07.xlsx";
const reading = en.import.reading.replace("{{file}}", "Holds_2026-10-07.xlsx");

function at(state: Record<string, unknown>) {
  return { pathname: "/import", state };
}

async function page() {
  await screen.findByRole("heading", { level: 1, name: en.import.title });
  return screen.getByRole("main");
}

describe("the import page while the file is read", () => {
  it("opens the file, says which file is being read, and shows the shape of the page to come", async () => {
    const open = vi.fn(() => new Promise<ImportDraft>(() => undefined));
    renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { import_open: open },
    });
    const main = await page();
    expect(await within(main).findByText(reading)).toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ path: FILE });
    const loading = main.querySelector('[aria-busy="true"]');
    expect(loading).toBeInTheDocument();
    expect(loading?.querySelectorAll('[data-part="skeleton"]').length).toBeGreaterThan(3);
    expect(within(main).getByRole("button", { name: en.common.cancel })).toBeInTheDocument();
    // The entry page is the first page of the flow: it has no ancestor, so no breadcrumb.
    expect(screen.queryByRole("navigation", { name: en.breadcrumb.label })).not.toBeInTheDocument();
  });

  it("has no accessibility violation", SLOW, async () => {
    renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { import_open: () => new Promise<ImportDraft>(() => undefined) },
    });
    await within(await page()).findByText(reading);
    await expectAccessible(document.body, { page: true });
  });
});

describe("the import page once the file is open", () => {
  it("keeps the draft and goes to the review when every required field is covered", async () => {
    const opened = draft();
    const { router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { import_open: () => opened },
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
    expect(queryClient.getQueryData(keys.importDraft)).toEqual(opened);
    // Where the import was started travels with it, for the Cancel of the pages to come.
    expect(router.state.location.state).toMatchObject({ from: "/lines" });
  });

  it("goes to the mapping step when a required field has no column", async () => {
    const opened = draft({ missing_required: ["LineId"] });
    const { router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/overview" }),
      handlers: { import_open: () => opened },
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/mapping");
    });
    expect(queryClient.getQueryData(keys.importDraft)).toEqual(opened);
  });

  it("does not leave the import page in the history, so Back does not read the file again", async () => {
    const open = vi.fn(() => draft());
    const { router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { import_open: open },
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
    expect(router.state.historyAction).toBe("REPLACE");
  });
});

describe("a second file dropped while the first is still being read", () => {
  const OTHER = "/home/ada/exports/Holds_2026-10-14.xlsx";

  it("starts a new read for the new file and ignores what the old read returns", async () => {
    const answers = new Map<string, (draft: ImportDraft) => void>();
    const open = vi.fn(
      ({ path }: { path: string }) =>
        new Promise<ImportDraft>((resolve) => {
          answers.set(path, resolve);
        }),
    );
    const { router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { import_open: open },
    });
    const main = await page();
    await within(main).findByText(reading);
    expect(open).toHaveBeenCalledTimes(1);

    fileDrag.drop([OTHER]);
    await within(main).findByText(en.import.reading.replace("{{file}}", "Holds_2026-10-14.xlsx"));
    expect(within(main).queryByText(reading)).not.toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith({ path: OTHER });
    // The import was started on Lines, and that is still where Cancel returns to.
    expect(router.state.location.state).toMatchObject({ path: OTHER, from: "/lines" });

    // The old read answers late, with a file that would need the mapping step. Nothing follows.
    const stale = draft({ missing_required: ["LineId"] });
    must(answers.get(FILE), "the first read")(stale);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(router.state.location.pathname).toBe("/import");
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();

    const fresh = draft();
    must(answers.get(OTHER), "the second read")(fresh);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
    expect(queryClient.getQueryData(keys.importDraft)).toEqual(fresh);
  });
});

describe("the import page when the file cannot be opened", () => {
  const message =
    "The file /home/ada/exports/Holds_2026-10-07.xlsx was not found. It may have been moved or renamed; choose the file again.";

  function failing(kind: string, text = message) {
    return {
      import_open: () => {
        throw commandFailure(kind, text);
      },
    };
  }

  it.each([
    ["NotFound", en.import.error.NotFound],
    ["Unreadable", en.import.error.Unreadable],
    ["EmptyFile", en.import.error.EmptyFile],
    ["NoDataSheet", en.import.error.NoDataSheet],
    ["SheetNotFound", en.import.error.SheetNotFound],
    ["MissingColumns", en.import.error.MissingColumns],
    ["Empty", en.import.error.Empty],
    ["NoHolds", en.import.error.NoHolds],
    ["Internal", en.import.error.other],
  ])("shows a %s error by its kind, with the fix the command gives", async (kind, title) => {
    renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: failing(kind),
    });
    const main = await page();
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(title);
    expect(alert).toHaveTextContent(message);
    expect(alert.closest("[data-kind]")).toHaveAttribute("data-kind", kind);
    expect(within(main).queryByText(reading)).not.toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.import.chooseAnother })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.common.cancel })).toBeInTheDocument();
  });

  it("opens the file dialog on Choose another file and reads the file that is chosen", async () => {
    const other = "/home/ada/exports/Holds_2026-10-14.xlsx";
    windowApi.chooseImportFile.mockResolvedValue(other);
    const open = vi
      .fn<(args: { path: string }) => ImportDraft>()
      .mockImplementationOnce(() => {
        throw commandFailure("NotFound", message);
      })
      .mockImplementation(() => draft());
    const { user, router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { import_open: open },
    });
    const main = await page();
    await user.click(await within(main).findByRole("button", { name: en.import.chooseAnother }));
    expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
    expect(open).toHaveBeenLastCalledWith({ path: other });
    // Cancel still returns to where the import was first started.
    expect(router.state.location.state).toMatchObject({ from: "/lines" });
  });

  it("drops the draft on Cancel and returns to where the import was started", async () => {
    const cancel = vi.fn(() => null);
    const { user, router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: { ...failing("NotFound"), import_cancel: cancel },
    });
    const main = await page();
    await within(main).findByRole("alert");
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    expect(cancel).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
  });

  it("returns to the workspaces on Cancel when the import was started without a workspace", async () => {
    const { user, router } = renderApp({
      start: startState(),
      path: at({ path: FILE, from: "/welcome" }),
      handlers: { ...failing("NotFound"), import_cancel: () => null },
    });
    const main = await page();
    await within(main).findByRole("alert");
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/welcome");
    });
  });

  it("has no accessibility violation", SLOW, async () => {
    renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: failing("NotFound"),
    });
    await within(await page()).findByRole("alert");
    await expectAccessible(document.body, { page: true });
  });
});

describe("Cancel pressed while the file is still being read", () => {
  it("wins over the read: the flow does not move on, and the user ends where the import was started", async () => {
    let opened: (draft: ImportDraft) => void = () => undefined;
    let cancelled: (answer: null) => void = () => undefined;
    const cancel = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          cancelled = resolve;
        }),
    );
    const { user, router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: {
        import_open: () =>
          new Promise<ImportDraft>((resolve) => {
            opened = resolve;
          }),
        import_cancel: cancel,
        import_review: () => new Promise(() => undefined),
      },
    });
    const main = await page();
    await within(main).findByText(reading);
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    expect(cancel).toHaveBeenCalledTimes(1);

    // The read answers first, as it does when the cancel waits for it on the Rust side.
    opened(draft());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(router.state.location.pathname).toBe("/import");
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();

    cancelled(null);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/lines");
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(router.state.location.pathname).toBe("/lines");
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
  });
});

describe("the import page while a file is already open", () => {
  it("names the file and leads back to its review", async () => {
    const { user, router } = renderApp({
      start: openStart(),
      path: at({ from: "/lines" }),
      handlers: { import_review: () => new Promise(() => undefined) },
    });
    queryClient.setQueryData(keys.importDraft, draft());
    const main = await page();
    const notice = within(main).getByText(
      en.import.stillOpen.replace("{{file}}", "Holds_2026-10-07.xlsx"),
    );
    expect(notice).toBeVisible();
    await user.click(within(main).getByRole("button", { name: en.import.continue }));
    expect(router.state.location.pathname).toBe("/import/review");
    expect(router.state.location.state).toMatchObject({ from: "/lines" });
  });

  it("leads to the mapping page for a file whose required fields have no column", async () => {
    const { user, router } = renderApp({ start: openStart(), path: at({ from: "/lines" }) });
    queryClient.setQueryData(keys.importDraft, draft({ missing_required: ["LineId"] }));
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.import.continue }));
    expect(router.state.location.pathname).toBe("/import/mapping");
  });
});

describe("the import page in its other states", () => {
  it("says that one file is imported at a time when several were dropped", async () => {
    renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines", others: 2 }),
      handlers: { import_open: () => new Promise<ImportDraft>(() => undefined) },
    });
    const main = await page();
    const text = en.import.severalDropped.replace("{{count, number}}", "3");
    expect(await within(main).findByText(text)).toBeInTheDocument();
    expect(within(main).getByText(reading)).toBeInTheDocument();
  });

  it("offers to choose a file when it is opened without one, and reads nothing", async () => {
    const open = vi.fn(() => draft());
    windowApi.chooseImportFile.mockResolvedValue(FILE);
    const { user, router } = renderApp({
      start: openStart(),
      path: "/import",
      handlers: { import_open: open },
    });
    const main = await page();
    expect(open).not.toHaveBeenCalled();
    const zone = within(main).getByRole("group", { name: en.welcome.dropTitle });
    await user.click(within(zone).getByRole("button", { name: en.welcome.openFile }));
    expect(windowApi.chooseImportFile).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import/review");
    });
    expect(open).toHaveBeenCalledWith({ path: FILE });
  });

  it("shows why the file dialog could not be opened", async () => {
    windowApi.chooseImportFile.mockRejectedValue("The dialog plugin is not available.");
    const { user, router } = renderApp({ start: openStart(), path: "/lines" });
    await screen.findByRole("navigation", { name: en.destinations.label });
    await user.click(screen.getByRole("button", { name: en.shell.import }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import");
    });
    const alert = await within(await page()).findByRole("alert");
    expect(alert).toHaveTextContent(en.import.error.Dialog);
    expect(alert).toHaveTextContent("The dialog plugin is not available.");
  });

  it("shows why the import could not be cancelled, and stays", async () => {
    const reason = "The application state is locked by another command. Try again in a moment.";
    const { user, router } = renderApp({
      start: openStart(),
      path: at({ path: FILE, from: "/lines" }),
      handlers: {
        import_open: () => new Promise<ImportDraft>(() => undefined),
        import_cancel: () => {
          throw commandFailure("Internal", reason);
        },
      },
    });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.import.cancelError);
    expect(alert).toHaveTextContent(reason);
    expect(router.state.location.pathname).toBe("/import");
  });

  it("works without a workspace: the top bar and the page, no sidebar", async () => {
    renderApp({ start: startState(), path: "/import" });
    await page();
    expect(
      screen.queryByRole("navigation", { name: en.destinations.label }),
    ).not.toBeInTheDocument();
    await expectAccessible(document.body, { page: true });
  });
});
