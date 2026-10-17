import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArgsOf } from "../../api/commands";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { ImportDone } from "../../bindings/ImportDone";
import en from "../../locales/en.json";
import { renderApp } from "../../test/app";
import { opened, openStart, otherWorkspace } from "../../test/fixtures";
import { choose, openFlow, pageTitled } from "../../test/flow";
import {
  done,
  exportDraft,
  freeTarget,
  review,
  savedMappingDraft,
  unit573,
  unmappedDraft,
} from "../../test/import";
import { SLOW } from "../../test/slow";
import { fileDrag, windowApi } from "../../test/window";

const FILE = "/home/ada/exports/open-holds.csv";
const mapping = en.import.mapping;
const reviewing = en.import.review;
const names = en.import.field;

function required(label: string): RegExp {
  return new RegExp(` ${label} \\(required\\)$`);
}

type User = ReturnType<typeof renderApp>["user"];

/** Presses Tab until the element has the focus. It fails when Tab never reaches it. */
async function tabTo(user: User, find: () => HTMLElement): Promise<HTMLElement> {
  for (let presses = 0; presses < 60; presses += 1) {
    const wanted = find();
    if (wanted === document.activeElement) return wanted;
    await user.tab();
  }
  throw new Error("Tab did not reach the element within 60 presses.");
}

describe("the import flow from its start", () => {
  it("goes from the file to the review when the file can be read as it is", async () => {
    const { router } = renderApp({
      start: openStart(),
      path: { pathname: "/import", state: { path: FILE, from: "/lines" } },
      handlers: {
        import_open: () => exportDraft(),
        import_review: () => review(),
        import_check_target: () => freeTarget,
      },
    });
    await pageTitled(reviewing.title);
    expect(router.state.location.pathname).toBe("/import/review");
  });

  it("goes from the file to the mapping page when required fields have no column", async () => {
    const { router } = renderApp({
      start: openStart(),
      path: { pathname: "/import", state: { path: FILE, from: "/lines" } },
      handlers: { import_open: () => unmappedDraft() },
    });
    const main = await pageTitled(mapping.title);
    expect(router.state.location.pathname).toBe("/import/mapping");
    expect(within(main).getAllByText(mapping.missing)).toHaveLength(3);
  });

  it("imports the first of two dropped files and says that one file is imported at a time", async () => {
    const open = vi.fn(() => unmappedDraft());
    renderApp({ start: openStart(), path: "/lines", handlers: { import_open: open } });
    await screen.findByRole("navigation", { name: en.destinations.label });
    fileDrag.drop([FILE, "/home/ada/exports/Holds_2026-10-07.xlsx"]);
    const main = await pageTitled(mapping.title);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ path: FILE });
    expect(
      within(main).getByText(en.import.severalDropped.replace("{{count, number}}", "2")),
    ).toBeVisible();
  });

  it("is completed by the keyboard alone: file, columns, review, import", SLOW, async () => {
    windowApi.chooseImportFile.mockResolvedValue(FILE);
    const reviewed = vi.fn(() =>
      review({ file_name: "open-holds.csv", mapping: savedMappingDraft().proposed }),
    );
    const commit = vi.fn<(args: ArgsOf<"import_commit">) => ImportDone>(() => done());
    const { user, router } = renderApp({
      start: openStart(),
      path: "/lines",
      handlers: {
        import_open: () => unmappedDraft(),
        import_review: reviewed,
        import_check_target: () => freeTarget,
        import_commit: commit,
      },
    });
    await screen.findByRole("navigation", { name: en.destinations.label });
    await user.keyboard("{Control>}i{/Control}");

    // The mapping page takes the focus to its title. Each required field is reached by Tab,
    // opened with Enter, and given a column with the arrow keys and Enter.
    const main = await pageTitled(mapping.title);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: mapping.title })).toHaveFocus();
    });
    const pick = async (field: RegExp, downs: number, header: string) => {
      await tabTo(user, () => within(main).getByRole("button", { name: field }));
      await user.keyboard("{Enter}");
      await screen.findByRole("listbox");
      await user.keyboard(`${"{ArrowDown}".repeat(downs)}{Enter}`);
      await waitFor(() => {
        expect(within(main).getByRole("button", { name: field })).toHaveTextContent(header);
      });
    };
    await pick(required(names.LineId), 1, "Line");
    await pick(required(names.Remark), 2, "Why");
    await pick(required(names.HoldType), 0, "Kind");
    await tabTo(user, () => within(main).getByRole("button", { name: mapping.continue }));
    await user.keyboard("{Enter}");

    const next = await pageTitled(reviewing.title);
    expect(reviewed).toHaveBeenCalledWith({ fields: { LineId: 1, Remark: 2, HoldType: 0 } });
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: reviewing.title })).toHaveFocus();
    });
    await waitFor(() => {
      expect(within(next).getByRole("button", { name: reviewing.import })).toBeEnabled();
    });
    await tabTo(user, () => within(next).getByRole("button", { name: reviewing.import }));
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    expect(commit).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: en.destinations.name.overview }),
      ).toHaveFocus();
    });
  });
});

describe("leaving the import flow", () => {
  function atReview() {
    const cancel = vi.fn(() => null);
    const app = openFlow("/import/review", {
      draft: exportDraft(),
      handlers: {
        import_review: () => review(),
        import_check_target: () => freeTarget,
        import_cancel: cancel,
        workspace_open: () => opened({ workspace: otherWorkspace }),
      },
    });
    return { ...app, cancel };
  }

  async function gone(cancel: ReturnType<typeof vi.fn>) {
    await waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
    });
    expect(queryClient.getQueryData(keys.importDraft)).toBeUndefined();
    expect(queryClient.getQueryData(keys.importReview)).toBeUndefined();
    expect(queryClient.getQueryData(keys.importChoices)).toBeUndefined();
  }

  it("by the sidebar drops the draft on the Rust side too", async () => {
    const { user, router, cancel } = atReview();
    await pageTitled(reviewing.title);
    const nav = screen.getByRole("navigation", { name: en.destinations.label });
    await user.click(within(nav).getByRole("link", { name: en.destinations.name.settings }));
    expect(router.state.location.pathname).toBe("/settings");
    await gone(cancel);
  });

  it("by a shortcut does the same", async () => {
    const { user, router, cancel } = atReview();
    await pageTitled(reviewing.title);
    await user.keyboard("{Control>}1{/Control}");
    expect(router.state.location.pathname).toBe("/overview");
    await gone(cancel);
  });

  it("by opening another workspace does the same", SLOW, async () => {
    const { user, router, cancel } = atReview();
    await pageTitled(reviewing.title);
    await user.click(
      screen.getByRole("button", { name: `${en.workspaces.switcher} ${unit573.name}` }),
    );
    const menu = await screen.findByRole("menu", { name: en.workspaces.switcher });
    await user.click(within(menu).getByRole("menuitem", { name: /^Tank farm/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    await gone(cancel);
  });

  it("lets a late Cancel end only the file it was pressed for", async () => {
    // The Rust side as far as the draft goes: the file opened last, dropped by a cancel for it.
    let held: string | null = exportDraft().file.content_hash;
    let answer: (value: null) => void = () => undefined;
    const cancel = vi.fn(
      ({ contentHash }: ArgsOf<"import_cancel">) =>
        new Promise<null>((resolve) => {
          answer = (value) => {
            if (contentHash === null || contentHash === held) held = null;
            resolve(value);
          };
        }),
    );
    const other = unmappedDraft();
    const { user, router } = openFlow("/import/review", {
      draft: exportDraft(),
      handlers: {
        import_review: () => review(),
        import_check_target: () => freeTarget,
        import_cancel: cancel,
        import_open: () => {
          held = other.file.content_hash;
          return other;
        },
      },
    });
    const main = await pageTitled(reviewing.title);
    await user.click(within(main).getByRole("button", { name: en.common.cancel }));
    expect(cancel).toHaveBeenCalledWith({ contentHash: exportDraft().file.content_hash });

    // Another file is opened before the cancel is answered.
    fileDrag.drop([FILE]);
    await pageTitled(mapping.title);
    answer(null);
    // The cancel has been answered, and what its page does with the answer is done.
    await waitFor(() => {
      expect(queryClient.isMutating()).toBe(0);
    });

    expect(held).toBe(other.file.content_hash);
    expect(queryClient.getQueryData(keys.importDraft)).toEqual(other);
    expect(router.state.location.pathname).toBe("/import/mapping");
  });

  it("does not cancel anything while the flow moves between its own pages", async () => {
    const { user, router, cancel } = atReview();
    const main = await pageTitled(reviewing.title);
    await user.click(within(main).getByRole("button", { name: reviewing.changeMapping }));
    await pageTitled(mapping.title);
    await router.navigate(-1);
    await pageTitled(reviewing.title);
    expect(cancel).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(keys.importDraft)).toBeDefined();
  });
});

describe("going back and forward inside the import flow", () => {
  it("keeps what was chosen on the review page", SLOW, async () => {
    const { user, router } = openFlow("/import/review", {
      draft: exportDraft(),
      handlers: { import_review: () => review(), import_check_target: () => freeTarget },
    });
    const main = await pageTitled(reviewing.title);
    await choose(user, / Import into$/, new RegExp(`^${otherWorkspace.name}`));
    const date = within(main).getByRole("textbox", { name: reviewing.date.date });
    await user.clear(date);
    await user.type(date, "2026-10-15");
    await user.tab();
    await user.click(within(main).getByRole("button", { name: reviewing.changeMapping }));
    await pageTitled(mapping.title);

    await router.navigate(-1);
    const back = await pageTitled(reviewing.title);
    expect(within(back).getByRole("button", { name: / Import into$/ })).toHaveTextContent(
      otherWorkspace.name,
    );
    expect(within(back).getByRole("textbox", { name: reviewing.date.date })).toHaveValue(
      "2026-10-15",
    );
    expect(within(back).getByText(reviewing.date.source.User)).toBeVisible();
  });

  it("keeps the columns that were chosen on the mapping page", SLOW, async () => {
    const { user, router } = openFlow("/import/mapping", { draft: exportDraft() });
    const main = await pageTitled(mapping.title);
    const size = new RegExp(` ${names.ModelSize}$`);
    await choose(user, size, mapping.none);
    await user.click(within(main).getByRole("button", { name: en.import.chooseSheet }));
    await pageTitled(en.import.sheet.title);

    await router.navigate(-1);
    const back = await pageTitled(mapping.title);
    expect(within(back).getByRole("button", { name: size })).toHaveTextContent(mapping.none);
    await router.navigate(1);
    await pageTitled(en.import.sheet.title);
  });
});
