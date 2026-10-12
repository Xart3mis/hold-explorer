// What typing on the review page costs: the name of a new workspace is typed key by key, and the
// findings of the file, which may hold a table of two hundred rows, have nothing to do with it.
// Whether the findings are rendered again does not depend on how many rows their table has, so
// the table here is a short one: the test counts renders, and a long table would only make it slow.
import { screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ArgsOf } from "../../api/commands";
import type { ImportDone } from "../../bindings/ImportDone";
import type * as DataTableModule from "../../components/DataTable/DataTable";
import en from "../../locales/en.json";
import { choose } from "../../test/flow";
import { done, reviewWithFindings, unit573 } from "../../test/import";
import { importButton, REVIEW_TARGET, reviewing, reviewPage as page } from "../../test/review";
import { SLOW } from "../../test/slow";

const text = en.import.review;

/** How often each table was rendered, by its name. */
const renders = vi.hoisted(() => new Map<string, number>());

// The table itself, counted: every render of it is one render of the findings that hold it.
vi.mock("../../components/DataTable/DataTable", async (importOriginal) => {
  const actual = await importOriginal<typeof DataTableModule>();
  const Actual = actual.DataTable as ComponentType<{ "aria-label": string }>;
  function CountedTable(props: { "aria-label": string }) {
    renders.set(props["aria-label"], (renders.get(props["aria-label"]) ?? 0) + 1);
    return <Actual {...props} />;
  }
  return { ...actual, DataTable: CountedTable };
});

describe("the review page while the name of a new workspace is typed", () => {
  it(
    "does not render the findings again at a key, with the table of skipped rows open",
    SLOW,
    async () => {
      const commit = vi.fn<(args: ArgsOf<"import_commit">) => ImportDone>(() =>
        done({ ...unit573, id: "d4e5f60718293041", name: "Unit 600", snapshot_count: 0 }),
      );
      const { user } = reviewing(reviewWithFindings(12), { import_commit: commit });
      const main = await page();
      await user.click(within(main).getByRole("button", { name: "12 rows were skipped" }));
      expect(within(main).getByRole("grid", { name: text.skippedTable })).toBeInTheDocument();

      await choose(user, REVIEW_TARGET, text.target.new);
      const name = await within(main).findByRole("textbox", { name: text.target.newName });
      await user.clear(name);
      await waitFor(() => {
        expect(importButton(main)).toBeDisabled();
      });
      const before = renders.get(text.skippedTable) ?? 0;
      expect(before).toBeGreaterThan(0);

      await user.type(name, "Unit 600 A");
      expect(name).toHaveValue("Unit 600 A");
      // Ten keys, and the table of the findings was not rendered once more.
      expect(renders.get(text.skippedTable)).toBe(before);
      // The page heard at the first key that a name is there.
      expect(importButton(main)).toBeEnabled();

      // The name takes effect when the field is left: the import is sent with it, and the
      // findings were still not rendered again.
      await user.click(importButton(main));
      await waitFor(() => {
        expect(commit).toHaveBeenCalledTimes(1);
      });
      expect(commit.mock.calls[0]?.[0].request.target).toEqual({ kind: "New", name: "Unit 600 A" });
      expect(renders.get(text.skippedTable)).toBe(before);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it(
    "takes the name on Enter as well, and keeps it when the field is left untouched",
    SLOW,
    async () => {
      const { user } = reviewing(reviewWithFindings(12));
      const main = await page();
      await choose(user, REVIEW_TARGET, text.target.new);
      const name = await within(main).findByRole("textbox", { name: text.target.newName });
      await user.clear(name);
      await user.type(name, "Area 9{Enter}");
      expect(name).toHaveValue("Area 9");
      // Another control takes the focus and gives it back: the name is the one that was entered.
      await user.tab();
      await user.tab({ shift: true });
      expect(name).toHaveValue("Area 9");
      expect(importButton(main)).toBeEnabled();
    },
  );
});
