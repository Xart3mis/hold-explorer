import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppStart } from "../../bindings/AppStart";
import type { FolderCheck } from "../../bindings/FolderCheck";
import type { FolderMoved } from "../../bindings/FolderMoved";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { renderApp } from "../../test/app";
import { openStart, opened } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";

const OLD = "/home/ada/.local/share/hold-explorer/workspaces";
const NEW = "/mnt/projects/5359/hold-explorer";
const TAKEN =
  "a1b2c3d4e5f60718.holdx-ws was left in /home/ada/.local/share/hold-explorer/workspaces, because a file of that name is already in /mnt/projects/5359/hold-explorer. Rename or remove one of the two, then move the file there by hand.";

const checked: FolderCheck = {
  path: NEW,
  movable: ["a1b2c3d4e5f60718.holdx-ws", "b2c3d4e5f6071829.holdx-ws", "c3d4e5f607182930.holdx-ws"],
};

/** The answer of a change to `NEW`: the start the Rust side has then, and what moved. */
function movedTo(start: AppStart, moveFiles: boolean): FolderMoved {
  return {
    start: {
      ...start,
      settings: { ...start.settings, workspace_dir: NEW },
      list: { ...start.list, folder: NEW },
      open: opened(),
    },
    moved: moveFiles ? ["b2c3d4e5f6071829.holdx-ws", "c3d4e5f607182930.holdx-ws"] : [],
    left: moveFiles
      ? [
          {
            file_name: "a1b2c3d4e5f60718.holdx-ws",
            path: `${OLD}/a1b2c3d4e5f60718.holdx-ws`,
            kind: "NameTaken",
            message: TAKEN,
          },
        ]
      : [],
  };
}

async function page() {
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
  return screen.getByRole("main");
}

const moveTitle = "Move 3 workspaces to the new folder?";

/** A promise the test settles, and the function that settles it. */
function later<T>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe("The workspaces folder in Settings", () => {
  it("shows the folder with Change folder and Show in folder, and the default only when another is in use", async () => {
    const { unmount } = renderApp({ start: openStart(), path: "/settings" });
    const main = await page();
    expect(within(main).getByText(OLD)).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: en.settings.folderChange })).toBeEnabled();
    expect(within(main).getByRole("button", { name: en.common.showInFolder })).toBeEnabled();
    expect(
      within(main).queryByRole("button", { name: en.settings.folderDefault }),
    ).not.toBeInTheDocument();
    unmount();

    const start = openStart();
    renderApp({
      start: {
        ...start,
        settings: { ...start.settings, workspace_dir: NEW },
        list: { ...start.list, folder: NEW },
      },
      path: "/settings",
    });
    const other = await page();
    expect(within(other).getByText(NEW)).toBeInTheDocument();
    expect(within(other).getByRole("button", { name: en.settings.folderDefault })).toBeEnabled();
  });

  it(
    "checks the chosen folder, offers the move, and reports what moved and what was left, by keyboard",
    SLOW,
    async () => {
      windowApi.chooseFolder.mockResolvedValue(NEW);
      const check = vi.fn(() => checked);
      const answer = later<FolderMoved>();
      const setFolder = vi.fn(() => answer.promise);
      const start = openStart();
      const { user } = renderApp({
        start,
        path: "/settings",
        handlers: { check_workspace_folder: check, set_workspace_folder: setFolder },
      });
      const main = await page();
      within(main).getByRole("button", { name: en.settings.folderChange }).focus();
      await user.keyboard("{Enter}");

      expect(await screen.findByText(moveTitle)).toBeInTheDocument();
      expect(check).toHaveBeenCalledWith({ path: NEW });
      // The keyboard is taken into the notice, to its first choice.
      const moveThem = screen.getByRole("button", { name: en.settings.folderMoveThem });
      expect(moveThem).toHaveFocus();
      expect(screen.getByRole("button", { name: en.settings.folderLeaveThem })).toBeInTheDocument();
      await expectAccessible(document.body, { page: true });

      await user.keyboard("{Enter}");
      expect(setFolder).toHaveBeenCalledWith({ path: NEW, moveFiles: true });
      // While the files move, the row shows it and the rest of the settings wait.
      expect(
        await screen.findByRole("progressbar", { name: `Moving the workspaces to ${NEW}` }),
      ).toBeInTheDocument();
      expect(screen.getByText(en.settings.folderWaiting)).toBeInTheDocument();
      const theme = screen.getByRole("button", { name: new RegExp(en.settings.theme) });
      expect(theme.closest("[inert]")).not.toBeNull();
      expect(screen.getByRole("button", { name: en.settings.folderChange })).toHaveAttribute(
        "aria-busy",
        "true",
      );

      answer.settle(movedTo(start, true));
      expect(await screen.findByText(`Moved 2 workspace files to ${NEW}`)).toBeInTheDocument();
      const moved = screen.getByRole("list", { name: en.settings.folderMovedList });
      expect(
        within(moved)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["b2c3d4e5f6071829.holdx-ws", "c3d4e5f607182930.holdx-ws"]);
      const left = screen.getByRole("list", { name: en.settings.folderLeftList });
      expect(within(left).getByText("a1b2c3d4e5f60718.holdx-ws")).toBeInTheDocument();
      expect(within(left).getByText(TAKEN)).toBeInTheDocument();
      // The page shows the folder the answer names, and the rest of the settings are back.
      expect(within(main).getAllByText(NEW).length).toBeGreaterThan(0);
      expect(theme.closest("[inert]")).toBeNull();
      await expectAccessible(document.body, { page: true });

      await user.click(screen.getByRole("button", { name: en.common.dismiss }));
      expect(screen.queryByText(`Moved 2 workspace files to ${NEW}`)).not.toBeInTheDocument();
    },
  );

  it("leaves the files where they are when asked to", async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const setFolder = vi.fn(() => movedTo(start, false));
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: { check_workspace_folder: () => checked, set_workspace_folder: setFolder },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderLeaveThem }));
    expect(setFolder).toHaveBeenCalledWith({ path: NEW, moveFiles: false });
    expect(await screen.findByText(`The workspaces are now kept in ${NEW}`)).toBeInTheDocument();
  });

  it("changes nothing on Cancel, and nothing when the dialog is cancelled", async () => {
    const check = vi.fn(() => checked);
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { check_workspace_folder: check },
    });
    await page();
    // The dialog was cancelled.
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await waitFor(() => {
      expect(windowApi.chooseFolder).toHaveBeenCalledTimes(1);
    });
    expect(check).not.toHaveBeenCalled();

    windowApi.chooseFolder.mockResolvedValue(NEW);
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.common.cancel }));
    expect(screen.queryByText(moveTitle)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.settings.folderChange })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("says why a folder was refused", async () => {
    windowApi.chooseFolder.mockResolvedValue(OLD);
    const refused =
      "The workspaces are already kept in /home/ada/.local/share/hold-explorer/workspaces. Choose another folder to keep them in.";
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        check_workspace_folder: () => {
          throw commandFailure("SameFolder", refused);
        },
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.settings.folderNotChanged);
    expect(alert).toHaveTextContent(refused);
  });

  it("checks the default folder, offers the move with its count, and sends no folder for it", async () => {
    const start = openStart();
    const custom: AppStart = {
      ...start,
      settings: { ...start.settings, workspace_dir: NEW },
      list: { ...start.list, folder: NEW },
    };
    const setFolder = vi.fn(() => ({
      start,
      moved: ["a1b2c3d4e5f60718.holdx-ws"],
      left: [],
    }));
    const check = vi.fn(() => ({ path: OLD, movable: ["a1b2c3d4e5f60718.holdx-ws"] }));
    const { user } = renderApp({
      start: custom,
      path: "/settings",
      handlers: { check_workspace_folder: check, set_workspace_folder: setFolder },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderDefault }));
    expect(await screen.findByText("Move 1 workspace to the default folder?")).toBeInTheDocument();
    expect(check).toHaveBeenCalledWith({ path: null });
    expect(screen.getByRole("button", { name: en.settings.folderMoveThem })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: en.settings.folderMoveThem }));
    expect(setFolder).toHaveBeenCalledWith({ path: null, moveFiles: true });
    expect(await screen.findByText(`Moved 1 workspace file to ${OLD}`)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: en.settings.folderDefault }),
    ).not.toBeInTheDocument();
  });

  it("keeps showing the move when the page is pressed again in the sidebar", SLOW, async () => {
    windowApi.chooseFolder.mockResolvedValue(NEW);
    const answer = later<FolderMoved>();
    const start = openStart();
    const { user } = renderApp({
      start,
      path: "/settings",
      handlers: {
        check_workspace_folder: () => checked,
        set_workspace_folder: () => answer.promise,
      },
    });
    await page();
    await user.click(screen.getByRole("button", { name: en.settings.folderChange }));
    await user.click(await screen.findByRole("button", { name: en.settings.folderMoveThem }));
    await screen.findByRole("progressbar");
    // Pressing the current item remounts the page.
    await user.click(screen.getByRole("link", { name: en.destinations.name.settings }));
    await page();
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    answer.settle(movedTo(start, true));
    expect(await screen.findByText(`Moved 2 workspace files to ${NEW}`)).toBeInTheDocument();
  });
});
