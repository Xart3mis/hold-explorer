import { act, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../../api/keys";
import { useWorkspaceActions } from "../../app/actions/workspaces";
import { defaultFilters, type Filters } from "../../app/filters/state";
import { queryClient } from "../../app/query";
import { destinationPages } from "../../app/router";
import { Page } from "../../app/shell/Page";
import type { SavedView } from "../../bindings/SavedView";
import type { WorkspaceOpen } from "../../bindings/WorkspaceOpen";
import en from "../../locales/en.json";
import { held } from "../../test/actions";
import { must, renderApp } from "../../test/app";
import { expectAccessible } from "../../test/axe";
import { opened, openStart, otherWorkspace, workspace } from "../../test/fixtures";
import type { Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { disciplineFilter, savedView } from "../../test/views";
import { FilterBar } from "../filters/FilterBar";

const text = en.views;

/** The action that opens a workspace, as the page of the test holds it. */
const probe: { open?: (id: string) => void } = {};

function Screen({ name }: { name: string }) {
  const { openWorkspace } = useWorkspaceActions();
  useEffect(() => {
    probe.open = (id) => {
      openWorkspace.mutate(id);
    };
  });
  return <Page title={name} bar={<FilterBar />} />;
}

const pages = {
  ...destinationPages,
  overview: <Screen name="Overview" />,
  breakdown: <Screen name="Breakdown" />,
  lines: <Screen name="Lines" />,
  blockers: <Screen name="Blockers" />,
};

const civil: Filters = {
  ...defaultFilters,
  fields: [
    {
      dim: "Discipline",
      values: [
        { key: "Civil", label: "Civil" },
        { key: "Piping", label: "Piping" },
      ],
      negate: false,
    },
  ],
};

async function renderAt(
  path: string,
  options: { views?: SavedView[]; filters?: Filters; handlers?: Handlers } = {},
) {
  const app = renderApp({
    start: openStart({ open: opened({ views: options.views ?? [] }) }),
    path,
    pages,
    ...(options.handlers === undefined ? {} : { handlers: options.handlers }),
  });
  await screen.findByRole("navigation", { name: en.destinations.label });
  const { filters } = options;
  if (filters !== undefined) {
    act(() => {
      queryClient.setQueryData(keys.workspaceFilters(workspace().id), filters);
    });
  }
  return app;
}

function saveButton() {
  return screen.getByRole("button", { name: text.save });
}

async function openPopover(user: ReturnType<typeof renderApp>["user"]) {
  await user.click(await screen.findByRole("button", { name: text.save }));
  return screen.findByRole("dialog", { name: text.saveTitle });
}

function viewNames(): (string | null)[] {
  // The page behind an open popover is hidden from assistive technology, and still there.
  const links = document.querySelectorAll("[data-part='saved-views'] [data-part='view-link']");
  return [...links].map((link) => link.textContent);
}

describe("Save view", () => {
  it(
    "proposes the destination and the first chip's value, selected, and saves on Enter",
    SLOW,
    async () => {
      const save = vi.fn<NonNullable<Handlers["save_view"]>>(({ name, address, filters }) => [
        { id: 1, name: name.trim(), address, filters },
      ]);
      const { user } = await renderAt("/lines?rows=holds&sort=age&hold=3", {
        filters: civil,
        handlers: { save_view: save },
      });
      const dialog = await openPopover(user);
      const field = within(dialog).getByRole("textbox", { name: text.name });
      await waitFor(() => {
        expect(field).toHaveFocus();
      });
      expect(field).toHaveValue("Lines · Civil, Piping");
      const input = field as HTMLInputElement;
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);

      await user.keyboard("{Enter}");
      // The address without the selection, and the filters as the commands take them.
      expect(save).toHaveBeenCalledWith({
        workspace: workspace().id,
        name: "Lines · Civil, Piping",
        address: "/lines?rows=holds&sort=age",
        filters: disciplineFilter("Civil", "Piping"),
      });
      expect(
        await screen.findByRole("group", { name: "Saved view Lines · Civil, Piping" }),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: text.saveTitle })).not.toBeInTheDocument();
      });
      expect(saveButton()).toHaveFocus();
      // The new view is current.
      const list = screen.getByRole("list", { name: text.title });
      expect(within(list).getByRole("link", { name: "Lines · Civil, Piping" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    },
  );

  it("proposes the destination alone without a chip, and leaves Breakdown's open groups out", async () => {
    const save = vi.fn<NonNullable<Handlers["save_view"]>>(({ name, address, filters }) => [
      { id: 1, name, address, filters },
    ]);
    const { user } = await renderAt("/breakdown?mode=list&by=Role&open=Lead,Checker", {
      handlers: { save_view: save },
    });
    const dialog = await openPopover(user);
    expect(within(dialog).getByRole("textbox", { name: text.name })).toHaveValue(
      en.destinations.name.breakdown,
    );
    await user.click(within(dialog).getByRole("button", { name: text.saveButton }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ address: "/breakdown?mode=list&by=Role" }),
    );
  });

  it("names the view that has the name, and replaces it with an undo", SLOW, async () => {
    const taken = savedView({ id: 7, name: "Civil work", address: "/blockers" });
    const other = savedView({ id: 8, name: "Open lines", address: "/lines" });
    const { user } = await renderAt("/lines", { views: [taken, other] });
    const dialog = await openPopover(user);
    const field = within(dialog).getByRole("textbox", { name: text.name });
    await user.clear(field);
    await user.type(field, "CIVIL WORK{Enter}");
    const message = 'A saved view named "Civil work" already exists.';
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(viewNames()).toEqual(["Civil work", "Open lines"]);

    await user.click(within(dialog).getByRole("button", { name: text.replace }));
    await waitFor(() => {
      expect(viewNames()).toEqual(["Open lines", "CIVIL WORK"]);
    });
    const toast = await screen.findByRole("group", { name: "Deleted view Civil work" });
    expect(await screen.findByRole("group", { name: "Saved view CIVIL WORK" })).toBeInTheDocument();
    // Undo cannot put the old view back while the new one has its name, and says so.
    await user.click(within(toast).getByRole("button", { name: en.common.undo }));
    expect(
      await screen.findByRole("group", { name: 'A saved view named "CIVIL WORK" already exists.' }),
    ).toBeInTheDocument();
  });

  it("says inline that a name is too long", async () => {
    const { user } = await renderAt("/blockers");
    const dialog = await openPopover(user);
    const field = within(dialog).getByRole("textbox", { name: text.name });
    await user.clear(field);
    await user.click(field);
    await user.paste("x".repeat(81));
    await user.keyboard("{Enter}");
    expect(
      await within(dialog).findByText(
        "A saved view needs a name of 1 to 80 characters, and this one has 81.",
      ),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(viewNames()).toEqual([]);
    // Typing again takes the mark away.
    await user.keyboard("{Backspace}");
    expect(field).not.toHaveAttribute("aria-invalid");
  });

  it("is inert while an action on the workspace runs", async () => {
    const open = held<WorkspaceOpen>();
    const { user } = await renderAt("/lines", { handlers: { workspace_open: open.handler } });
    await screen.findByRole("button", { name: text.save });
    act(() => {
      must(probe.open, "the page of the test")(otherWorkspace.id);
    });
    await waitFor(() => {
      expect(saveButton()).toHaveAttribute("aria-busy", "true");
    });
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
    await user.click(saveButton());
    expect(screen.queryByRole("dialog", { name: text.saveTitle })).not.toBeInTheDocument();
    await act(async () => {
      must(open.waiting[0], "the opening").resolve(opened({ workspace: otherWorkspace }));
      await Promise.resolve();
    });
  });

  it(
    "is reached and used by the keyboard alone, and has no accessibility violation",
    SLOW,
    async () => {
      const { user } = await renderAt("/lines", { filters: civil });
      const button = await screen.findByRole("button", { name: text.save });
      button.focus();
      await user.keyboard("{Enter}");
      const dialog = await screen.findByRole("dialog", { name: text.saveTitle });
      await expectAccessible();
      await user.keyboard("Piping and civil{Enter}");
      await waitFor(() => {
        expect(viewNames()).toEqual(["Piping and civil"]);
      });
      expect(dialog).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    },
  );
});
