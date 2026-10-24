import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArgsOf } from "../../api/commands";
import type { ImportDone } from "../../bindings/ImportDone";
import type { TargetCheck } from "../../bindings/TargetCheck";
import en from "../../locales/en.json";
import { must, topBar } from "../../test/app";
import { expectNoAxeViolations } from "../../test/axe";
import { done, freeTarget, review, reviewToConfirm } from "../../test/import";
import { commandFailure } from "../../test/ipc";
import { filled, heldCommit, importButton, ready, reviewing, reviewPage } from "../../test/review";
import { SLOW } from "../../test/slow";

const text = en.import.review;
const unit = "Unit 573 piping";
const failure =
  "The workspace file could not be written (the disk is full). Free some space, then import again.";

type CommitArgs = ArgsOf<"import_commit">;

/** The region that says what Import waits for, and how far a running import has come. */
function status(main: HTMLElement): HTMLElement {
  return must(main.querySelector<HTMLElement>('[data-part="import-status"]'), "the status region");
}

/** Presses Import with the keyboard: the button has the focus when the import starts. */
async function pressImport(user: ReturnType<typeof reviewing>["user"], main: HTMLElement) {
  importButton(main).focus();
  expect(importButton(main)).toHaveFocus();
  await user.keyboard("{Enter}");
}

describe("the focus while an import runs", () => {
  it(
    "moves to the progress of the import when Import is pressed, and stays inside the page",
    SLOW,
    async () => {
      const commit = heldCommit();
      const { user } = reviewing(review(), { import_commit: commit.handler });
      const main = await ready();
      await pressImport(user, main);
      await waitFor(() => {
        expect(commit.handler).toHaveBeenCalledTimes(1);
      });

      // The button that had the focus is gone. The focus is on what took its place.
      const running = within(main).getByRole("group", { name: text.progress });
      expect(within(running).getByRole("progressbar")).toBeInTheDocument();
      expect(running).toHaveFocus();
      expect(document.activeElement).not.toBe(document.body);
      expect(main.contains(document.activeElement)).toBe(true);

      // It stays there while the phases change.
      commit.say("Checking");
      commit.say("Storing");
      expect(running).toHaveFocus();
    },
  );

  it(
    "moves to the error when the import fails, and the next Tab reaches the form",
    SLOW,
    async () => {
      const commit = heldCommit();
      const { user } = reviewing(review(), { import_commit: commit.handler });
      const main = await ready();
      await pressImport(user, main);
      await waitFor(() => {
        expect(commit.handler).toHaveBeenCalledTimes(1);
      });
      commit.fail(commandFailure("Io", failure));

      const alert = await within(main).findByRole("alert");
      const problem = must(alert.closest<HTMLElement>("[data-kind]"), "the error of the import");
      await waitFor(() => {
        expect(problem).toHaveFocus();
      });
      // What has the focus says what happened and how to fix it.
      expect(problem).toHaveTextContent(en.import.error.commit);
      expect(problem).toHaveTextContent(failure);
      expect(document.activeElement).not.toBe(document.body);
      expect(main.contains(document.activeElement)).toBe(true);

      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      await user.tab();
      expect(importButton(main)).toHaveFocus();
      // And the fields are one step back.
      await user.tab({ shift: true });
      await user.tab({ shift: true });
      expect(main.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(problem);
    },
  );

  it("does the same when the import fails at once", SLOW, async () => {
    const { user } = reviewing(review(), {
      import_commit: () => {
        throw commandFailure("Io", failure);
      },
    });
    const main = await ready();
    await pressImport(user, main);
    const alert = await within(main).findByRole("alert");
    await waitFor(() => {
      expect(alert.closest("[data-kind]")).toHaveFocus();
    });
  });

  it("leaves the focus where the user took it while the import ran", SLOW, async () => {
    const commit = heldCommit();
    const { user } = reviewing(review(), { import_commit: commit.handler });
    const main = await ready();
    await pressImport(user, main);
    await waitFor(() => {
      expect(commit.handler).toHaveBeenCalledTimes(1);
    });
    const elsewhere = within(topBar()).getByRole("button", { name: en.shell.import });
    elsewhere.focus();
    commit.fail(commandFailure("Io", failure));
    await within(main).findByRole("alert");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(elsewhere).toHaveFocus();
  });

  it("has no accessibility violation while the import runs and after it failed", SLOW, async () => {
    const commit = heldCommit();
    const { user } = reviewing(review(), { import_commit: commit.handler });
    const main = await ready();
    await pressImport(user, main);
    await within(main).findByRole("progressbar");
    await expectNoAxeViolations(document.body, { page: true });
    commit.fail(commandFailure("Io", failure));
    await within(main).findByRole("alert");
    await expectNoAxeViolations(document.body, { page: true });
  });
});

describe("why Import is disabled, for every user", () => {
  it(
    "is said in a region that is announced when it changes, and is the description of the button",
    SLOW,
    async () => {
      const { user } = reviewing(reviewToConfirm());
      const main = await reviewPage();
      const region = status(main);
      expect(region).toHaveAttribute("role", "status");
      await waitFor(() => {
        expect(region).toHaveTextContent(text.blocked.confirm);
      });
      // The text is on the page for the eye as before, and it describes the button it explains.
      expect(within(main).getByText(text.blocked.confirm)).toBeVisible();
      expect(importButton(main)).toBeDisabled();
      expect(importButton(main)).toHaveAccessibleDescription(text.blocked.confirm);

      // The region is the same one when the reason goes: a change inside it is what is announced.
      await user.click(within(main).getByRole("checkbox", { name: text.date.confirm }));
      expect(importButton(main)).toBeEnabled();
      expect(status(main)).toBe(region);
      expect(region).toBeEmptyDOMElement();
      expect(importButton(main)).toHaveAccessibleDescription("");
    },
  );

  it("is there before any reason is, so the first reason is announced too", SLOW, async () => {
    const { user } = reviewing();
    const main = await ready();
    const region = status(main);
    expect(region).toBeEmptyDOMElement();
    const date = within(main).getByRole("textbox", { name: text.date.date });
    await user.clear(date);
    await user.tab();
    expect(status(main)).toBe(region);
    expect(region).toHaveTextContent(text.blocked.date);
    expect(importButton(main)).toHaveAccessibleDescription(text.blocked.date);
  });

  it("names every reason when there are several", SLOW, async () => {
    reviewing(
      review({
        detected: null,
        date_needs_confirmation: true,
        target: { suggested: null, matching: [], all: review().target.all },
      }),
    );
    const main = await reviewPage();
    const region = status(main);
    expect(region).toHaveTextContent(text.blocked.date);
    expect(region).toHaveTextContent(text.blocked.target);
    expect(importButton(main)).toHaveAccessibleDescription(
      `${text.blocked.date} ${text.blocked.target}`,
    );
  });

  it("keeps a disabled Import out of the Tab order, as every disabled button is", async () => {
    reviewing(reviewToConfirm());
    const main = await reviewPage();
    await within(main).findByText(text.blocked.confirm);
    expect(importButton(main)).toBeDisabled();
    importButton(main).focus();
    expect(importButton(main)).not.toHaveFocus();
  });
});

describe("that Import has become available, for every user", () => {
  /** The line that says so. It is announced, and the button shows the same to the eye. */
  function available(main: HTMLElement): HTMLElement {
    return must(
      main.querySelector<HTMLElement>('[data-part="import-available"]'),
      "the line that says the snapshot can be imported",
    );
  }

  it(
    "is said once the workspace has been checked and nothing else is in the way",
    SLOW,
    async () => {
      let finish: (value: TargetCheck) => void = () => undefined;
      reviewing(review(), {
        import_check_target: () =>
          new Promise<TargetCheck>((resolve) => {
            finish = resolve;
          }),
      });
      const main = await reviewPage();
      const line = available(main);
      expect(line).toHaveAttribute("role", "status");
      await waitFor(() => {
        expect(status(main)).toHaveTextContent(text.blocked.checking);
      });
      expect(line).toBeEmptyDOMElement();

      finish(freeTarget);
      await waitFor(() => {
        expect(importButton(main)).toBeEnabled();
      });
      // The same element says it: a change inside it is what is announced.
      expect(available(main)).toBe(line);
      expect(line).toHaveTextContent(text.available);
      // It is not one of the reasons, and the button has nothing to explain any more.
      expect(status(main)).toBeEmptyDOMElement();
      expect(importButton(main)).toHaveAccessibleDescription("");
    },
  );

  it(
    "is taken back when a reason returns, and said again when that reason goes",
    SLOW,
    async () => {
      const { user } = reviewing(reviewToConfirm());
      const main = await reviewPage();
      const line = available(main);
      await waitFor(() => {
        expect(status(main)).toHaveTextContent(text.blocked.confirm);
      });
      expect(line).toBeEmptyDOMElement();
      const confirm = within(main).getByRole("checkbox", { name: text.date.confirm });
      await user.click(confirm);
      await waitFor(() => {
        expect(line).toHaveTextContent(text.available);
      });
      await user.click(confirm);
      await waitFor(() => {
        expect(line).toBeEmptyDOMElement();
      });
      expect(status(main)).toHaveTextContent(text.blocked.confirm);
    },
  );

  it(
    "is not said of an import that was never held back, and not while an import runs",
    SLOW,
    async () => {
      const commit = heldCommit();
      const { user } = reviewing(
        review({ target: { suggested: null, matching: [], all: [] } }),
        { import_commit: commit.handler },
        "/welcome",
      );
      const main = await ready();
      expect(available(main)).toBeEmptyDOMElement();
      await user.click(importButton(main));
      await waitFor(() => {
        expect(commit.handler).toHaveBeenCalledTimes(1);
      });
      expect(available(main)).toBeEmptyDOMElement();
    },
  );
});

describe("how far a running import has come, for every user", () => {
  it("is announced phase by phase in the same region", SLOW, async () => {
    const commit = heldCommit();
    const { user, router } = reviewing(review(), { import_commit: commit.handler });
    const main = await ready();
    const region = status(main);
    await user.click(importButton(main));
    await waitFor(() => {
      expect(commit.handler).toHaveBeenCalledTimes(1);
    });
    expect(status(main)).toBe(region);
    expect(region).toHaveTextContent(text.phase.waiting);

    commit.say("Checking");
    expect(region).toHaveTextContent(filled(text.phase.Checking, { workspace: unit }));
    commit.say("Storing");
    expect(region).toHaveTextContent(filled(text.phase.Storing, { workspace: unit }));
    commit.say("Done");
    expect(region).toHaveTextContent(filled(text.phase.Done, { workspace: unit }));
    // The bar still shows the phase to the eye; the region repeats it for a screen reader only.
    expect(
      within(main).getByRole("progressbar", {
        name: filled(text.phase.Done, { workspace: unit }),
      }),
    ).toBeVisible();

    commit.finish(done());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
  });

  it("gives way to the reasons again when the import fails", SLOW, async () => {
    const commit = vi.fn<(args: CommitArgs) => ImportDone>(() => {
      throw commandFailure("Io", failure);
    });
    const { user } = reviewing(review(), { import_commit: commit });
    const main = await ready();
    const region = status(main);
    await user.click(importButton(main));
    await within(main).findByRole("alert");
    await waitFor(() => {
      expect(importButton(main)).toBeEnabled();
    });
    expect(status(main)).toBe(region);
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
