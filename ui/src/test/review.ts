// What the tests of the review page share: the page on a file, and a commit a test steps through.
import { act, waitFor, within } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { ArgsOf } from "../api/commands";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ImportReview } from "../bindings/ImportReview";
import type { TargetCheck } from "../bindings/TargetCheck";
import en from "../locales/en.json";
import { openFlow, pageTitled } from "./flow";
import { exportDraft, freeTarget, review, savedMappingDraft } from "./import";
import type { Handlers } from "./ipc";

type CheckArgs = ArgsOf<"import_check_target">;
type CommitArgs = ArgsOf<"import_commit">;

/** The name of the select of the target: what is chosen, then its label. */
export const REVIEW_TARGET = / Import into$/;

/** The review page on a file, with the commands a review needs answered. */
export function reviewing(
  found: ImportReview = review(),
  handlers: Handlers = {},
  from = "/lines",
) {
  const check = vi.fn<(args: CheckArgs) => TargetCheck | Promise<TargetCheck>>(() => freeTarget);
  const app = openFlow("/import/review", {
    draft: found.file_name === "open-holds.csv" ? savedMappingDraft() : exportDraft(),
    from,
    handlers: { import_review: () => found, import_check_target: check, ...handlers },
  });
  return { ...app, check };
}

export async function reviewPage() {
  return pageTitled(en.import.review.title);
}

export function importButton(main: HTMLElement) {
  return within(main).getByRole("button", { name: en.import.review.import });
}

/** The page once the workspace has been checked and Import can be pressed. */
export async function ready() {
  const main = await reviewPage();
  await waitFor(() => {
    expect(importButton(main)).toBeEnabled();
  });
  return main;
}

/** A text of the catalog with its named values put in. */
export function filled(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{{${name}}}`, value),
    template,
  );
}

/** A commit the test lets through phase by phase. */
export function heldCommit() {
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

/** The request the last commit was sent with. */
export function sent(commit: { mock: { calls: [CommitArgs][] } }): CommitArgs["request"] {
  const last = commit.mock.calls.at(-1);
  if (!last) throw new Error("The test expected a commit to have been sent.");
  return last[0].request;
}
