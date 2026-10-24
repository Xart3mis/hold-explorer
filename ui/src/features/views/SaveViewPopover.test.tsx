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
import { expectNoAxeViolations } from "../../test/axe";
import { opened, openStart, otherWorkspace, workspace } from "../../test/fixtures";
import { commandFailure, type Handlers } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { disciplineFilter, nameRefusal, savedView, takenRefusal } from "../../test/views";
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
  it("closes on Escape in its name field, and gives the focus back to Save view", async () => {
    const { user } = await renderAt("/lines");
    const dialog = await openPopover(user);
    const field = within(dialog).getByRole("textbox", { name: text.name });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: text.saveTitle })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(saveButton()).toHaveFocus();
    });
  });

  it(
    "proposes the destination and the first chip's value, selected, and saves on Enter",
    SLOW,
    async () => {
      const save = vi.fn<NonNullable<Handlers["save_view"]>>(({ name, address, filters }) => [
        { id: 1, name: name.trim(), address, filters },
      ]);
      const { user } = await renderAt("/lines?rows=holds&sort=OldestFirst&hold=3", {
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
        address: "/lines?rows=holds&sort=OldestFirst",
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

  it("proposes the label of a value the snapshot names, not its key", async () => {
    const key = "HOLD PENDING 573-PR-1450";
    const { user } = await renderAt("/lines", {
      filters: {
        ...defaultFilters,
        fields: [{ dim: "Remark", values: [{ key, label: key }], negate: false }],
      },
      handlers: {
        filter_labels: () => [{ dim: "Remark", key, label: "Hold pending 573-PR-1450" }],
      },
    });
    await screen.findByRole("button", { name: /Hold remark Hold pending 573-PR-1450/ });
    const dialog = await openPopover(user);
    expect(within(dialog).getByRole("textbox", { name: text.name })).toHaveValue(
      "Lines · Hold pending 573-PR-1450",
    );
  });

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
    const message = takenRefusal("Civil work");
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
      await screen.findByRole("group", { name: takenRefusal("CIVIL WORK") }),
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
    expect(await within(dialog).findByText(nameRefusal(81))).toBeInTheDocument();
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
      await expectNoAxeViolations();
      await user.keyboard("Piping and civil{Enter}");
      await waitFor(() => {
        expect(viewNames()).toEqual(["Piping and civil"]);
      });
      expect(dialog).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    },
  );
});

describe("Save view on Breakdown", () => {
  function renderBreakdown(views: SavedView[] = [], path = "/breakdown", handlers: Handlers = {}) {
    // The real Breakdown page, which writes its own address once it is used.
    return renderApp({ start: openStart({ open: opened({ views }) }), path, handlers });
  }

  function viewLink(name: string): HTMLElement {
    return within(screen.getByRole("list", { name: text.title })).getByRole("link", { name });
  }

  it("saves the screen in full, and keeps it current when a group is expanded", SLOW, async () => {
    const save = vi.fn<NonNullable<Handlers["save_view"]>>(({ name, address, filters }) => [
      { id: 1, name, address, filters },
    ]);
    const { user, router } = renderBreakdown([], "/breakdown", { save_view: save });
    const table = await screen.findByRole("treegrid", {
      name: en.breakdown.table.replace("{{dim}}", "Discipline"),
    });
    await within(table).findByRole("rowheader", { name: "Civil" });
    const dialog = await openPopover(user);
    await user.click(within(dialog).getByRole("button", { name: text.saveButton }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ address: "/breakdown?mode=list&by=Discipline" }),
    );
    await waitFor(() => {
      expect(viewLink(en.destinations.name.breakdown)).toHaveAttribute("aria-current", "true");
    });

    // A group expanded is a selection: the screen is still the view's.
    const civil = must(
      within(table).getByRole("rowheader", { name: "Civil" }).closest<HTMLElement>("[role='row']"),
    );
    await user.click(civil);
    await waitFor(() => {
      expect(router.state.location.search).toBe("?mode=list&by=Discipline&open=Civil");
    });
    expect(viewLink(en.destinations.name.breakdown)).toHaveAttribute("aria-current", "true");
  });

  it("marks a view current on the same screen however its address spells it", async () => {
    const bare = savedView({ id: 1, name: "Groups", address: "/breakdown" });
    renderBreakdown([bare], "/breakdown?mode=list&by=Discipline");
    await screen.findByRole("list", { name: text.title });
    await waitFor(() => {
      expect(viewLink("Groups")).toHaveAttribute("aria-current", "true");
    });
  });
});

describe("Replace it", () => {
  it("can be tried again when the delete of the other view fails", SLOW, async () => {
    const taken = savedView({ id: 7, name: "Civil work", address: "/blockers" });
    const { user } = await renderAt("/lines", {
      views: [taken],
      handlers: {
        delete_view: () => {
          throw commandFailure("Io", "The workspace file could not be written.");
        },
      },
    });
    const dialog = await openPopover(user);
    const field = within(dialog).getByRole("textbox", { name: text.name });
    await user.clear(field);
    await user.type(field, "Civil work{Enter}");
    await user.click(await within(dialog).findByRole("button", { name: text.replace }));
    expect(
      await screen.findByRole("group", {
        name: "The workspace file could not be written.",
        // Behind the popover, which is still open.
        hidden: true,
      }),
    ).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: text.saveButton });
    await waitFor(() => {
      expect(save).not.toHaveAttribute("aria-busy");
    });
    expect(field).not.toHaveAttribute("readonly");
  });

  it("offers no Undo of the replaced view once another workspace is open", SLOW, async () => {
    const taken = savedView({ id: 7, name: "Civil work", address: "/blockers" });
    const { user } = await renderAt("/lines", {
      views: [taken],
      handlers: { workspace_open: () => opened({ workspace: otherWorkspace }) },
    });
    const dialog = await openPopover(user);
    const field = within(dialog).getByRole("textbox", { name: text.name });
    await user.clear(field);
    await user.type(field, "Civil work{Enter}");
    await user.click(await within(dialog).findByRole("button", { name: text.replace }));
    await screen.findByRole("group", { name: "Deleted view Civil work" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: text.saveTitle })).not.toBeInTheDocument();
    });
    act(() => {
      must(probe.open, "the page of the test")(otherWorkspace.id);
    });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "Deleted view Civil work" })).toBeNull();
    });
  });
});
