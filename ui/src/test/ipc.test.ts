import { describe, expect, it } from "vitest";
import { api } from "../api/commands";
import { asCommandError } from "../api/error";
import type { Settings } from "../bindings/Settings";
import { commandFailure, mockCommands } from "./ipc";

const settings: Settings = { theme: "Light", workspace_dir: null, last_workspace: null };

describe("mockCommands", () => {
  it("returns the typed result of a handler and passes the arguments by their command keys", async () => {
    let received: unknown;
    mockCommands({
      settings_set_theme: (args) => {
        received = args;
        return { ...settings, theme: args.theme };
      },
    });
    await expect(api.setTheme("Light")).resolves.toEqual(settings);
    expect(received).toEqual({ theme: "Light" });
  });

  it("rejects with the command error a handler throws", async () => {
    mockCommands({
      workspace_rename: () => {
        throw commandFailure("NoWorkspace", "No workspace is open.");
      },
    });
    const error = asCommandError(await api.workspaceRename("X").catch((e: unknown) => e));
    expect(error).toEqual({ kind: "NoWorkspace", message: "No workspace is open." });
  });

  it("rejects a command without a handler with an Internal error that names it", async () => {
    mockCommands({});
    const error = asCommandError(await api.workspaceList().catch((e: unknown) => e));
    expect(error.kind).toBe("Internal");
    expect(error.message).toContain("workspace_list");
  });
});
