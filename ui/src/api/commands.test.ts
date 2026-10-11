import { describe, expect, it } from "vitest";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ImportReview } from "../bindings/ImportReview";
import { mockCommands } from "../test/ipc";
import { api } from "./commands";

describe("the import commands", () => {
  it("passes the arguments by the keys the commands name", async () => {
    let check: unknown;
    let review: unknown;
    mockCommands({
      import_check_target: (args) => {
        check = args;
        return { already_imported: null, same_day: [] };
      },
      import_review: (args) => {
        review = args;
        return null as unknown as ImportReview;
      },
    });
    await api.importCheckTarget({ kind: "New", name: "A" }, "2026-10-07T08:00:00");
    await api.importReview({ LineId: 1 });
    await api.importReview(null);
    expect(check).toEqual({
      target: { kind: "New", name: "A" },
      takenAt: "2026-10-07T08:00:00",
    });
    expect(review).toEqual({ fields: null });
  });

  it("builds the progress channel itself and hands each phase to the callback", async () => {
    const heard: ImportPhase[] = [];
    mockCommands({
      import_commit: (args) => {
        expect(args.request.replace).toBeNull();
        for (const phase of ["Reading", "Done"] as const) {
          args.onProgress.onmessage(phase);
        }
        return null as never;
      },
    });
    await api.importCommit(
      {
        target: { kind: "New", name: "A" },
        taken_at: "2026-10-07T08:00:00",
        date_edited: false,
        replace: null,
      },
      (phase) => heard.push(phase),
    );
    expect(heard).toEqual(["Reading", "Done"]);
  });
});
