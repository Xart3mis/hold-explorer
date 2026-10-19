import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Density } from "../../bindings/Density";
import type { Settings } from "../../bindings/Settings";
import { held, loaded } from "../../test/actions";
import { commandFailure } from "../../test/ipc";
import { useDensitySetting } from "./density";

const settings = (density: Density): Settings => ({
  theme: "Dark",
  density,
  author_name: "",
  workspace_dir: null,
  last_workspace: null,
});

describe("changing the density", () => {
  it("shows the density asked for at once and keeps it when it is saved", async () => {
    const set = held<Settings>();
    const { result } = await loaded(useDensitySetting, { settings_set_density: set.handler });
    act(() => {
      result.current.setDensity.mutate("Compact");
    });
    await waitFor(() => {
      expect(result.current.start?.settings.density).toBe("Compact");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.resolve(settings("Compact"));
    await waitFor(() => {
      expect(result.current.setDensity.isSuccess).toBe(true);
    });
    expect(result.current.start?.settings.density).toBe("Compact");
  });

  it("goes back to the saved density when the change fails", async () => {
    const set = held<Settings>();
    const { result } = await loaded(useDensitySetting, { settings_set_density: set.handler });
    act(() => {
      result.current.setDensity.mutate("Compact");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(result.current.setDensity.isError).toBe(true);
    });
    expect(result.current.start?.settings.density).toBe("Comfortable");
  });

  it("keeps the second of two changes when the first fails after the second was asked for", async () => {
    const set = held<Settings>();
    const { result } = await loaded(useDensitySetting, { settings_set_density: set.handler });
    act(() => {
      result.current.setDensity.mutate("Compact");
      result.current.setDensity.mutate("Comfortable");
    });
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(1);
    });
    set.waiting[0]?.reject(commandFailure("Settings", "The settings file could not be written."));
    await waitFor(() => {
      expect(set.handler).toHaveBeenCalledTimes(2);
    });
    expect(result.current.start?.settings.density).toBe("Comfortable");
  });
});
