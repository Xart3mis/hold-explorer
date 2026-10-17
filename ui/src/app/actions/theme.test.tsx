import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Settings } from "../../bindings/Settings";
import type { Theme } from "../../bindings/Theme";
import { held, loaded } from "../../test/actions";
import { openStart } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { useThemeSetting } from "./theme";

const settings = (theme: Theme): Settings => ({ theme, workspace_dir: null, last_workspace: null });

describe("changing the theme", () => {
  it("keeps the second of two changes when the first fails after the second was asked for", async () => {
    const set = held<Settings>();
    const { result } = await loaded(useThemeSetting, { settings_set_theme: set.handler });
    act(() => {
      result.current.setTheme.mutate("Light");
      result.current.setTheme.mutate("System");
    });
    // The latest choice shows at once.
    await waitFor(() => {
      expect(result.current.start?.settings.theme).toBe("System");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    // The failure of the first does not take the second away.
    expect(result.current.start?.settings.theme).toBe("System");
    set.waiting[1]?.resolve(settings("System"));
    await waitFor(() => {
      expect(result.current.setTheme.isSuccess).toBe(true);
    });
    expect(result.current.start?.settings.theme).toBe("System");
  });

  it("goes back to the last saved theme when both of two changes fail", async () => {
    const set = held<Settings>();
    const { result } = await loaded(useThemeSetting, { settings_set_theme: set.handler });
    act(() => {
      result.current.setTheme.mutate("Light");
      result.current.setTheme.mutate("System");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    set.waiting[1]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(result.current.setTheme.isError).toBe(true);
    });
    // Dark is what the settings file holds; Light was never saved.
    expect(result.current.start?.settings.theme).toBe("Dark");
  });

  it("keeps the later choice on screen when the first of two changes succeeds first", async () => {
    const set = held<Settings>();
    const { result } = await loaded(useThemeSetting, { settings_set_theme: set.handler });
    act(() => {
      result.current.setTheme.mutate("Light");
      result.current.setTheme.mutate("System");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.resolve(settings("Light"));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    expect(result.current.start?.settings.theme).toBe("System");
    // Light is saved now, so that is where a failure of the second goes back to.
    set.waiting[1]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(result.current.setTheme.isError).toBe(true);
    });
    expect(result.current.start?.settings.theme).toBe("Light");
  });

  describe("from one test to the next", () => {
    // The two tests run in this order. The first ends with a change on its way; the setup of the
    // tests must not let the next one count that change as its own.
    it("ends with a change of the theme on its way", async () => {
      const set = held<Settings>();
      const { result } = await loaded(useThemeSetting, { settings_set_theme: set.handler });
      act(() => {
        result.current.setTheme.mutate("Light");
      });
      await waitFor(() => {
        expect(set.handler).toHaveBeenCalledTimes(1);
      });
    });

    it("goes back to its own saved theme after a test that left a change on its way", async () => {
      const start = openStart();
      const { result } = await loaded(useThemeSetting, {
        app_start: () => ({ ...start, settings: { ...start.settings, theme: "System" } }),
        settings_set_theme: () => {
          throw commandFailure("Settings", "The settings file could not be written.");
        },
      });
      expect(result.current.start?.settings.theme).toBe("System");
      act(() => {
        result.current.setTheme.mutate("Light");
      });
      await waitFor(() => {
        expect(result.current.setTheme.isError).toBe(true);
      });
      expect(result.current.start?.settings.theme).toBe("System");
    });
  });
});
