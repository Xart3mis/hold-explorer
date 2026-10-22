import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../bindings/Settings";
import type { Density } from "../../bindings/Density";
import type { Theme } from "../../bindings/Theme";
import { applyDensity } from "../../design/density";
import { applyTheme } from "../../design/theme";
import en from "../../locales/en.json";
import { expectAccessible } from "../../test/axe";
import { renderApp } from "../../test/app";
import { openStart, startState } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { SLOW } from "../../test/slow";
import { windowApi } from "../../test/window";

const root = document.documentElement;
const settings = (theme: Theme): Settings => ({
  theme,
  density: "Comfortable",
  author_name: "",
  workspace_dir: null,
  last_workspace: null,
});

afterEach(() => {
  applyTheme("Dark");
  root.removeAttribute("data-theme");
  applyDensity("Comfortable");
  root.removeAttribute("data-density");
});

const TOO_LONG =
  "The name is longer than 80 characters, so it was not saved. Shorten it, then save it again.";

const withSettings = (changes: Partial<Settings>): Settings => ({
  ...settings("Dark"),
  ...changes,
});

const densityButton = () => screen.getByRole("button", { name: new RegExp(en.settings.density) });
const nameField = () => screen.getByRole("textbox", { name: en.settings.authorName });

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

describe("the density", () => {
  it("offers Comfortable and Compact, and shows the saved one", async () => {
    const { user } = renderApp({ start: openStart(), path: "/settings" });
    await page();
    expect(densityButton()).toHaveTextContent(en.settings.densityComfortable);
    await user.click(densityButton());
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      en.settings.densityComfortable,
      en.settings.densityCompact,
    ]);
  });

  it("applies a density at once, saves it, and shows the saved value", SLOW, async () => {
    const setDensity = vi.fn(({ density }: { density: Density }) => withSettings({ density }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_density: setDensity },
    });
    await page();
    await waitFor(() => {
      expect(root).toHaveAttribute("data-density", "comfortable");
    });
    await user.click(densityButton());
    await user.click(await screen.findByRole("option", { name: en.settings.densityCompact }));
    expect(setDensity).toHaveBeenCalledTimes(1);
    expect(setDensity).toHaveBeenCalledWith({ density: "Compact" });
    await waitFor(() => {
      expect(root).toHaveAttribute("data-density", "compact");
    });
    expect(densityButton()).toHaveTextContent(en.settings.densityCompact);
  });

  it("starts in the saved density", async () => {
    const start = openStart();
    renderApp({
      start: { ...start, settings: { ...start.settings, density: "Compact" } },
      path: "/settings",
    });
    await page();
    await waitFor(() => {
      expect(root).toHaveAttribute("data-density", "compact");
    });
    expect(densityButton()).toHaveTextContent(en.settings.densityCompact);
  });

  it("puts the density back and says why when it could not be saved", async () => {
    const message =
      "The settings file could not be written (permission denied). Check that the folder can be written to, then choose the density again.";
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_density: () => {
          throw commandFailure("Settings", message);
        },
      },
    });
    await page();
    await user.click(densityButton());
    await user.click(await screen.findByRole("option", { name: en.settings.densityCompact }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.settings.densityError);
    expect(alert).toHaveTextContent(message);
    await waitFor(() => {
      expect(root).toHaveAttribute("data-density", "comfortable");
    });
    expect(densityButton()).toHaveTextContent(en.settings.densityComfortable);
  });
});

describe("the author name", () => {
  it("shows the saved name", async () => {
    const start = openStart();
    renderApp({
      start: { ...start, settings: { ...start.settings, author_name: "Ada Lovelace" } },
      path: "/settings",
    });
    await page();
    expect(nameField()).toHaveValue("Ada Lovelace");
    expect(screen.getByText(en.settings.authorNameHelp)).toBeInTheDocument();
  });

  it("saves on blur and not while typing", async () => {
    const setName = vi.fn(({ name }: { name: string }) => withSettings({ author_name: name }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_author_name: setName },
    });
    await page();
    await user.type(nameField(), "Ada Lovelace");
    expect(setName).not.toHaveBeenCalled();
    await user.tab();
    await waitFor(() => {
      expect(setName).toHaveBeenCalledTimes(1);
    });
    expect(setName).toHaveBeenCalledWith({ name: "Ada Lovelace" });
  });

  it("saves on Enter, once, and sends the name trimmed", async () => {
    const setName = vi.fn(({ name }: { name: string }) => withSettings({ author_name: name }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_author_name: setName },
    });
    await page();
    await user.type(nameField(), "  Ada Lovelace {Enter}");
    await waitFor(() => {
      expect(setName).toHaveBeenCalledTimes(1);
    });
    expect(setName).toHaveBeenCalledWith({ name: "Ada Lovelace" });
    await waitFor(() => {
      expect(nameField()).toHaveValue("Ada Lovelace");
    });
    // Leaving the field afterwards has nothing more to save.
    await user.tab();
    expect(setName).toHaveBeenCalledTimes(1);
  });

  it("saves the name without the spaces around it and shows it that way", async () => {
    const setName = vi.fn(({ name }: { name: string }) => withSettings({ author_name: name }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_author_name: setName },
    });
    await page();
    await user.type(nameField(), "  Ada  {Enter}");
    await waitFor(() => {
      expect(setName).toHaveBeenCalledTimes(1);
    });
    expect(setName).toHaveBeenCalledWith({ name: "Ada" });
    await waitFor(() => {
      expect(nameField()).toHaveValue("Ada");
    });
  });

  it("saves nothing when the name was not changed", async () => {
    const setName = vi.fn(({ name }: { name: string }) => withSettings({ author_name: name }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_author_name: setName },
    });
    await page();
    await user.click(nameField());
    await user.tab();
    expect(setName).not.toHaveBeenCalled();
  });

  it("saves the name when the Settings item of the sidebar is pressed", async () => {
    const setName = vi.fn(({ name }: { name: string }) => withSettings({ author_name: name }));
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: { settings_set_author_name: setName },
    });
    await page();
    await user.type(nameField(), "Ada Lovelace");
    // Pressing the current item remounts the page; what was typed must not be lost with it.
    await user.click(screen.getByRole("link", { name: en.destinations.name.settings }));
    await waitFor(() => {
      expect(setName).toHaveBeenCalledTimes(1);
    });
    expect(setName).toHaveBeenCalledWith({ name: "Ada Lovelace" });
    await page();
    await waitFor(() => {
      expect(nameField()).toHaveValue("Ada Lovelace");
    });
  });

  it("says inline why a name could not be saved and keeps the text", async () => {
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_author_name: () => {
          throw commandFailure("Settings", TOO_LONG);
        },
      },
    });
    await page();
    await user.type(nameField(), "x".repeat(81));
    await user.tab();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(nameField()).toHaveValue("x".repeat(81));
    expect(nameField()).toBeInvalid();
    // Leaving the field again tries again, since the first try did not save.
    await user.click(nameField());
    await user.tab();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
  });

  it("reports a failed save as a toast when the page was left before it failed", async () => {
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_author_name: () => {
          throw commandFailure("Settings", TOO_LONG);
        },
      },
    });
    await page();
    await user.type(nameField(), "Ada Lovelace");
    await user.click(screen.getByRole("link", { name: en.destinations.name.settings }));
    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Ada Lovelace");
    expect(toast).toHaveTextContent(TOO_LONG);
  });

  it("shows no toast for a failed save while the page is there", async () => {
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_author_name: () => {
          throw commandFailure("Settings", TOO_LONG);
        },
      },
    });
    await page();
    await user.type(nameField(), "Ada");
    await user.tab();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("Ada");
  });

  it("clears the error when a retry saves the name", async () => {
    let fail = true;
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_author_name: ({ name }: { name: string }) => {
          if (fail) throw commandFailure("Settings", TOO_LONG);
          return withSettings({ author_name: name });
        },
      },
    });
    await page();
    await user.type(nameField(), "Ada");
    await user.tab();
    expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
    fail = false;
    await user.click(nameField());
    await user.tab();
    await waitFor(() => {
      expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
    });
    expect(nameField()).not.toBeInvalid();
  });

  it("shows on the field that a save is on its way", async () => {
    let release: (value: Settings) => void = () => undefined;
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_author_name: () =>
          new Promise<Settings>((resolve) => {
            release = resolve;
          }),
      },
    });
    await page();
    await user.type(nameField(), "Ada{Enter}");
    expect(await screen.findByText(en.common.loading)).toBeInTheDocument();
    release(withSettings({ author_name: "Ada" }));
    await waitFor(() => {
      expect(screen.queryByText(en.common.loading)).not.toBeInTheDocument();
    });
  });

  it("has no accessibility violation, with an error showing", SLOW, async () => {
    const { user } = renderApp({
      start: openStart(),
      path: "/settings",
      handlers: {
        settings_set_author_name: () => {
          throw commandFailure("Settings", TOO_LONG);
        },
      },
    });
    await page();
    await expectAccessible(document.body, { page: true });
    await user.type(nameField(), "x");
    await user.tab();
    await screen.findByText(TOO_LONG);
    await expectAccessible(document.body, { page: true });
  });
});
