// What the mapping page costs while a review is on its way: the page renders again, to show the
// spinner, and the preview of the file has nothing to do with it. The preview is a table that
// builds a row for each row of the file it shows, so a render it does not need is worth a test.
import { waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ImportReview } from "../../bindings/ImportReview";
import type * as DataTableModule from "../../components/DataTable/DataTable";
import en from "../../locales/en.json";
import { openFlow, pageTitled } from "../../test/flow";
import { savedMappingDraft } from "../../test/import";
import { SLOW } from "../../test/slow";

const text = en.import.mapping;

/** How often each table was rendered, by its name. */
const renders = vi.hoisted(() => new Map<string, number>());

// The table itself, counted.
vi.mock("../../components/DataTable/DataTable", async (importOriginal) => {
  const actual = await importOriginal<typeof DataTableModule>();
  const Actual = actual.DataTable as ComponentType<{ "aria-label": string }>;
  function CountedTable(props: { "aria-label": string }) {
    renders.set(props["aria-label"], (renders.get(props["aria-label"]) ?? 0) + 1);
    return <Actual {...props} />;
  }
  return { ...actual, DataTable: CountedTable };
});

describe("the mapping page while the review is on its way", () => {
  it("does not render the preview of the file again", SLOW, async () => {
    // A review that never answers: the page waits, with its spinner, for as long as the test runs.
    const reviewed = vi.fn(() => new Promise<ImportReview>(() => undefined));
    const { user } = openFlow("/import/mapping", {
      draft: savedMappingDraft(),
      handlers: { import_review: reviewed },
    });
    const main = await pageTitled(text.title);
    expect(within(main).getByRole("grid", { name: text.preview })).toBeInTheDocument();
    const before = renders.get(text.preview) ?? 0;
    expect(before).toBeGreaterThan(0);

    const next = within(main).getByRole("button", { name: text.continue });
    await user.click(next);
    await waitFor(() => {
      expect(reviewed).toHaveBeenCalledTimes(1);
    });
    // The page was rendered again: its button waits.
    await waitFor(() => {
      expect(next).toHaveAttribute("aria-busy", "true");
    });
    expect(renders.get(text.preview)).toBe(before);
  });
});
