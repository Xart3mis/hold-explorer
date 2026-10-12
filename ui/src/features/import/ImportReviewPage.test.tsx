import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArgsOf } from "../../api/commands";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { ImportDone } from "../../bindings/ImportDone";
import type { ImportPhase } from "../../bindings/ImportPhase";
import type { ImportReview } from "../../bindings/ImportReview";
import type { TargetCheck } from "../../bindings/TargetCheck";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import en from "../../locales/en.json";
import { must } from "../../test/app";
import { expectAccessible } from "../../test/axe";
import { opened, otherWorkspace, startState } from "../../test/fixtures";
import { choose, openFlow, pageTitled } from "../../test/flow";
import {
  done,
  exportDraft,
  freeTarget,
  review,
  reviewToConfirm,
  reviewWithFindings,
  sameDaySnapshot,
  sameFileSnapshot,
  savedMappingDraft,
  unit573,
  unmappedDraft,
} from "../../test/import";
import { commandFailure, type Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";

const text = en.import.review;
const target = / Import into$/;

type CheckArgs = ArgsOf<"import_check_target">;
type CommitArgs = ArgsOf<"import_commit">;

/** The review page on a file, with the commands a review needs answered. */
function reviewing(found: ImportReview = review(), handlers: Handlers = {}, from = "/lines") {
  const check = vi.fn<(args: CheckArgs) => TargetCheck>(() => freeTarget);
  const app = openFlow("/import/review", {
    draft: found.file_name === "open-holds.csv" ? savedMappingDraft() : exportDraft(),
    from,
    handlers: { import_review: () => found, import_check_target: check, ...handlers },
  });
  return { ...app, check };
}

async function page() {
  return pageTitled(text.title);
}

function importButton(main: HTMLElement) {
  return within(main).getByRole("button", { name: text.import });
}

/** The page once the workspace has been checked and Import can be pressed. */
async function ready() {
  const main = await page();
  await waitFor(() => {
    expect(importButton(main)).toBeEnabled();
  });
  return main;
}

function filled(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    template,
  );
}

describe("the review page while the file is read", () => {
  it("asks for the review with the proposed mapping and shows the shape of the page meanwhile", async () => {
    const asked = vi.fn(() => new Promise<ImportReview>(() => undefined));
    openFlow("/import/review", { draft: exportDraft(), handlers: { import_review: asked } });
    const main = await page();
    await waitFor(() => {
      expect(asked).toHaveBeenCalledWith({ fields: null });
    });
    const loading = must(main.querySelector('[aria-busy="true"]'), "the loading state");
    expect(loading.querySelectorAll('[data-part="skeleton"]').length).toBeGreaterThan(3);
    expect(
      within(main).getByText(filled(text.loading, { file: "Holds_2026-10-14.xlsx" })),
    ).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: text.import })).not.toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.common.cancel })).toBeInTheDocument();
  });

  it("leads back to the import page, with the reason, when no file is open", async () => {
    const { router } = openFlow("/import/review", { draft: exportDraft() });
    queryClient.removeQueries({ queryKey: keys.importDraft });
    const main = await pageTitled(en.import.title);
    expect(router.state.location.pathname).toBe("/import");
    expect(within(main).getByText(en.import.reopen.title)).toBeVisible();
  });

  it("does the same when the Rust side has no draft any more", async () => {
    const { router } = openFlow("/import/review", {
      draft: exportDraft(),
      handlers: {
        import_review: () => {
          throw commandFailure(
            "NoDraft",
            "No file is open for import. Choose a file to import, and try again.",
          );
        },
      },
    });
    const main = await pageTitled(en.import.title);
    expect(router.state.location.pathname).toBe("/import");
    expect(within(main).getByText(en.import.reopen.title)).toBeVisible();
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
  });

  it("opens the mapping page when required fields have no column", async () => {
    const { router } = openFlow("/import/review", {
      draft: unmappedDraft(),
      handlers: {
        import_review: () => {
          throw commandFailure(
            "MissingColumns",
            "Missing required columns: line_id, hold_remark, hold_type. Map them to columns of the file.",
          );
        },
      },
    });
    const main = await pageTitled(en.import.mapping.title);
    expect(router.state.location.pathname).toBe("/import/mapping");
    expect(within(main).getAllByText(en.import.mapping.missing)).toHaveLength(3);
  });

  it.each([
    [
      "Empty",
      en.import.error.Empty,
      "The file has a header row but no data rows. Export the report again or choose another file.",
    ],
    [
      "NoHolds",
      en.import.error.NoHolds,
      "No hold could be read: 12 rows were skipped, for example row 2: blank line_id. Check the column mapping and the date format.",
    ],
    [
      "SheetNotFound",
      en.import.error.SheetNotFound,
      'The sheet named "data" is not in the file. The sheets in the file are: info, Sheet1. Choose one of them.',
    ],
    [
      "Database",
      en.import.error.review,
      "The workspace file could not be read (disk I/O error). Check the drive and try again.",
    ],
  ])(
    "shows a %s error by its kind, with the fix the command gives, and ways on",
    async (kind, title, message) => {
      const { user, router } = openFlow("/import/review", {
        draft: exportDraft(),
        handlers: {
          import_review: () => {
            throw commandFailure(kind, message);
          },
        },
      });
      const main = await page();
      const alert = await within(main).findByRole("alert");
      expect(alert).toHaveTextContent(title);
      expect(alert).toHaveTextContent(message);
      expect(alert.closest("[data-kind]")).toHaveAttribute("data-kind", kind);
      expect(within(main).queryByRole("button", { name: text.import })).not.toBeInTheDocument();
      expect(
        within(main).getByRole("button", { name: en.import.chooseAnother }),
      ).toBeInTheDocument();
      expect(within(main).getByRole("button", { name: en.common.cancel })).toBeInTheDocument();
      await user.click(within(main).getByRole("button", { name: text.changeMapping }));
      expect(router.state.location.pathname).toBe("/import/mapping");
    },
  );
});

describe("what the review page shows", () => {
  it("names the step in the breadcrumb, under Import", async () => {
    reviewing();
    await page();
    const trail = screen.getByRole("navigation", { name: en.breadcrumb.label });
    expect(within(trail).getByRole("link", { name: en.import.title })).toBeInTheDocument();
    expect(within(trail).getByText(text.crumb)).toHaveAttribute("aria-current", "page");
  });

  it("shows the file, its sheet, its project number, and the counts of holds", async () => {
    reviewing();
    const main = await page();
    const facts = within(main).getByRole("list", { name: text.facts });
    expect(within(facts).getByText("Holds_2026-10-14.xlsx")).toBeVisible();
    expect(within(facts).getByText("data")).toBeVisible();
    expect(within(facts).getByText("5359-200")).toBeVisible();
    const figures = within(main).getByRole("group", { name: text.figures });
    expect(figures).toHaveTextContent(`${text.holds} 9,702`);
    expect(figures).toHaveTextContent(`${text.open} 5,010`);
    expect(figures).toHaveTextContent(`${text.released} 4,692`);
  });

  it("says so when the file gives no project number", async () => {
    reviewing(review({ project_no: null }));
    const main = await page();
    expect(within(main).getByText(text.projectNone)).toBeVisible();
  });

  it("shows the snapshot date and time in two fields, with where the date is from", async () => {
    reviewing();
    const main = await page();
    expect(within(main).getByRole("textbox", { name: text.date.date })).toHaveValue("2026-10-14");
    expect(within(main).getByRole("textbox", { name: text.date.time })).toHaveValue("08:00");
    expect(within(main).getByText(text.date.source.InfoSheet)).toBeVisible();
    expect(
      within(main).queryByRole("button", { name: text.date.useDetected }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["FileName", text.date.source.FileName],
    ["InfoSheet", text.date.source.InfoSheet],
  ] as const)("says in words that the date is from the source %s", async (source, sentence) => {
    reviewing(review({ detected: { at: "2026-10-14T08:00:00", source } }));
    const main = await page();
    expect(within(main).getByText(sentence)).toBeVisible();
  });

  it("says that nothing was skipped or assumed for a clean file", async () => {
    reviewing();
    const main = await page();
    expect(within(main).getByText(text.clean)).toBeVisible();
    expect(within(main).queryByRole("grid", { name: text.skippedTable })).not.toBeInTheDocument();
  });

  it("shows the count of skipped rows at once, and the rows one action away", SLOW, async () => {
    const { user } = reviewing(reviewWithFindings(12));
    const main = await page();
    const toggle = within(main).getByRole("button", { name: "12 rows were skipped" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(main).getByText(text.skippedHelp)).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = within(main).getByRole("grid", { name: text.skippedTable });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([text.columnRow, text.columnReason, text.columnValue]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toHaveTextContent(`418${text.skip.BlankLineId}${text.blank}`);
    expect(rows[1]).toHaveTextContent(`425${text.skip.UnreadableDate}31/02/2025`);
    // Every skipped row is listed, so nothing says that some are left out.
    expect(within(main).queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it(
    "says how many skipped rows are shown when there are more than the two hundred listed",
    SLOW,
    async () => {
      const { user } = reviewing(reviewWithFindings(312));
      const main = await page();
      await user.click(within(main).getByRole("button", { name: "312 rows were skipped" }));
      const table = within(main).getByRole("grid", { name: text.skippedTable });
      expect(within(table).getAllByRole("row")).toHaveLength(201);
      expect(
        within(main).getByText(filled(text.skippedShown, { shown: "200", "count, number": "312" })),
      ).toBeVisible();
    },
  );

  it(
    "groups the warnings by kind, each with its count and what the app did, and its examples one action away",
    SLOW,
    async () => {
      const { user } = reviewing(reviewWithFindings(12));
      const main = await page();
      const kinds = text.warning;
      const dates = within(main).getByRole("button", {
        name: `${kinds.UnreadableReleaseDate.title} 37 times`,
      });
      expect(within(main).getByText(kinds.UnreadableReleaseDate.text)).toBeVisible();
      expect(
        within(main).getByRole("button", { name: `${kinds.UnrecognizedReleased.title} 2 times` }),
      ).toBeVisible();
      expect(
        within(main).getByRole("button", { name: `${kinds.AssumedDateOrder.title} 1 time` }),
      ).toBeVisible();
      expect(within(main).getByText(kinds.ErrorCells.text)).toBeVisible();

      expect(dates).toHaveAttribute("aria-expanded", "false");
      await user.click(dates);
      const examples = within(main).getByRole("list", {
        name: filled(text.examplesOf, { kind: kinds.UnreadableReleaseDate.title }),
      });
      const items = within(examples).getAllByRole("listitem");
      expect(items).toHaveLength(5);
      expect(items[0]).toHaveTextContent(
        'Row 612: the release date "soon" could not be read as a date',
      );
      expect(
        within(main).getByText(filled(text.examplesShown, { shown: "5", "count, number": "37" })),
      ).toBeVisible();
    },
  );

  it("names a limited file as such, with what that means", async () => {
    reviewing(reviewToConfirm());
    const main = await page();
    expect(within(main).getByText(text.limitedTitle)).toBeVisible();
    expect(within(main).getByText(text.limitedBoth)).toBeVisible();
  });

  it("does not call a full file limited", async () => {
    reviewing();
    const main = await page();
    expect(within(main).queryByText(text.limitedTitle)).not.toBeInTheDocument();
  });

  it("shows the mapping in use one action away, and leads to the mapping page", SLOW, async () => {
    const { user, router } = reviewing();
    const main = await page();
    await user.click(within(main).getByRole("button", { name: text.columnsShow }));
    const list = within(main).getByRole("list", { name: text.columnsList });
    expect(within(list).getAllByRole("listitem")).toHaveLength(14);
    expect(list).toHaveTextContent(`${en.import.field.LineId}line_id`);
    await user.click(within(main).getByRole("button", { name: text.changeMapping }));
    expect(router.state.location.pathname).toBe("/import/mapping");
    expect(router.state.location.state).toMatchObject({ from: "/lines" });
  });

  it("names the sheet that was read and leads to the choice of another", async () => {
    const { user, router } = reviewing();
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.import.chooseSheet }));
    expect(router.state.location.pathname).toBe("/import/sheet");
  });

  it("has no accessibility violation, clean and with everything expanded", SLOW, async () => {
    const { user } = reviewing(reviewWithFindings(12));
    const main = await ready();
    await expectAccessible(document.body, { page: true });
    for (const toggle of within(main)
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-expanded") === "false")) {
      if (!toggle.hasAttribute("aria-haspopup")) await user.click(toggle);
    }
    await expectAccessible(document.body, { page: true });
  });
});

describe("the snapshot date on the review page", () => {
  it.each([
    ["1999-12-31", "a year before 2000"],
    ["2101-01-01", "a year after 2100"],
  ])("refuses %s, %s, with what to enter, and blocks Import", SLOW, async (typed) => {
    const { user, check } = reviewing();
    const main = await ready();
    check.mockClear();
    const date = within(main).getByRole("textbox", { name: text.date.date });
    await user.clear(date);
    await user.type(date, typed);
    await user.tab();
    expect(within(main).getByText(text.date.dateRange)).toBeVisible();
    expect(date).toBeInvalid();
    expect(importButton(main)).toBeDisabled();
    expect(within(main).getByText(text.blocked.date)).toBeVisible();
    // A date that is refused is not sent anywhere.
    expect(check).not.toHaveBeenCalled();
  });

  it("refuses text that is not a date or not a time, with what to enter", SLOW, async () => {
    const { user } = reviewing();
    const main = await ready();
    const date = within(main).getByRole("textbox", { name: text.date.date });
    const time = within(main).getByRole("textbox", { name: text.date.time });
    await user.clear(date);
    await user.type(date, "14/10/2026");
    await user.clear(time);
    await user.type(time, "8 am");
    await user.tab();
    expect(within(main).getByText(text.date.dateInvalid)).toBeVisible();
    expect(within(main).getByText(text.date.timeInvalid)).toBeVisible();
    expect(importButton(main)).toBeDisabled();
  });

  it(
    "says that the date was entered by the user once it differs, checks the workspace again, and offers the detected date back",
    SLOW,
    async () => {
      const { user, check } = reviewing();
      const main = await ready();
      expect(check).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenLastCalledWith({
        target: { kind: "Existing", id: unit573.id },
        takenAt: "2026-10-14T08:00:00",
      });

      const date = within(main).getByRole("textbox", { name: text.date.date });
      await user.clear(date);
      await user.type(date, "2026-10-15");
      // Typing checks nothing: the check waits until the field is left.
      expect(check).toHaveBeenCalledTimes(1);
      await user.tab();
      await waitFor(() => {
        expect(check).toHaveBeenCalledTimes(2);
      });
      expect(check).toHaveBeenLastCalledWith({
        target: { kind: "Existing", id: unit573.id },
        takenAt: "2026-10-15T08:00:00",
      });
      expect(within(main).getByText(text.date.source.User)).toBeVisible();
      expect(
        within(main).getByText(
          filled(text.date.detected.InfoSheet, { date: "14 Oct 2026, 08:00" }),
        ),
      ).toBeVisible();

      await user.click(within(main).getByRole("button", { name: text.date.useDetected }));
      expect(date).toHaveValue("2026-10-14");
      expect(within(main).getByText(text.date.source.InfoSheet)).toBeVisible();
      expect(within(main).queryByText(text.date.source.User)).not.toBeInTheDocument();
    },
  );

  it(
    "explains a date that is only the file's modified time and blocks Import until it is confirmed",
    SLOW,
    async () => {
      const { user } = reviewing(reviewToConfirm());
      const main = await page();
      expect(within(main).getByText(text.date.weakTitle)).toBeVisible();
      expect(within(main).getByText(text.date.weakText)).toBeVisible();
      expect(within(main).getByText(text.date.source.FileTime)).toBeVisible();
      expect(within(main).getByRole("textbox", { name: text.date.time })).toHaveValue("16:41:09");
      await within(main).findByText(/does not have this file yet/);
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.confirm)).toBeVisible();

      await user.click(within(main).getByRole("checkbox", { name: text.date.confirm }));
      expect(importButton(main)).toBeEnabled();
      expect(within(main).queryByText(text.blocked.confirm)).not.toBeInTheDocument();
    },
  );

  it(
    "takes a date the user enters in place of the confirmation, and sends it as edited",
    SLOW,
    async () => {
      const commit = vi.fn<(args: CommitArgs) => ImportDone>(() => done());
      const { user } = reviewing(reviewToConfirm(), { import_commit: commit });
      const main = await page();
      const date = within(main).getByRole("textbox", { name: text.date.date });
      await user.clear(date);
      await user.type(date, "2026-10-09{Enter}");
      expect(within(main).getByText(text.date.source.User)).toBeVisible();
      expect(
        within(main).queryByRole("checkbox", { name: text.date.confirm }),
      ).not.toBeInTheDocument();
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      await user.click(importButton(main));
      await waitFor(() => {
        expect(commit).toHaveBeenCalledTimes(1);
      });
      expect(commit.mock.calls[0]?.[0].request).toEqual({
        target: { kind: "Existing", id: unit573.id },
        taken_at: "2026-10-09T16:41:09",
        date_edited: true,
        replace: null,
      });
    },
  );

  it("asks for the date and the time when the file gives none", async () => {
    reviewing(review({ detected: null, date_needs_confirmation: true }));
    const main = await page();
    expect(within(main).getByText(text.date.noneTitle)).toBeVisible();
    expect(within(main).getByRole("textbox", { name: text.date.date })).toHaveValue("");
    expect(importButton(main)).toBeDisabled();
    expect(within(main).getByText(text.blocked.date)).toBeVisible();
    expect(
      within(main).queryByRole("checkbox", { name: text.date.confirm }),
    ).not.toBeInTheDocument();
  });
});

describe("the target on the review page", () => {
  it(
    "preselects the suggested workspace and marks the ones that have the project number",
    SLOW,
    async () => {
      const { user } = reviewing();
      const main = await ready();
      expect(within(main).getByRole("button", { name: target })).toHaveTextContent(unit573.name);
      await user.click(within(main).getByRole("button", { name: target }));
      const list = await screen.findByRole("listbox");
      expect(
        within(list)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual([
        otherWorkspace.name,
        `${unit573.name}${filled(text.target.optionOpenMatch, { project: "5359-200" })}`,
        text.target.new,
      ]);
    },
  );

  it("checks the workspace again when another one is chosen", SLOW, async () => {
    const { user, check } = reviewing();
    await ready();
    expect(check).toHaveBeenCalledTimes(1);
    await choose(user, target, new RegExp(`^${otherWorkspace.name}`));
    await waitFor(() => {
      expect(check).toHaveBeenCalledTimes(2);
    });
    expect(check).toHaveBeenLastCalledWith({
      target: { kind: "Existing", id: otherWorkspace.id },
      takenAt: "2026-10-14T08:00:00",
    });
  });

  it(
    "says that importing adds the project number to a workspace that does not have it",
    SLOW,
    async () => {
      const { user } = reviewing();
      const main = await ready();
      await choose(user, target, new RegExp(`^${otherWorkspace.name}`));
      expect(
        within(main).getByText(
          filled(text.target.addsProject, { workspace: otherWorkspace.name, project: "5359-200" }),
        ),
      ).toBeVisible();
    },
  );

  it(
    "leaves the choice to the user when no workspace is suggested, and blocks Import until it is made",
    SLOW,
    async () => {
      const { user, check } = reviewing(
        review({ target: { suggested: null, matching: [], all: [otherWorkspace, unit573] } }),
      );
      const main = await page();
      expect(within(main).getByRole("button", { name: target })).toHaveTextContent(
        text.target.placeholder,
      );
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.target)).toBeVisible();
      expect(check).not.toHaveBeenCalled();
      await choose(user, target, new RegExp(`^${unit573.name}`));
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
    },
  );

  it(
    "offers a new workspace named after the project number, and imports into it",
    SLOW,
    async () => {
      const commit = vi.fn<(args: CommitArgs) => ImportDone>(() =>
        done({ ...unit573, id: "d4e5f60718293041", name: "5359-200", snapshot_count: 0 }),
      );
      const { user, check } = reviewing(
        review({ target: { suggested: null, matching: [], all: [] } }),
        { import_commit: commit },
        "/welcome",
      );
      const main = await page();
      // With no workspace to choose, the new one is the choice.
      expect(within(main).getByRole("button", { name: target })).toHaveTextContent(text.target.new);
      const name = within(main).getByRole("textbox", { name: text.target.newName });
      expect(name).toHaveValue("5359-200");
      expect(within(main).getByText(text.target.newHelp)).toBeVisible();
      expect(importButton(main)).toBeEnabled();

      await user.clear(name);
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.name)).toBeVisible();
      await user.type(name, "  Unit 600  ");
      await user.click(importButton(main));
      await waitFor(() => {
        expect(commit).toHaveBeenCalledTimes(1);
      });
      expect(commit.mock.calls[0]?.[0].request).toEqual({
        target: { kind: "New", name: "Unit 600" },
        taken_at: "2026-10-14T08:00:00",
        date_edited: false,
        replace: null,
      });
      // A workspace that does not exist yet has nothing to check.
      expect(check).not.toHaveBeenCalled();
    },
  );

  it(
    "names the snapshot that already holds the file, blocks Import, and offers to open that workspace",
    SLOW,
    async () => {
      const cancel = vi.fn(() => null);
      const { user, router } = reviewing(review(), {
        import_check_target: () => ({
          already_imported: sameFileSnapshot,
          same_day: [sameFileSnapshot],
        }),
        import_cancel: cancel,
      });
      const main = await page();
      const notice = (
        await within(main).findByText(filled(text.target.alreadyTitle, { workspace: unit573.name }))
      ).closest('[role="status"]');
      expect(notice).toHaveTextContent(
        filled(text.target.alreadyText, {
          date: "14 Oct 2026, 08:00",
          file: "Holds_2026-10-14.xlsx",
        }),
      );
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.already)).toBeVisible();
      // The same file is the whole story: the choice between keeping and replacing is not offered.
      expect(
        within(main).queryByRole("button", { name: new RegExp(` ${text.target.sameDayLabel}$`) }),
      ).not.toBeInTheDocument();

      // The workspace is the open one, so there is nothing to open: the way out leads to it.
      await user.click(within(main).getByRole("button", { name: text.target.toOverview }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
    },
  );

  it(
    "opens another workspace that already holds the file, and says why when it cannot be opened",
    SLOW,
    async () => {
      const message =
        "The workspace file could not be opened (it is locked by another program). Close the other program, then try again.";
      const open = vi
        .fn<(args: { id: string }) => WorkspaceOpen>()
        .mockImplementationOnce(() => {
          throw commandFailure("Io", message);
        })
        .mockImplementation(() => opened({ workspace: otherWorkspace }));
      const { user, router } = reviewing(review(), {
        import_check_target: ({ target: asked }) =>
          asked.kind === "Existing" && asked.id === otherWorkspace.id
            ? { already_imported: sameFileSnapshot, same_day: [sameFileSnapshot] }
            : freeTarget,
        workspace_open: open,
      });
      const main = await ready();
      await choose(user, target, new RegExp(`^${otherWorkspace.name}`));
      const offer = await within(main).findByRole("button", {
        name: filled(text.target.openIt, { workspace: otherWorkspace.name }),
      });
      await user.click(offer);
      const alert = await within(main).findByRole("alert");
      expect(alert).toHaveTextContent(en.workspaces.openError);
      expect(alert).toHaveTextContent(message);
      expect(router.state.location.pathname).toBe("/import/review");

      await user.click(offer);
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
      expect(open).toHaveBeenLastCalledWith({ id: otherWorkspace.id });
      expect(
        await screen.findByRole("button", {
          name: `${en.workspaces.switcher} ${otherWorkspace.name}`,
        }),
      ).toBeInTheDocument();
      expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
    },
  );

  it(
    "lists the snapshots of the same day, keeps both unless the user chooses to replace one, and sends its id",
    SLOW,
    async () => {
      const commit = vi.fn<(args: CommitArgs) => ImportDone>(() => done());
      const { user } = reviewing(review(), {
        import_check_target: () => ({ already_imported: null, same_day: [sameDaySnapshot] }),
        import_commit: commit,
      });
      const main = await ready();
      expect(
        within(main).getByText(
          filled(text.target.sameDay_one, {
            workspace: unit573.name,
            "count, number": "1",
            date: "14 Oct 2026",
          }),
        ),
      ).toBeVisible();
      expect(
        within(main).getByText(
          filled(text.target.sameDayItem, {
            time: "06:30",
            file: "Holds_2026-10-14_early.xlsx",
            holds: "9,688 holds",
          }),
        ),
      ).toBeVisible();
      const choice = new RegExp(` ${text.target.sameDayLabel}$`);
      expect(within(main).getByRole("button", { name: choice })).toHaveTextContent(
        text.target.keepBoth,
      );
      expect(within(main).queryByText(/cannot bring it back/)).not.toBeInTheDocument();

      const replace = filled(text.target.replace, { time: "06:30" });
      await user.click(within(main).getByRole("button", { name: choice }));
      const options = await screen.findByRole("listbox");
      const option = within(options).getByRole("option", { name: new RegExp(`^${replace}`) });
      // The option also names the file of the snapshot, to tell two of the same minute apart.
      expect(option).toHaveTextContent("Holds_2026-10-14_early.xlsx");
      await user.click(option);
      // The choice itself says that it cannot be undone, and the page says what is removed.
      expect(replace).toContain("cannot be undone");
      expect(
        within(main).getByText(
          filled(text.target.replaceText, {
            date: "14 Oct 2026, 06:30",
            workspace: unit573.name,
            holds: "9,688 holds",
            file: "Holds_2026-10-14_early.xlsx",
          }),
        ),
      ).toBeVisible();

      await user.click(importButton(main));
      await waitFor(() => {
        expect(commit).toHaveBeenCalledTimes(1);
      });
      expect(commit.mock.calls[0]?.[0].request).toEqual({
        target: { kind: "Existing", id: unit573.id },
        taken_at: "2026-10-14T08:00:00",
        date_edited: false,
        replace: sameDaySnapshot.id,
      });
    },
  );

  it(
    "shows why the workspace could not be checked, blocks Import, and checks again on Try again",
    SLOW,
    async () => {
      const message =
        "The workspace file could not be opened (it is locked by another program). Close the other program, then try again.";
      const check = vi
        .fn<(args: CheckArgs) => TargetCheck>()
        .mockImplementationOnce(() => {
          throw commandFailure("Io", message);
        })
        .mockImplementation(() => freeTarget);
      const { user } = reviewing(review(), { import_check_target: check });
      const main = await page();
      const alert = await within(main).findByRole("alert");
      expect(alert).toHaveTextContent(en.import.error.check);
      expect(alert).toHaveTextContent(message);
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.check)).toBeVisible();
      await user.click(within(alert).getByRole("button", { name: en.common.retry }));
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      expect(within(main).queryByRole("alert")).not.toBeInTheDocument();
    },
  );
});

describe("importing from the review page", () => {
  /** A commit the test lets through phase by phase. */
  function heldCommit() {
    let say: (phase: ImportPhase) => void = () => undefined;
    let finish: (result: ImportDone) => void = () => undefined;
    let fail: (reason: unknown) => void = () => undefined;
    const handler = vi.fn(
      (args: CommitArgs) =>
        new Promise<ImportDone>((resolve, reject) => {
          say = (phase) => {
            args.onProgress.onmessage(phase);
          };
          finish = resolve;
          fail = reject;
        }),
    );
    return {
      handler,
      say: (phase: ImportPhase) => {
        act(() => {
          say(phase);
        });
      },
      finish: (result: ImportDone) => {
        finish(result);
      },
      fail: (reason: unknown) => {
        fail(reason);
      },
    };
  }

  it(
    "sends the request, shows each phase as progress, and lands on Overview with a toast",
    SLOW,
    async () => {
      const commit = heldCommit();
      const { user, router } = reviewing(review(), { import_commit: commit.handler });
      const main = await ready();
      await user.click(importButton(main));
      await waitFor(() => {
        expect(commit.handler).toHaveBeenCalledTimes(1);
      });
      expect(commit.handler.mock.calls[0]?.[0].request).toEqual({
        target: { kind: "Existing", id: unit573.id },
        taken_at: "2026-10-14T08:00:00",
        date_edited: false,
        replace: null,
      });

      // While the import runs the form cannot be changed, and there is nothing to cancel with.
      expect(within(main).getByRole("progressbar", { name: text.phase.waiting })).toBeVisible();
      expect(within(main).getByRole("textbox", { name: text.date.date })).toBeDisabled();
      expect(within(main).getByRole("button", { name: target })).toBeDisabled();
      expect(within(main).queryByRole("button", { name: text.import })).not.toBeInTheDocument();
      expect(within(main).getByText(text.running)).toBeVisible();

      commit.say("Checking");
      expect(
        within(main).getByRole("progressbar", {
          name: filled(text.phase.Checking, { workspace: unit573.name }),
        }),
      ).toBeVisible();
      expect(
        within(main).queryByRole("button", { name: en.common.cancel }),
      ).not.toBeInTheDocument();
      commit.say("Storing");
      expect(
        within(main).getByRole("progressbar", {
          name: filled(text.phase.Storing, { workspace: unit573.name }),
        }),
      ).toBeVisible();
      expect(
        within(main).queryByRole("button", { name: en.common.cancel }),
      ).not.toBeInTheDocument();
      commit.say("Done");

      commit.finish(done());
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
      const toasts = screen.getByRole("region", { name: en.toast.region });
      expect(
        await within(toasts).findByText(
          filled(text.done, { workspace: unit573.name, holds: "9,702 holds", open: "5,010" }),
        ),
      ).toBeVisible();
      // The shell shows the new snapshot at once, and nothing is left of the import.
      expect(
        screen.getByRole("button", {
          name: en.snapshots.trigger.replace("{{date}}", "14 Oct 2026"),
        }),
      ).toBeInTheDocument();
      expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
      expect(queryClient.getQueryData(keys.importReview)).toBeUndefined();
    },
  );

  it("says in the toast which snapshot was replaced", SLOW, async () => {
    const { user } = reviewing(review(), {
      import_check_target: () => ({ already_imported: null, same_day: [sameDaySnapshot] }),
      import_commit: () => done(),
    });
    const main = await ready();
    await choose(
      user,
      new RegExp(` ${text.target.sameDayLabel}$`),
      new RegExp(`^${filled(text.target.replace, { time: "06:30" })}`),
    );
    await user.click(importButton(main));
    const toasts = screen.getByRole("region", { name: en.toast.region });
    expect(
      await within(toasts).findByText(
        filled(text.doneReplaced, {
          workspace: unit573.name,
          holds: "9,702 holds",
          open: "5,010",
          replaced: "14 Oct 2026, 06:30",
        }),
      ),
    ).toBeVisible();
    // Nothing can bring the replaced snapshot back, so no Undo is offered.
    expect(within(toasts).queryByRole("button", { name: en.common.undo })).not.toBeInTheDocument();
  });

  it(
    "opens the workspace the file went into and shows that it could not be remembered",
    SLOW,
    async () => {
      const warning = {
        kind: "Settings",
        message:
          "The workspace is open, but Hold Explorer could not remember it for the next start. The settings file could not be written (permission denied).",
      };
      const into = done(otherWorkspace);
      const { user, router } = reviewing(review(), {
        import_commit: () => ({ ...into, open: { ...into.open, warning } }),
      });
      const main = await ready();
      await choose(user, target, new RegExp(`^${otherWorkspace.name}`));
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      await user.click(importButton(main));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
      expect(
        await screen.findByRole("button", {
          name: `${en.workspaces.switcher} ${otherWorkspace.name}`,
        }),
      ).toBeInTheDocument();
      const said = await screen.findByText(warning.message);
      expect(said.closest('[role="status"]')).toHaveTextContent(en.workspaces.warningTitle);
    },
  );

  it.each([
    [
      "AlreadyImported",
      en.import.error.AlreadyImported,
      'This file is already imported as the snapshot of 2026-10-14 08:00 ("Holds_2026-10-14.xlsx"). Choose another file, or delete that snapshot first.',
    ],
    [
      "SnapshotDateOutOfRange",
      en.import.error.SnapshotDateOutOfRange,
      "The snapshot date 2101-01-01 08:00:00 is outside the years 2000 to 2100. Dates outside that range are almost always a typing mistake. Enter a date between the years 2000 and 2100, for example 2026-10-07.",
    ],
    [
      "SnapshotNotFound",
      en.import.error.SnapshotNotFound,
      "Snapshot 7 is not in this workspace. It may have been deleted; check the workspace again.",
    ],
    [
      "WorkspaceNotFound",
      en.import.error.WorkspaceNotFound,
      "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.",
    ],
    [
      "Io",
      en.import.error.commit,
      "The workspace file could not be written (the disk is full). Free some space, then import again.",
    ],
  ])(
    "shows a failed import by its kind %s, with its fix, and keeps the choices",
    SLOW,
    async (kind, title, message) => {
      const commit = vi
        .fn<(args: CommitArgs) => ImportDone>()
        .mockImplementationOnce(() => {
          throw commandFailure(kind, message);
        })
        .mockImplementation(() => done(otherWorkspace));
      const { user, router } = reviewing(review(), { import_commit: commit });
      const main = await ready();
      await choose(user, target, new RegExp(`^${otherWorkspace.name}`));
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      await user.click(importButton(main));
      const alert = await within(main).findByRole("alert");
      expect(alert).toHaveTextContent(title);
      expect(alert).toHaveTextContent(message);
      expect(alert.closest("[data-kind]")).toHaveAttribute("data-kind", kind);
      expect(router.state.location.pathname).toBe("/import/review");
      // The page can be changed again, and what was chosen is still chosen.
      expect(within(main).queryByRole("progressbar")).not.toBeInTheDocument();
      expect(within(main).getByRole("button", { name: target })).toHaveTextContent(
        otherWorkspace.name,
      );
      expect(within(main).getByRole("textbox", { name: text.date.date })).toBeEnabled();
      expect(within(main).getByRole("button", { name: en.common.cancel })).toBeInTheDocument();

      await user.click(importButton(main));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
    },
  );

  it("drops the draft on Cancel and returns to where the import was started", async () => {
    const cancel = vi.fn(() => null);
    const { user, router } = reviewing(review(), { import_cancel: cancel }, "/history");
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/history");
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
    expect(queryClient.getQueryData(keys.importReview)).toBeUndefined();
  });

  it("shows why the import could not be cancelled, and stays", async () => {
    const reason = "The application state is locked by another command. Try again in a moment.";
    const { user, router } = reviewing(review(), {
      import_cancel: () => {
        throw commandFailure("Internal", reason);
      },
    });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.import.cancelError);
    expect(alert).toHaveTextContent(reason);
    expect(router.state.location.pathname).toBe("/import/review");
  });

  it("works without a workspace open: the file goes into a new one", SLOW, async () => {
    const created = done({
      ...unit573,
      id: "d4e5f60718293041",
      name: "5359-200",
      snapshot_count: 0,
    });
    const list = { ...startState().list, workspaces: [created.open.workspace] };
    const { user, router } = openFlow("/import/review", {
      draft: exportDraft(),
      from: "/welcome",
      start: startState(),
      handlers: {
        import_review: () => review({ target: { suggested: null, matching: [], all: [] } }),
        import_commit: () => created,
        workspace_list: () => list,
      },
    });
    const main = await ready();
    await user.click(importButton(main));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    expect(
      await screen.findByRole("button", { name: `${en.workspaces.switcher} 5359-200` }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("navigation", { name: en.destinations.label })).toBeVisible();
  });
});
