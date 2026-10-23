import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Density } from "../../bindings/Density";
import type { Settings } from "../../bindings/Settings";
import type { Theme } from "../../bindings/Theme";
import { held, loaded } from "../../test/actions";
import { openStart } from "../../test/fixtures";
import { commandFailure } from "../../test/ipc";
import { useDensitySetting } from "./density";
import { useThemeSetting } from "./theme";

const settings = (changes: Partial<Settings>): Settings => ({
  theme: "Dark",
  density: "Comfortable",
  author_name: "",
  workspace_dir: null,
  workspace_folder_chosen: false,
  last_workspace: null,
  update_check: true,
  update_checked_at: null,
  skipped_version: null,
  ...changes,
});

const failure = () => commandFailure("Settings", "The settings file could not be written.");

/** The action of one setting that is applied at once, as the tests that both settings share see it. */
interface Change<V extends Theme | Density> {
  field: "theme" | "density";
  command: "settings_set_theme" | "settings_set_density";
  /** What the settings file holds when the app starts. */
  initial: V;
  /** Two changes, asked for one after the other. The second is not the initial value. */
  first: V;
  second: V;
  useChange: () => { change: { mutate: (value: V) => void; isSuccess: boolean; isError: boolean } };
}

const theme: Change<Theme> = {
  field: "theme",
  command: "settings_set_theme",
  initial: "Dark",
  first: "Light",
  second: "System",
  useChange: () => ({ change: useThemeSetting().setTheme }),
};

const density: Change<Density> = {
  field: "density",
  command: "settings_set_density",
  initial: "Comfortable",
  first: "Comfortable",
  second: "Compact",
  useChange: () => ({ change: useDensitySetting().setDensity }),
};

function shared<V extends Theme | Density>(c: Change<V>) {
  const answer = (value: V) => settings({ [c.field]: value });

  it("keeps the second of two changes when the first fails after the second was asked for", async () => {
    const set = held<Settings>();
    const { result } = await loaded(c.useChange, { [c.command]: set.handler });
    act(() => {
      result.current.change.mutate(c.first);
      result.current.change.mutate(c.second);
    });
    // The latest choice shows at once.
    await waitFor(() => {
      expect(result.current.start?.settings[c.field]).toBe(c.second);
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(failure());
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    // The failure of the first does not take the second away.
    expect(result.current.start?.settings[c.field]).toBe(c.second);
    set.waiting[1]?.resolve(answer(c.second));
    await waitFor(() => {
      expect(result.current.change.isSuccess).toBe(true);
    });
    expect(result.current.start?.settings[c.field]).toBe(c.second);
  });

  it("goes back to the last saved value when both of two changes fail", async () => {
    const set = held<Settings>();
    const { result } = await loaded(c.useChange, { [c.command]: set.handler });
    act(() => {
      result.current.change.mutate(c.first);
      result.current.change.mutate(c.second);
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(failure());
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    set.waiting[1]?.reject(failure());
    await waitFor(() => {
      expect(result.current.change.isError).toBe(true);
    });
    // The initial value is what the settings file holds; the second was never saved.
    expect(result.current.start?.settings[c.field]).toBe(c.initial);
  });

  it("keeps the later choice on screen when the first of two changes succeeds first", async () => {
    const set = held<Settings>();
    const { result } = await loaded(c.useChange, { [c.command]: set.handler });
    act(() => {
      result.current.change.mutate(c.first);
      result.current.change.mutate(c.second);
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.resolve(answer(c.first));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    expect(result.current.start?.settings[c.field]).toBe(c.second);
    // The first is saved now, so that is where a failure of the second goes back to.
    set.waiting[1]?.reject(failure());
    await waitFor(() => {
      expect(result.current.change.isError).toBe(true);
    });
    expect(result.current.start?.settings[c.field]).toBe(c.first);
  });
}

describe("changing the theme", () => {
  shared(theme);

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
          throw failure();
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

describe("changing the density", () => {
  shared(density);
});

describe("an answer of the settings", () => {
  it("changes only its own field in the cached settings", async () => {
    const setTheme = held<Settings>();
    const setDensity = held<Settings>();
    const { result } = await loaded(() => ({ ...useThemeSetting(), ...useDensitySetting() }), {
      settings_set_theme: setTheme.handler,
      settings_set_density: setDensity.handler,
    });
    act(() => {
      result.current.setTheme.mutate("Light");
    });
    await waitFor(() => {
      expect(setTheme.handler).toHaveBeenCalledTimes(1);
    });
    // The density is changed while the answer about the theme is still held: it shows at once.
    act(() => {
      result.current.setDensity.mutate("Compact");
    });
    await waitFor(() => {
      expect(result.current.start?.settings.density).toBe("Compact");
    });
    // The held answer was composed before the density changed, so it still says Comfortable.
    setTheme.waiting[0]?.resolve(settings({ theme: "Light", density: "Comfortable" }));
    await waitFor(() => {
      expect(result.current.setTheme.isSuccess).toBe(true);
    });
    expect(result.current.start?.settings.theme).toBe("Light");
    expect(result.current.start?.settings.density).toBe("Compact");
    await waitFor(() => {
      expect(setDensity.handler).toHaveBeenCalledTimes(1);
    });
    setDensity.waiting[0]?.resolve(settings({ theme: "Light", density: "Compact" }));
    await waitFor(() => {
      expect(result.current.setDensity.isSuccess).toBe(true);
    });
    expect(result.current.start?.settings.density).toBe("Compact");
  });
});
