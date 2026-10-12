import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { keys } from "../../api/keys";
import { queryClient } from "../../app/query";
import type { AppStart } from "../../bindings/AppStart";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { renderApp, topBar } from "../../test/app";
import { opened, openStart, otherWorkspace, workspace } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";

const named = (name: string) => `${en.workspaces.switcher} ${name}`;
const current = named("Unit 573 piping");

async function openMenu(user: ReturnType<typeof renderApp>["user"]) {
  await user.click(await screen.findByRole("button", { name: current }));
  return screen.findByRole("menu", { name: en.workspaces.switcher });
}

describe("WorkspaceSwitcher", () => {
  it("shows the name of the open workspace", async () => {
    renderApp({ start: openStart(), path: "/overview" });
    const trigger = await screen.findByRole("button", { name: current });
    expect(trigger).toHaveTextContent("Unit 573 piping");
    expect(trigger).toHaveAttribute("aria-haspopup");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("lists the other workspaces, then New workspace, Rename workspace, and All workspaces", async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    const menu = await openMenu(user);
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("aria-label") ?? item.textContent)).toEqual([
      expect.stringContaining("Tank farm"),
      en.workspaces.rename,
      en.workspaces.new,
      en.workspaces.all,
    ]);
    // The others are a named group; the open workspace is not among them.
    const group = within(menu).getByRole("group", { name: en.workspaces.others });
    expect(within(group).getAllByRole("menuitem")).toHaveLength(1);
    const other = within(group).getByRole("menuitem", { name: "Tank farm" });
    expect(other).toHaveAccessibleDescription("5 snapshots");
    expect(
      within(menu).queryByRole("menuitem", { name: "Unit 573 piping" }),
    ).not.toBeInTheDocument();
  });

  it("has no group of others when the open workspace is the only one", async () => {
    const start = openStart();
    const { user } = renderApp({
      start: { ...start, list: { ...start.list, workspaces: [workspace()] } },
      path: "/overview",
    });
    const menu = await openMenu(user);
    expect(within(menu).queryByRole("group")).not.toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(3);
  });

  it("opens another workspace and stays on the destination", async () => {
    const open = vi.fn(() => opened({ workspace: otherWorkspace }));
    const { user, router } = renderApp({
      start: openStart(),
      path: "/lines",
      handlers: { workspace_open: open },
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Tank farm" }));
    expect(open).toHaveBeenCalledWith({ id: otherWorkspace.id });
    expect(await screen.findByRole("button", { name: named("Tank farm") })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/lines");
  });

  it("goes to Overview when another workspace is opened from a page that is not a destination", async () => {
    const { user, router } = renderApp({
      start: openStart(),
      path: "/welcome",
      handlers: { workspace_open: () => opened({ workspace: otherWorkspace }) },
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Tank farm" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
  });

  it("shows why another workspace could not be opened, and keeps the open one", async () => {
    const message =
      "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.";
    const { user } = renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        workspace_open: () => {
          throw commandFailure("WorkspaceNotFound", message);
        },
      },
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Tank farm" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.workspaces.openError);
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: current })).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: en.common.dismiss }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leads to the list of all workspaces, with the focus on the heading of that page", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: en.workspaces.all }));
    expect(router.state.location.pathname).toBe("/welcome");
    const heading = await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    // The menu gives the focus back to its button when it closes; the page takes it after that.
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(heading).toHaveFocus();
  });

  it("does the same by the keyboard", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/lines" });
    const trigger = await screen.findByRole("button", { name: current });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu", { name: en.workspaces.switcher });
    await user.keyboard("{End}{Enter}");
    expect(router.state.location.pathname).toBe("/welcome");
    const heading = await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(heading).toHaveFocus();
  });

  it("leads to the form for a new workspace, with the focus in its name field", async () => {
    const { user, router } = renderApp({ start: openStart(), path: "/overview" });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: en.workspaces.new }));
    expect(router.state.location.pathname).toBe("/welcome");
    expect(
      await screen.findByRole("heading", { level: 1, name: en.workspaces.title }),
    ).toBeInTheDocument();
    // The page was opened for its form, so the field of the form has the focus, not the heading.
    const field = await screen.findByRole("textbox", { name: en.workspaces.nameLabel });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(field).toHaveFocus();
  });

  it("creates a workspace: the form on the page, then the new workspace, open", SLOW, async () => {
    const created = workspace({
      id: "c".repeat(16),
      name: "Unit 580 piping",
      snapshot_count: 0,
      latest_taken_at: null,
    });
    const create = vi.fn(() => opened({ workspace: created, snapshots: [], selected: null }));
    const start = openStart();
    const { user, router } = renderApp({
      start,
      path: "/lines",
      handlers: {
        workspace_create: create,
        workspace_list: () => ({ ...start.list, workspaces: [...start.list.workspaces, created] }),
      },
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: en.workspaces.new }));
    expect(router.state.location.pathname).toBe("/welcome");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const field = await screen.findByRole("textbox", { name: en.workspaces.nameLabel });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.type(field, "Unit 580 piping{Enter}");
    expect(create).toHaveBeenCalledWith({ name: "Unit 580 piping" });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    await user.click(await screen.findByRole("button", { name: named("Unit 580 piping") }));
    // The list changed too: the workspace that was open is now one of the others.
    const group = await screen.findByRole("group", { name: en.workspaces.others });
    expect(within(group).getAllByRole("menuitem")).toHaveLength(2);
    expect(within(group).getByRole("menuitem", { name: "Tank farm" })).toBeInTheDocument();
    expect(within(group).getByRole("menuitem", { name: "Unit 573 piping" })).toBeInTheDocument();
  });

  it("shows the error of a failed create with its fix", async () => {
    const message =
      "The workspace file could not be created in /data/workspaces (the disk is full). Free some space, then create the workspace again.";
    const { user } = renderApp({
      start: openStart(),
      path: "/overview",
      handlers: {
        workspace_create: () => {
          throw commandFailure("Io", message);
        },
      },
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: en.workspaces.new }));
    await user.type(
      await screen.findByRole("textbox", { name: en.workspaces.nameLabel }),
      "Unit 580{Enter}",
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.workspaces.createError);
    expect(alert).toHaveTextContent(message);
    // The workspace that was open still is.
    expect(screen.getByRole("button", { name: current })).toBeInTheDocument();
  });

  it("has no accessibility violation, closed and open", SLOW, async () => {
    const { user } = renderApp({ start: openStart(), path: "/overview" });
    await screen.findByRole("button", { name: current });
    await expectAccessible(document.body, { page: true });
    await openMenu(user);
    await expectAccessible();
  });
});

describe("renaming the workspace", () => {
  async function startRename(handlers: Parameters<typeof renderApp>[0] = {}) {
    const app = renderApp({ start: openStart(), path: "/overview", ...handlers });
    const menu = await openMenu(app.user);
    await app.user.click(within(menu).getByRole("menuitem", { name: en.workspaces.rename }));
    const field = await screen.findByRole("textbox", { name: en.workspaces.nameLabel });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    return { ...app, field };
  }

  it("edits the name in place, in the top bar, with the old name ready to be replaced", async () => {
    const { field } = await startRename();
    expect(topBar()).toContainElement(field);
    expect(field).toHaveValue("Unit 573 piping");
    expect(field).toHaveAccessibleDescription(en.workspaces.renameHint);
    expect((field as HTMLInputElement).selectionStart).toBe(0);
    expect((field as HTMLInputElement).selectionEnd).toBe("Unit 573 piping".length);
    // The switcher gives its place to the field.
    expect(screen.queryByRole("button", { name: current })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves on Enter and says what was done", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Unit 573 piping, rev B{Enter}");
    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith({ name: "Unit 573 piping, rev B" });
    const trigger = await screen.findByRole("button", { name: named("Unit 573 piping, rev B") });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(en.workspaces.renamed.replace("{{name}}", "Unit 573 piping, rev B")),
    ).toBeInTheDocument();
  });

  it("cancels on Escape and calls no command", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Something else{Escape}");
    expect(rename).not.toHaveBeenCalled();
    const trigger = await screen.findByRole("button", { name: current });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("calls no command for a name that did not change", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user } = await startRename({ handlers: { workspace_rename: rename } });
    await user.keyboard("{Enter}");
    expect(rename).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: current })).toBeInTheDocument();
  });

  it("restores the old name on Undo", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Area 9{Enter}");
    await screen.findByRole("button", { name: named("Area 9") });

    await user.click(screen.getByRole("button", { name: en.common.undo }));
    expect(rename).toHaveBeenCalledTimes(2);
    expect(rename).toHaveBeenLastCalledWith({ name: "Unit 573 piping" });
    expect(await screen.findByRole("button", { name: current })).toBeInTheDocument();
    expect(
      await screen.findByText(en.workspaces.renamedBack.replace("{{name}}", "Unit 573 piping")),
    ).toBeInTheDocument();
  });

  it(
    "takes the undo away when another workspace is opened, and renames nothing after that",
    SLOW,
    async () => {
      const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
      const { user, field } = await startRename({
        handlers: {
          workspace_rename: rename,
          workspace_open: () => opened({ workspace: otherWorkspace }),
        },
      });
      await user.clear(field);
      await user.type(field, "Area 9{Enter}");
      const trigger = await screen.findByRole("button", { name: named("Area 9") });
      expect(screen.getByRole("button", { name: en.common.undo })).toBeInTheDocument();

      // Within the life of the toast, another workspace is opened.
      await user.click(trigger);
      const menu = await screen.findByRole("menu", { name: en.workspaces.switcher });
      await user.click(within(menu).getByRole("menuitem", { name: "Tank farm" }));
      await screen.findByRole("button", { name: named("Tank farm") });

      // The offer to undo belonged to the workspace that is no longer open: it is gone.
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: en.common.undo })).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText(en.workspaces.renamed.replace("{{name}}", "Area 9")),
      ).not.toBeInTheDocument();
      // Ctrl+Z finds nothing to undo, and Tank farm keeps its name.
      await user.keyboard("{Control>}z{/Control}");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(rename).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: named("Tank farm") })).toBeInTheDocument();
    },
  );

  it("saves a changed name when the field loses the focus, and leaves the focus where it went", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Area 9");
    const elsewhere = screen.getByRole("button", { name: en.shell.import });
    act(() => {
      elsewhere.focus();
    });
    await waitFor(() => {
      expect(rename).toHaveBeenCalledTimes(1);
    });
    expect(rename).toHaveBeenCalledWith({ name: "Area 9" });
    const trigger = await screen.findByRole("button", { name: named("Area 9") });
    await new Promise((resolve) => setTimeout(resolve, 30));
    // The user went elsewhere; the switcher does not pull the focus back.
    expect(trigger).not.toHaveFocus();
    expect(elsewhere).toHaveFocus();
    expect(
      screen.getByText(en.workspaces.renamed.replace("{{name}}", "Area 9")),
    ).toBeInTheDocument();
  });

  it("cancels when the field loses the focus with the name untouched", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    await startRename({ handlers: { workspace_rename: rename } });
    act(() => {
      screen.getByRole("button", { name: en.shell.import }).focus();
    });
    expect(await screen.findByRole("button", { name: current })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
  });

  it("has a cancel control beside the field, which keeps the old name and saves nothing", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Something else");
    const cancel = screen.getByRole("button", { name: en.workspaces.renameCancel });
    expect(topBar()).toContainElement(cancel);
    // The focus moves from the field to the control: that is not a reason to save.
    await user.click(cancel);
    expect(rename).not.toHaveBeenCalled();
    const trigger = await screen.findByRole("button", { name: current });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reaches the cancel control by Tab without saving", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Something else");
    await user.tab();
    expect(screen.getByRole("button", { name: en.workspaces.renameCancel })).toHaveFocus();
    expect(rename).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(rename).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: current })).toBeInTheDocument();
  });

  it("closes the field when the open workspace changes while the name is edited", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field, start } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Area 9");
    // Another workspace becomes the open one, as after an action that was already on its way.
    act(() => {
      queryClient.setQueryData<AppStart>(keys.start, {
        ...start,
        open: opened({ workspace: otherWorkspace }),
      });
    });
    expect(await screen.findByRole("button", { name: named("Tank farm") })).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: en.workspaces.nameLabel }),
    ).not.toBeInTheDocument();
    // The name that was typed belonged to the other workspace. It is not given to this one.
    expect(rename).not.toHaveBeenCalled();
  });

  it("clears the invalid mark as soon as the name is edited after a failed save", async () => {
    const rename = vi.fn<(args: { name: string }) => ReturnType<typeof workspace>>(() => {
      throw commandFailure("Io", "The workspace file could not be written (it is read-only).");
    });
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Area 9{Enter}");
    const alert = await screen.findByRole("alert");
    const still = screen.getByRole("textbox", { name: en.workspaces.nameLabel });
    expect(still).toHaveAttribute("aria-invalid", "true");

    await user.type(still, "0");
    expect(still).toHaveValue("Area 90");
    expect(still).not.toHaveAttribute("aria-invalid", "true");
    expect(still).toHaveAccessibleDescription(en.workspaces.renameHint);
    // What went wrong stays readable until the next try or until it is dismissed.
    expect(alert).toBeInTheDocument();
  });

  it("leaves the field in edit mode with the error when the rename fails", async () => {
    const message =
      "The workspace file could not be written (it is read-only). Remove the write protection from the file, then rename the workspace again.";
    const rename = vi
      .fn<(args: { name: string }) => ReturnType<typeof workspace>>()
      .mockImplementationOnce(() => {
        throw commandFailure("Io", message);
      })
      .mockImplementation(({ name }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.type(field, "Area 9{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.workspaces.renameError);
    expect(alert).toHaveTextContent(message);
    const still = screen.getByRole("textbox", { name: en.workspaces.nameLabel });
    expect(still).toHaveValue("Area 9");
    expect(still).toHaveAttribute("aria-invalid", "true");
    expect(still).toHaveFocus();
    expect(still.getAttribute("aria-describedby")?.split(" ")).toContain(alert.closest("[id]")?.id);

    // Trying again from the same field works, and the error goes.
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("button", { name: named("Area 9") })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks for a name when the field is empty", async () => {
    const rename = vi.fn(({ name }: { name: string }) => workspace({ name }));
    const { user, field } = await startRename({ handlers: { workspace_rename: rename } });
    await user.clear(field);
    await user.keyboard("{Enter}");
    expect(rename).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(en.workspaces.nameMissing);
    expect(screen.getByRole("textbox", { name: en.workspaces.nameLabel })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("has no accessibility violation while the name is edited", SLOW, async () => {
    await startRename();
    await expectAccessible(document.body, { page: true });
  });
});
