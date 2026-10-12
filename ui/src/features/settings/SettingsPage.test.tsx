import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../bindings/Settings";
import type { Theme } from "../../bindings/Theme";
import { applyTheme } from "../../design/theme";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { renderApp } from "../../test/app";
import { openStart, startState } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";

const root = document.documentElement;
const settings = (theme: Theme): Settings => ({ theme, workspace_dir: null, last_workspace: null });

afterEach(() => {
  applyTheme("Dark");
  root.removeAttribute("data-theme");
});

async function page() {
  await screen.findByRole("heading", { level: 1, name: en.destinations.name.settings });
  return screen.getByRole("main");
}

async function choose(user: ReturnType<typeof renderApp>["user"], label: string) {
  await user.click(
    within(await page()).getByRole("button", { name: new RegExp(en.settings.theme) }),
  );
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("SettingsPage", () => {
  it("shows the theme, the workspaces folder, and the version", async () => {
    renderApp({ start: openStart(), path: "/settings" });
    const main = await page();
    const theme = within(main).getByRole("button", { name: new RegExp(en.settings.theme) });
    expect(theme).toHaveTextContent(en.settings.themeDark);
    expect(within(main).getByText(en.settings.themeHelp)).toBeInTheDocument();
    expect(within(main).getByText(en.settings.folder)).toBeInTheDocument();
    expect(
      within(main).getByText("/home/ada/.local/share/hold-explorer/workspaces"),
    ).toBeInTheDocument();
    expect(within(main).getByText(en.settings.version)).toBeInTheDocument();
    expect(within(main).getByText("0.1.0")).toBeInTheDocument();
    // A destination has no breadcrumb.
    expect(screen.queryByRole("navigation", { name: en.breadcrumb.label })).not.toBeInTheDocument();
  });

  it("offers Dark, Light, and System", async () => {
    const { user } = renderApp({ start: openStart(), path: "/settings" });
    await user.click(
      within(await page()).getByRole("button", { name: new RegExp(en.settings.theme) }),
    );
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      en.settings.themeDark,
      en.settings.themeLight,
      en.settings.themeSystem,
    ]);
  });

  it("applies a theme at once, saves it, and shows the saved value", SLOW, async () => {
    const setTheme = vi.fn(({ theme }: { theme: Theme }) => settings(theme));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_theme: setTheme },
    });
    await page();
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "dark");
    });
    await choose(user, en.settings.themeLight);
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith({ theme: "Light" });
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "light");
    });
    expect(screen.getByRole("button", { name: new RegExp(en.settings.theme) })).toHaveTextContent(
      en.settings.themeLight,
    );

    await choose(user, en.settings.themeDark);
    expect(setTheme).toHaveBeenLastCalledWith({ theme: "Dark" });
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "dark");
    });
  });

  it("resolves System to the theme of the operating system", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("light"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_theme: ({ theme }) => settings(theme) },
    });
    await choose(user, en.settings.themeSystem);
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "light");
    });
    expect(screen.getByRole("button", { name: new RegExp(en.settings.theme) })).toHaveTextContent(
      en.settings.themeSystem,
    );
    vi.unstubAllGlobals();
  });

  it("puts the theme back and says why when it could not be saved", async () => {
    const message =
      "The settings file could not be written (permission denied). Check that the folder can be written to, then choose the theme again.";
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_theme: () => {
          throw commandFailure("Settings", message);
        },
      },
    });
    await choose(user, en.settings.themeLight);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.settings.themeError);
    expect(alert).toHaveTextContent(message);
    await waitFor(() => {
      expect(root).toHaveAttribute("data-theme", "dark");
    });
    expect(screen.getByRole("button", { name: new RegExp(en.settings.theme) })).toHaveTextContent(
      en.settings.themeDark,
    );
  });

  it("shows the workspaces folder in the file manager", async () => {
    const { user } = renderApp({ start: openStart(), path: "/settings" });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.common.showInFolder }));
    expect(windowApi.showInFolder).toHaveBeenCalledWith(
      "/home/ada/.local/share/hold-explorer/workspaces",
    );
  });

  it("says why the folder could not be shown", async () => {
    windowApi.showInFolder.mockRejectedValue(new Error("The folder does not exist yet."));
    const { user } = renderApp({ start: openStart(), path: "/settings" });
    const main = await page();
    await user.click(within(main).getByRole("button", { name: en.common.showInFolder }));
    const alert = await within(main).findByRole("alert");
    expect(alert).toHaveTextContent(en.shell.folderError);
    expect(alert).toHaveTextContent("The folder does not exist yet.");
  });

  it("works without a workspace", async () => {
    renderApp({ start: startState(), path: "/settings" });
    const main = await page();
    expect(
      within(main).getByRole("button", { name: new RegExp(en.settings.theme) }),
    ).toBeInTheDocument();
  });

  it("has no accessibility violation", SLOW, async () => {
    const { user } = renderApp({ start: openStart(), path: "/settings" });
    await page();
    await expectAccessible(document.body, { page: true });
    await user.click(screen.getByRole("button", { name: new RegExp(en.settings.theme) }));
    await screen.findAllByRole("option");
    await expectAccessible();
  });
});
