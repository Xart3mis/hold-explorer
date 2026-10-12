import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IMPORT_EXTENSIONS } from "../../api/files";
import { formatCount, formatDate, formatList } from "../../text/format";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { must, renderApp } from "../../test/app";
import {
  opened,
  openStart,
  otherWorkspace,
  startState,
  unreadable,
  workspace,
} from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { fileDrag, windowApi } from "../../test/window";

const names = en.destinations.name;

async function page() {
  await screen.findByRole("heading", { level: 1, name: en.workspaces.title });
  return screen.getByRole("main");
}

function withWorkspaces() {
  const base = startState();
  return startState({ list: { ...base.list, workspaces: [otherWorkspace, workspace()] } });
}

describe("the welcome page on a first run", () => {
  it("shows the drop zone, Open a file, and the demo workspace, and says what a workspace is", async () => {
    renderApp({ start: startState(), path: "/welcome" });
    const main = await page();
    expect(within(main).getByText(en.workspaces.descriptionFirst)).toBeInTheDocument();
    const zone = within(main).getByRole("group", { name: en.welcome.dropTitle });
    expect(within(zone).getByText(en.welcome.dropText)).toBeInTheDocument();
    // The formats shown are the ones the file dialog offers: both come from one constant.
    const types = within(zone).getByText(formatList(IMPORT_EXTENSIONS));
    expect(types.textContent.split(/,\s*/)).toEqual([...IMPORT_EXTENSIONS]);
    expect(within(zone).getByRole("button", { name: en.welcome.openFile })).toBeInTheDocument();
    expect(
      within(main).getByRole("heading", { level: 2, name: en.welcome.demoTitle }),
    ).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.welcome.demoOpen })).toBeInTheDocument();
    // Nothing to list yet.
    expect(within(main).queryByRole("grid")).not.toBeInTheDocument();
    expect(within(main).queryByText(en.workspaces.unreadableTitle)).not.toBeInTheDocument();
  });

  it("promises of the demo workspace only what this version shows", async () => {
    renderApp({ start: startState(), path: "/welcome" });
    const main = await page();
    // Seven of the nine destinations are not built: the demo gives data to Overview, not to "every screen".
    for (const said of [en.workspaces.descriptionFirst, en.welcome.demoText]) {
      expect(within(main).getByText(said)).toBeInTheDocument();
      expect(said).not.toMatch(/every screen/i);
      expect(said).toContain(names.overview);
      expect(said).toMatch(/try an import/);
    }
  });

  it("starts an import from Open a file", async () => {
    windowApi.chooseImportFile.mockResolvedValue("/exports/Holds.xlsx");
    const { user, router } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: { import_open: () => new Promise(() => undefined) },
    });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.welcome.openFile }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/import");
    });
    expect(router.state.location.state).toMatchObject({
      path: "/exports/Holds.xlsx",
      from: "/welcome",
    });
  });

  it("shows the drop zone as the target while a file is over the window", async () => {
    renderApp({ start: startState(), path: "/welcome" });
    const main = await page();
    fileDrag.enter(["/exports/Holds_2026-10-07.xlsx"]);
    const zone = await within(main).findByRole("group", { name: en.shell.dropTitle });
    expect(zone).toHaveAttribute("data-active");
    expect(zone).toHaveTextContent("Holds_2026-10-07.xlsx");
    fileDrag.leave();
    await within(main).findByRole("group", { name: en.welcome.dropTitle });
  });

  it("builds the demo workspace, says so while it runs, and lands on Overview", async () => {
    let finish: (value: ReturnType<typeof opened>) => void = () => undefined;
    const demoCreate = vi.fn(
      () =>
        new Promise<ReturnType<typeof opened>>((resolve) => {
          finish = resolve;
        }),
    );
    const demo = workspace({ id: "d0d0d0d0d0d0d0d0", name: "Demo", snapshot_count: 2 });
    const { user, router } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: { demo_create: demoCreate },
    });
    const main = await page();
    const button = within(main).getByRole("button", { name: en.welcome.demoOpen });
    await user.click(button);
    expect(demoCreate).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      within(main).getByRole("progressbar", { name: en.welcome.demoBuilding }),
    ).toBeInTheDocument();
    // A second press while it runs builds nothing more.
    await user.click(button);
    expect(demoCreate).toHaveBeenCalledTimes(1);

    finish(opened({ workspace: demo }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: names.overview }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${en.workspaces.switcher} Demo` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: en.destinations.label })).toBeInTheDocument();
  });

  it("shows why the demo workspace could not be built, and stays usable", async () => {
    const message =
      "The demo workspace could not be built. The folder /data/workspaces could not be written to (permission denied). Check the folder's permissions, then try again.";
    const { user, router } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: {
        demo_create: () => {
          throw commandFailure("Io", message);
        },
      },
    });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.welcome.demoOpen }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.welcome.demoError);
    expect(alert).toHaveTextContent(message);
    expect(router.state.location.pathname).toBe("/welcome");
    expect(within(main).getByRole("button", { name: en.welcome.demoOpen })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("has no accessibility violation", SLOW, async () => {
    renderApp({ start: startState(), path: "/welcome" });
    await page();
    await expectAccessible(document.body, { page: true });
  });
});

describe("the welcome page while an action runs", () => {
  it(
    "shows every control that opens a workspace as busy, and starts nothing more",
    SLOW,
    async () => {
      let finish: (value: ReturnType<typeof opened>) => void = () => undefined;
      const demoCreate = vi.fn(
        () =>
          new Promise<ReturnType<typeof opened>>((resolve) => {
            finish = resolve;
          }),
      );
      const open = vi.fn(() => opened());
      const { user, router } = renderApp({
        start: withWorkspaces(),
        path: "/welcome?new=1",
        handlers: { demo_create: demoCreate, workspace_open: open, workspace_create: open },
      });
      const main = await page();
      await user.click(within(main).getByRole("button", { name: en.welcome.demoOpen }));
      expect(demoCreate).toHaveBeenCalledTimes(1);

      const busy = [
        ...within(main).getAllByRole("button", { name: en.workspaces.open }),
        within(main).getByRole("button", { name: en.welcome.demoOpen }),
        within(main).getByRole("button", { name: en.workspaces.create }),
      ];
      expect(busy).toHaveLength(4);
      for (const control of busy) expect(control).toHaveAttribute("aria-busy", "true");

      // Neither a row, nor its button, nor the form starts a second action meanwhile.
      await user.click(within(main).getByRole("rowheader", { name: "Tank farm" }));
      await user.click(must(busy[0], "the Open button of the first row"));
      await user.type(
        within(main).getByRole("textbox", { name: en.workspaces.nameLabel }),
        "Unit 9{Enter}",
      );
      expect(open).not.toHaveBeenCalled();

      finish(opened({ workspace: workspace({ id: "d".repeat(16), name: "Demo" }) }));
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/overview");
      });
      expect(open).not.toHaveBeenCalled();
    },
  );
});

describe("the welcome page and the control that was pressed", () => {
  const spinners = (control: HTMLElement) => control.querySelectorAll("[data-part='spinner']");

  it(
    "shows the spinner on the demo button while the demo is built, and on no other control",
    SLOW,
    async () => {
      const { user } = renderApp({
        start: withWorkspaces(),
        path: "/welcome?new=1",
        handlers: { demo_create: () => new Promise<ReturnType<typeof opened>>(() => undefined) },
      });
      const main = await page();
      const demo = within(main).getByRole("button", { name: en.welcome.demoOpen });
      await user.click(demo);
      await waitFor(() => {
        expect(spinners(demo)).toHaveLength(1);
      });
      const waiting = [
        ...within(main).getAllByRole("button", { name: en.workspaces.open }),
        within(main).getByRole("button", { name: en.workspaces.create }),
      ];
      expect(waiting).toHaveLength(3);
      for (const control of waiting) {
        expect(control).toHaveAttribute("aria-busy", "true");
        expect(spinners(control)).toHaveLength(0);
        // It waits; it is not disabled, and it keeps its place in the Tab order.
        expect(control).not.toBeDisabled();
        expect(control).not.toHaveAttribute("data-disabled");
      }
      expect(spinners(main)).toHaveLength(1);
    },
  );

  it(
    "shows the spinner on the Open button of the row that is opened, and on no other",
    SLOW,
    async () => {
      const { user } = renderApp({
        start: withWorkspaces(),
        path: "/welcome",
        handlers: { workspace_open: () => new Promise<ReturnType<typeof opened>>(() => undefined) },
      });
      const main = await page();
      const [first, second] = within(main).getAllByRole("button", { name: en.workspaces.open });
      await user.click(must(second, "the Open button of the second row"));
      await waitFor(() => {
        expect(spinners(must(second, "the Open button of the second row"))).toHaveLength(1);
      });
      const other = must(first, "the Open button of the first row");
      expect(other).toHaveAttribute("aria-busy", "true");
      expect(spinners(other)).toHaveLength(0);
      const demo = within(main).getByRole("button", { name: en.welcome.demoOpen });
      expect(demo).toHaveAttribute("aria-busy", "true");
      expect(spinners(demo)).toHaveLength(0);
      expect(spinners(main)).toHaveLength(1);
    },
  );
});

describe("the welcome page with workspaces", () => {
  it("lists them with their snapshot counts and latest dates", async () => {
    renderApp({
      start: startState({
        list: {
          ...startState().list,
          workspaces: [
            otherWorkspace,
            workspace(),
            workspace({
              id: "e".repeat(16),
              name: "Empty",
              snapshot_count: 0,
              latest_taken_at: null,
            }),
          ],
        },
      }),
      path: "/welcome",
    });
    const main = await page();
    expect(within(main).getByText(en.workspaces.descriptionSome)).toBeInTheDocument();
    const grid = within(main).getByRole("grid", { name: en.workspaces.table });
    const headers = within(grid)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers.slice(0, 3)).toEqual([
      en.workspaces.columnName,
      en.workspaces.columnSnapshots,
      en.workspaces.columnLatest,
    ]);
    const rows = within(grid).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const cells = rows.map((row) =>
      [...within(row).getAllByRole("rowheader"), ...within(row).getAllByRole("gridcell")]
        .slice(0, 3)
        .map((cell) => cell.textContent),
    );
    expect(cells).toEqual([
      ["Tank farm", formatCount(5), formatDate("2026-09-23T07:30:00")],
      ["Unit 573 piping", formatCount(2), formatDate("2026-10-07T08:00:00")],
      ["Empty", formatCount(0), en.common.noValue],
    ]);
    // The ways in are still there, under the list.
    expect(within(main).getByRole("group", { name: en.welcome.dropTitle })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.welcome.demoOpen })).toBeInTheDocument();
  });

  it("opens a workspace when its row is activated, and lands on Overview", SLOW, async () => {
    const open = vi.fn(() => opened({ workspace: otherWorkspace }));
    const { user, router } = renderApp({
      start: withWorkspaces(),
      path: "/welcome",
      handlers: { workspace_open: open },
    });
    const main = await page();
    await user.click(within(main).getByRole("rowheader", { name: "Tank farm" }));
    expect(open).toHaveBeenCalledWith({ id: otherWorkspace.id });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    expect(
      await screen.findByRole("button", { name: `${en.workspaces.switcher} Tank farm` }),
    ).toBeInTheDocument();
  });

  it("opens a workspace by the keyboard: the arrow keys, then Enter", SLOW, async () => {
    const open = vi.fn(() => opened());
    const { user, router } = renderApp({
      start: withWorkspaces(),
      path: "/welcome",
      handlers: { workspace_open: open },
    });
    const main = await page();
    const rows = within(main).getAllByRole("row").slice(1);
    must(rows[0], "the first workspace").focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(open).toHaveBeenCalledWith({ id: workspace().id });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
  });

  it("opens a workspace from the Open button of its row", SLOW, async () => {
    const open = vi.fn(() => opened());
    const { user, router } = renderApp({
      start: withWorkspaces(),
      path: "/welcome",
      handlers: { workspace_open: open },
    });
    const main = await page();
    const row = must(
      within(main)
        .getByRole("rowheader", { name: "Unit 573 piping" })
        .closest<HTMLElement>('[role="row"]'),
      "the row of the workspace",
    );
    await user.click(within(row).getByRole("button", { name: en.workspaces.open }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ id: workspace().id });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
  });

  it("shows why a workspace could not be opened, and lets another be opened", SLOW, async () => {
    const message =
      "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.";
    const open = vi
      .fn<(args: { id: string }) => ReturnType<typeof opened>>()
      .mockImplementationOnce(() => {
        throw commandFailure("WorkspaceNotFound", message);
      })
      .mockImplementation(() => opened());
    const { user, router } = renderApp({
      start: withWorkspaces(),
      path: "/welcome",
      handlers: { workspace_open: open },
    });
    const main = await page();
    await user.click(within(main).getByRole("rowheader", { name: "Tank farm" }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.workspaces.openError);
    expect(alert).toHaveTextContent(message);
    expect(router.state.location.pathname).toBe("/welcome");

    await user.click(within(main).getByRole("rowheader", { name: "Unit 573 piping" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
  });

  it("marks the workspace that is open", async () => {
    renderApp({ start: openStart(), path: "/welcome" });
    const main = await page();
    const row = within(main).getByRole("rowheader", { name: /Unit 573 piping/ });
    expect(row).toHaveTextContent(en.workspaces.openTag);
    expect(within(main).getByRole("rowheader", { name: /Tank farm/ })).not.toHaveTextContent(
      en.workspaces.openTag,
    );
  });

  it("has no accessibility violation", SLOW, async () => {
    renderApp({ start: openStart(), path: "/welcome" });
    await page();
    await expectAccessible(document.body, { page: true });
  });
});

describe("workspace files that cannot be read", () => {
  const start = () => {
    const base = withWorkspaces();
    return { ...base, list: { ...base.list, unreadable: [unreadable] } };
  };

  it("are listed apart with the reason, and do not hide the readable ones", async () => {
    renderApp({ start: start(), path: "/welcome" });
    const main = await page();
    const section = within(main).getByRole("region", { name: en.workspaces.unreadableTitle });
    expect(within(section).getByText(en.workspaces.unreadableText)).toBeInTheDocument();
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent(unreadable.file_name);
    expect(items[0]).toHaveTextContent(unreadable.message);
    // The readable workspaces are all there, and are not inside that section.
    const grid = within(main).getByRole("grid", { name: en.workspaces.table });
    expect(within(grid).getAllByRole("row").slice(1)).toHaveLength(2);
    expect(section).not.toContainElement(grid);
  });

  it("shows the file in its folder", async () => {
    const { user } = renderApp({ start: start(), path: "/welcome" });
    const main = await page();
    const section = within(main).getByRole("region", { name: en.workspaces.unreadableTitle });
    await user.click(within(section).getByRole("button", { name: en.common.showInFolder }));
    expect(windowApi.showInFolder).toHaveBeenCalledWith(unreadable.path);
  });

  it("says why the folder could not be shown", async () => {
    windowApi.showInFolder.mockRejectedValue("No file manager is installed.");
    const { user } = renderApp({ start: start(), path: "/welcome" });
    const main = await page();
    const section = within(main).getByRole("region", { name: en.workspaces.unreadableTitle });
    await user.click(within(section).getByRole("button", { name: en.common.showInFolder }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.shell.folderError);
    expect(alert).toHaveTextContent("No file manager is installed.");
  });

  it("are shown on a first run too, under the ways in", async () => {
    const base = startState();
    renderApp({
      start: { ...base, list: { ...base.list, unreadable: [unreadable] } },
      path: "/welcome",
    });
    const main = await page();
    expect(
      within(main).getByRole("region", { name: en.workspaces.unreadableTitle }),
    ).toBeInTheDocument();
    expect(within(main).getByRole("group", { name: en.welcome.dropTitle })).toBeInTheDocument();
  });

  it("have no accessibility violation", SLOW, async () => {
    renderApp({ start: start(), path: "/welcome" });
    await page();
    await expectAccessible(document.body, { page: true });
  });
});

describe("a workspaces folder that cannot be read", () => {
  const message =
    "The folder /mnt/share/workspaces could not be read (permission denied). Check that the drive is connected and that you may read the folder.";
  const start = () => {
    const base = startState();
    return startState({
      list: { ...base.list, folder: "/mnt/share/workspaces" },
      list_error: { kind: "Io", message },
    });
  };

  it("is shown with the folder, the reason, and what to do, and does not block the page", async () => {
    renderApp({ start: start(), path: "/welcome" });
    const main = await page();
    const alert = within(main).getByRole("alert");
    expect(alert).toHaveTextContent(en.workspaces.listError);
    expect(alert).toHaveTextContent(
      en.workspaces.listErrorFolder.replace("{{folder}}", "/mnt/share/workspaces"),
    );
    expect(alert).toHaveTextContent(message);
    expect(within(main).getByRole("group", { name: en.welcome.dropTitle })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.welcome.demoOpen })).toBeInTheDocument();
  });

  it("reads the folder again on Try again and lists what it then finds", async () => {
    const base = startState();
    const list = vi.fn(() => ({
      ...base.list,
      folder: "/mnt/share/workspaces",
      workspaces: [workspace()],
    }));
    const { user } = renderApp({
      start: start(),
      path: "/welcome",
      handlers: { workspace_list: list },
    });
    const main = await page();
    await user.click(
      within(within(main).getByRole("alert")).getByRole("button", { name: en.common.retry }),
    );
    expect(list).toHaveBeenCalledTimes(1);
    expect(
      await within(main).findByRole("rowheader", { name: "Unit 573 piping" }),
    ).toBeInTheDocument();
    expect(within(main).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the error when the folder still cannot be read", async () => {
    const again =
      "The folder /mnt/share/workspaces could not be read (the drive is not connected). Connect the drive, then try again.";
    const { user } = renderApp({
      start: start(),
      path: "/welcome",
      handlers: {
        workspace_list: () => {
          throw commandFailure("Io", again);
        },
      },
    });
    const main = await page();
    await user.click(
      within(within(main).getByRole("alert")).getByRole("button", { name: en.common.retry }),
    );
    await waitFor(() => {
      expect(within(main).getByRole("alert")).toHaveTextContent(again);
    });
  });

  it("shows the folder in the file manager", async () => {
    const { user } = renderApp({ start: start(), path: "/welcome" });
    const main = await page();
    await user.click(
      within(within(main).getByRole("alert")).getByRole("button", { name: en.common.showInFolder }),
    );
    expect(windowApi.showInFolder).toHaveBeenCalledWith("/mnt/share/workspaces");
  });
});

describe("creating a workspace on the welcome page", () => {
  it("asks for the name on the page, creates the workspace, and opens it", async () => {
    const created = workspace({
      id: "c".repeat(16),
      name: "Unit 580 piping",
      snapshot_count: 0,
      latest_taken_at: null,
    });
    const create = vi.fn(() => opened({ workspace: created, snapshots: [], selected: null }));
    const { user, router } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: { workspace_create: create },
    });
    const main = await page();
    expect(within(main).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(within(main).getByRole("button", { name: en.workspaces.new }));
    // An inline form on the page, not a dialog.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const field = await within(main).findByRole("textbox", { name: en.workspaces.nameLabel });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.type(field, "Unit 580 piping");
    await user.click(within(main).getByRole("button", { name: en.workspaces.create }));
    expect(create).toHaveBeenCalledWith({ name: "Unit 580 piping" });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/overview");
    });
    expect(
      await screen.findByRole("button", { name: `${en.workspaces.switcher} Unit 580 piping` }),
    ).toBeInTheDocument();
  });

  it("creates on Enter and closes the form on Escape", async () => {
    const create = vi.fn(() => opened());
    const { user } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: { workspace_create: create },
    });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.workspaces.new }));
    const field = await within(main).findByRole("textbox", { name: en.workspaces.nameLabel });
    await user.type(field, "Nothing{Escape}");
    expect(within(main).queryByRole("textbox")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(within(main).getByRole("button", { name: en.workspaces.new })).toHaveFocus();
    });

    await user.click(within(main).getByRole("button", { name: en.workspaces.new }));
    await user.type(
      await within(main).findByRole("textbox", { name: en.workspaces.nameLabel }),
      "Unit 581{Enter}",
    );
    expect(create).toHaveBeenCalledWith({ name: "Unit 581" });
  });

  it("asks for a name when none was typed, and calls no command", async () => {
    const create = vi.fn(() => opened());
    const { user } = renderApp({
      start: startState(),
      path: "/welcome",
      handlers: { workspace_create: create },
    });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.workspaces.new }));
    const field = await within(main).findByRole("textbox", { name: en.workspaces.nameLabel });
    await user.type(field, "   {Enter}");
    expect(create).not.toHaveBeenCalled();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(en.workspaces.nameMissing);
  });

  it("shows the error of a failed create with its fix, and keeps the form", async () => {
    const message =
      "The workspace file could not be created in /data/workspaces (the disk is full). Free some space, then create the workspace again.";
    const { user, router } = renderApp({
      start: startState(),
      path: "/welcome?new=1",
      handlers: {
        workspace_create: () => {
          throw commandFailure("Io", message);
        },
      },
    });
    const main = await page();
    const field = await within(main).findByRole("textbox", { name: en.workspaces.nameLabel });
    await user.type(field, "Unit 580 piping{Enter}");
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.workspaces.createError);
    expect(alert).toHaveTextContent(message);
    expect(field).toHaveValue("Unit 580 piping");
    expect(router.state.location.pathname).toBe("/welcome");
  });

  it("has no accessibility violation with the form open", SLOW, async () => {
    renderApp({ start: startState(), path: "/welcome?new=1" });
    const main = await page();
    await within(main).findByRole("textbox", { name: en.workspaces.nameLabel });
    await expectAccessible(document.body, { page: true });
  });
});
