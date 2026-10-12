import { notifyManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArgsOf } from "../../api/commands";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { ImportDone } from "../../bindings/ImportDone";
import type { TargetCheck } from "../../bindings/TargetCheck";
import en from "../../locales/en.json";
import { otherWorkspace } from "../../test/fixtures";
import { choose } from "../../test/flow";
import {
  done,
  freeTarget,
  review,
  reviewToConfirm,
  sameDaySnapshot,
  unit573,
} from "../../test/import";
import { commandFailure } from "../../test/ipc";
import {
  filled,
  heldCommit,
  importButton,
  ready,
  REVIEW_TARGET,
  reviewing,
  reviewPage,
  sent,
} from "../../test/review";
import { SLOW } from "../../test/slow";

const text = en.import.review;
const sameDayChoice = new RegExp(` ${text.target.sameDayLabel}$`);
const replaceOption = new RegExp(`^${filled(text.target.replace, { time: "06:30" })}`);

type CheckArgs = ArgsOf<"import_check_target">;
type CommitArgs = ArgsOf<"import_commit">;
type User = ReturnType<typeof reviewing>["user"];

function committing() {
  return vi.fn<(args: CommitArgs) => ImportDone>(() => done());
}

/** Types into a field of the date and leaves it, which is when the page takes the value. */
async function enter(user: User, main: HTMLElement, label: string, value: string) {
  const field = within(main).getByRole("textbox", { name: label });
  await user.clear(field);
  if (value !== "") await user.type(field, value);
  await user.tab();
}

async function press(user: User, main: HTMLElement, commit: ReturnType<typeof committing>) {
  await waitFor(() => {
    expect(importButton(main)).toBeEnabled();
  });
  await user.click(importButton(main));
  await waitFor(() => {
    expect(commit).toHaveBeenCalledTimes(1);
  });
  return sent(commit);
}

describe("what Import sends for the snapshot date", () => {
  it(
    "sends the detected date unchanged, as not edited, after Use the detected date",
    SLOW,
    async () => {
      const commit = committing();
      const { user } = reviewing(review(), { import_commit: commit });
      const main = await ready();
      await enter(user, main, text.date.date, "2026-10-15");
      await enter(user, main, text.date.time, "09:45");
      expect(within(main).getByText(text.date.source.User)).toBeVisible();
      await user.click(within(main).getByRole("button", { name: text.date.useDetected }));
      expect(await press(user, main, commit)).toMatchObject({
        taken_at: "2026-10-14T08:00:00",
        date_edited: false,
      });
    },
  );

  it.each([
    ["as the fields show it", "2026-10-14", "08:00"],
    ["with other separators and a short hour", "2026/10/14", "8.00"],
    ["with its seconds", "2026-10-14", "08:00:00"],
  ])(
    "sends the same when the detected date is typed again by hand, %s",
    SLOW,
    async (_how, day, time) => {
      const commit = committing();
      const { user } = reviewing(review(), { import_commit: commit });
      const main = await ready();
      await enter(user, main, text.date.date, "2026-10-15");
      await enter(user, main, text.date.date, day);
      await enter(user, main, text.date.time, time);
      expect(within(main).getByText(text.date.source.InfoSheet)).toBeVisible();
      expect(await press(user, main, commit)).toMatchObject({
        taken_at: "2026-10-14T08:00:00",
        date_edited: false,
      });
    },
  );

  it("sends a confirmed file time as detected, with its seconds, as not edited", SLOW, async () => {
    const commit = committing();
    const { user } = reviewing(reviewToConfirm(), { import_commit: commit });
    const main = await reviewPage();
    await user.click(await within(main).findByRole("checkbox", { name: text.date.confirm }));
    expect(await press(user, main, commit)).toMatchObject({
      taken_at: "2026-10-12T16:41:09",
      date_edited: false,
    });
  });

  it(
    "sends a detected time with a fraction of a second exactly as the review gave it",
    SLOW,
    async () => {
      const commit = committing();
      const found = reviewToConfirm();
      const { user } = reviewing(
        { ...found, detected: { at: "2026-10-12T16:41:09.250", source: "FileTime" } },
        { import_commit: commit },
      );
      const main = await reviewPage();
      // The field shows the time to the second; what is sent is the detected value, untouched.
      expect(within(main).getByRole("textbox", { name: text.date.time })).toHaveValue("16:41:09");
      await user.click(await within(main).findByRole("checkbox", { name: text.date.confirm }));
      expect(await press(user, main, commit)).toMatchObject({
        taken_at: "2026-10-12T16:41:09.250",
        date_edited: false,
      });
    },
  );

  it("sends a date typed when none was detected as edited", SLOW, async () => {
    const commit = committing();
    const { user } = reviewing(review({ detected: null, date_needs_confirmation: true }), {
      import_commit: commit,
    });
    const main = await reviewPage();
    await enter(user, main, text.date.date, "2026-10-09");
    await enter(user, main, text.date.time, "07:30");
    expect(await press(user, main, commit)).toMatchObject({
      taken_at: "2026-10-09T07:30:00",
      date_edited: true,
    });
  });
});

describe("a choice to replace a snapshot", () => {
  /** Unit 573 piping has a snapshot of 14 October, and of no other day; Tank farm has none. */
  function sameDayOnTheFourteenth() {
    return vi.fn<(args: CheckArgs) => TargetCheck>(({ target, takenAt }) =>
      target.kind === "Existing" && target.id === unit573.id && takenAt.startsWith("2026-10-14")
        ? { already_imported: null, same_day: [sameDaySnapshot] }
        : freeTarget,
    );
  }

  async function chooseReplace(user: User, main: HTMLElement) {
    await choose(user, sameDayChoice, replaceOption);
    expect(within(main).getByRole("button", { name: sameDayChoice })).toHaveTextContent(
      filled(text.target.replace, { time: "06:30" }),
    );
  }

  it("does not come back when the date leaves the day and returns to it", SLOW, async () => {
    const commit = committing();
    const { user } = reviewing(review(), {
      import_check_target: sameDayOnTheFourteenth(),
      import_commit: commit,
    });
    const main = await ready();
    await chooseReplace(user, main);

    await enter(user, main, text.date.date, "2026-10-15");
    await within(main).findByText(/it has no snapshot of 15 Oct 2026/);
    expect(within(main).queryByRole("button", { name: sameDayChoice })).not.toBeInTheDocument();

    await enter(user, main, text.date.date, "2026-10-14");
    const again = await within(main).findByRole("button", { name: sameDayChoice });
    expect(again).toHaveTextContent(text.target.keepBoth);
    expect(within(main).queryByText(/cannot bring it back/)).not.toBeInTheDocument();
    expect(await press(user, main, commit)).toMatchObject({ replace: null });
  });

  it("is dropped when only the time changes: the day is checked again", SLOW, async () => {
    const commit = committing();
    const { user } = reviewing(review(), {
      import_check_target: sameDayOnTheFourteenth(),
      import_commit: commit,
    });
    const main = await ready();
    await chooseReplace(user, main);
    await enter(user, main, text.date.time, "09:30");
    await waitFor(() => {
      expect(importButton(main)).toBeEnabled();
    });
    expect(within(main).getByRole("button", { name: sameDayChoice })).toHaveTextContent(
      text.target.keepBoth,
    );
    expect(await press(user, main, commit)).toMatchObject({
      taken_at: "2026-10-14T09:30:00",
      replace: null,
    });
  });

  it(
    "does not come back when another workspace is chosen and the first one again",
    SLOW,
    async () => {
      const commit = committing();
      const { user } = reviewing(review(), {
        import_check_target: sameDayOnTheFourteenth(),
        import_commit: commit,
      });
      const main = await ready();
      await chooseReplace(user, main);
      await choose(user, REVIEW_TARGET, new RegExp(`^${otherWorkspace.name}`));
      await within(main).findByText(/Tank farm does not have this file yet/);
      await choose(user, REVIEW_TARGET, new RegExp(`^${unit573.name}`));
      const again = await within(main).findByRole("button", { name: sameDayChoice });
      expect(again).toHaveTextContent(text.target.keepBoth);
      expect(await press(user, main, commit)).toMatchObject({ replace: null });
    },
  );

  it("is kept while nothing about the date or the target changes", SLOW, async () => {
    const commit = committing();
    const { user } = reviewing(review(), {
      import_check_target: sameDayOnTheFourteenth(),
      import_commit: commit,
    });
    const main = await ready();
    await chooseReplace(user, main);
    // The date is typed again as it was: nothing changed, so nothing is dropped.
    await enter(user, main, text.date.date, "2026-10-14");
    expect(await press(user, main, commit)).toMatchObject({ replace: sameDaySnapshot.id });
  });
});

describe("Import while the workspace is being checked", () => {
  it(
    "is disabled after a change of date until the check has answered, and sends nothing",
    SLOW,
    async () => {
      let answer: (check: TargetCheck) => void = () => undefined;
      const check = vi
        .fn<(args: CheckArgs) => TargetCheck | Promise<TargetCheck>>()
        .mockImplementationOnce(() => freeTarget)
        .mockImplementation(
          () =>
            new Promise<TargetCheck>((resolve) => {
              answer = resolve;
            }),
        );
      const commit = committing();
      const { user } = reviewing(review(), { import_check_target: check, import_commit: commit });
      const main = await ready();
      await enter(user, main, text.date.date, "2026-10-15");
      await waitFor(() => {
        expect(check).toHaveBeenCalledTimes(2);
      });
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.checking)).toBeVisible();
      await user.click(importButton(main));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(commit).not.toHaveBeenCalled();

      answer(freeTarget);
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      expect(within(main).queryByText(text.blocked.checking)).not.toBeInTheDocument();
    },
  );

  it(
    "is disabled while the workspace is checked again after a failed import, though an answer is held",
    SLOW,
    async () => {
      let answer: (check: TargetCheck) => void = () => undefined;
      const check = vi
        .fn<(args: CheckArgs) => TargetCheck | Promise<TargetCheck>>()
        .mockImplementationOnce(() => freeTarget)
        .mockImplementation(
          () =>
            new Promise<TargetCheck>((resolve) => {
              answer = resolve;
            }),
        );
      const commit = vi.fn<(args: CommitArgs) => ImportDone>(() => {
        throw commandFailure(
          "AlreadyImported",
          "This file is already imported into this workspace. Choose another workspace.",
        );
      });
      const { user } = reviewing(review(), { import_check_target: check, import_commit: commit });
      const main = await ready();
      await user.click(importButton(main));
      await within(main).findByRole("alert");
      // The same workspace and the same date are asked about again, and the first answer is held.
      await waitFor(() => {
        expect(check).toHaveBeenCalledTimes(2);
      });
      expect(check.mock.calls[1]).toEqual(check.mock.calls[0]);
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.checking)).toBeVisible();
      await user.click(importButton(main));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(commit).toHaveBeenCalledTimes(1);

      // The new answer is the one that counts: the file is there now.
      answer({ already_imported: sameDaySnapshot, same_day: [sameDaySnapshot] });
      expect(
        await within(main).findByText(
          filled(text.target.alreadyTitle, { workspace: unit573.name }),
        ),
      ).toBeVisible();
      expect(importButton(main)).toBeDisabled();
      expect(within(main).getByText(text.blocked.already)).toBeVisible();
    },
  );

  it("is disabled while a failed check is tried again", SLOW, async () => {
    let answer: (check: TargetCheck) => void = () => undefined;
    const check = vi
      .fn<(args: CheckArgs) => TargetCheck | Promise<TargetCheck>>()
      .mockImplementationOnce(() => {
        throw commandFailure("Io", "The workspace file could not be opened. Try again.");
      })
      .mockImplementation(
        () =>
          new Promise<TargetCheck>((resolve) => {
            answer = resolve;
          }),
      );
    const { user } = reviewing(review(), { import_check_target: check });
    const main = await reviewPage();
    const alert = await within(main).findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: en.common.retry }));
    await waitFor(() => {
      expect(check).toHaveBeenCalledTimes(2);
    });
    expect(importButton(main)).toBeDisabled();
    expect(within(main).getByText(text.blocked.checking)).toBeVisible();
    answer(freeTarget);
    await waitFor(() => {
      expect(importButton(main)).toBeEnabled();
    });
  });
});

describe("after a successful import", () => {
  const toast = filled(text.done, {
    workspace: unit573.name,
    holds: "9,702 holds",
    open: "5,010",
  });
  let stop: (() => void) | null = null;

  afterEach(() => {
    stop?.();
    stop = null;
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  });

  it("the app is on Overview with the toast", SLOW, async () => {
    const { user, router } = reviewing(review(), { import_commit: () => done() });
    const main = await ready();
    await user.click(importButton(main));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    const toasts = screen.getByRole("region", { name: en.toast.region });
    expect(await within(toasts).findByText(toast)).toBeVisible();
    expect(
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview }),
    ).toBeVisible();
  });

  it(
    "the same when forgetting the file takes the review off the screen at once",
    SLOW,
    async () => {
      const { user, router } = reviewing(review(), { import_commit: () => done() });
      const main = await ready();
      // Every reader of the cache hears of a change at once, and the screen follows before the
      // call that changed the cache returns: the page that started the import is gone by the
      // time the next line of its own code runs.
      notifyManager.setScheduler((callback) => {
        callback();
      });
      // The readers of the cache are told in turn, the pages first; then the screen is brought
      // up to date, as a renderer that does not wait would do it.
      const redraw = notifyManager.batchCalls(() => {
        flushSync(() => undefined);
      });
      stop = queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "removed") return;
        const key: unknown = event.query.queryKey;
        if (JSON.stringify(key) !== JSON.stringify(keys.importDraft)) return;
        redraw();
      });
      await user.click(importButton(main));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
      const toasts = screen.getByRole("region", { name: en.toast.region });
      expect(await within(toasts).findByText(toast)).toBeVisible();
      expect(
        await screen.findByRole("heading", { level: 1, name: en.destinations.name.overview }),
      ).toBeVisible();
      expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
    },
  );
});

describe("an import that fails after the review was left", () => {
  const message =
    "The workspace file could not be written (the disk is full). Free some space, then import again.";
  const title = filled(en.import.error.commitLeft, { file: "Holds_2026-10-14.xlsx" });

  it(
    "says so under the top bar, with the file and the reason, on the page the user is on",
    SLOW,
    async () => {
      const commit = heldCommit();
      const { user, router } = reviewing(review(), {
        import_commit: commit.handler,
        import_cancel: () => null,
      });
      await user.click(importButton(await ready()));
      await waitFor(() => {
        expect(commit.handler).toHaveBeenCalledTimes(1);
      });
      // The user leaves while the import runs. The review is gone, and so is its place for an error.
      const nav = screen.getByRole("navigation", { name: en.destinations.label });
      await user.click(within(nav).getByRole("link", { name: en.destinations.name.settings }));
      await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      commit.fail(commandFailure("Io", message));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(title);
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveAttribute("data-tone", "danger");
      expect(router.state.location.pathname).toBe("/settings");
      // Nothing was imported, and nothing says that something was.
      expect(
        within(screen.getByRole("region", { name: en.toast.region })).queryByText(/Imported into/),
      ).not.toBeInTheDocument();
    },
  );

  it("says it once, on the review, while the review is still shown", SLOW, async () => {
    const { user } = reviewing(review(), {
      import_commit: () => {
        throw commandFailure("Io", message);
      },
    });
    const main = await ready();
    await user.click(importButton(main));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.import.error.commit);
    expect(alert).toHaveTextContent(message);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText(title)).not.toBeInTheDocument();
  });
});
