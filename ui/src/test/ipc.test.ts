import { describe, expect, it } from "vitest";
import { api } from "../api/commands";
import { asCommandError } from "../api/error";
import { workspaceApi } from "../api/workspace-commands";
import type { Settings } from "../bindings/Settings";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import { checkUnhandledCommands, commandFailure, expectUnhandled, mockCommands } from "./ipc";

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
    const error = asCommandError(await workspaceApi.workspaceRename("X").catch((e: unknown) => e));
    expect(error).toEqual({ kind: "NoWorkspace", message: "No workspace is open." });
  });

  it("rejects a command without a handler with an Internal error that names it", async () => {
    expectUnhandled("workspace_list");
    mockCommands({});
    const error = asCommandError(await api.workspaceList().catch((e: unknown) => e));
    expect(error.kind).toBe("Internal");
    expect(error.message).toContain("workspace_list");
  });

  it("carries a warning on an opened workspace and a list error on the start", async () => {
    const warning = { kind: "Settings", message: "The workspace is open, but ..." };
    const opened: WorkspaceOpen = {
      workspace: {
        id: "0123456789abcdef",
        name: "A",
        project_numbers: [],
        created_at: "2026-10-11T10:00:00",
        snapshot_count: 0,
        latest_taken_at: null,
      },
      snapshots: [],
      selected: null,
      warning,
    };
    mockCommands({
      workspace_open: () => opened,
      app_start: () => ({
        version: "0.1.0",
        settings,
        list: { workspaces: [], unreadable: [], folder: "/w" },
        list_error: { kind: "Io", message: "Could not read /w." },
        open: null,
      }),
    });
    await expect(workspaceApi.workspaceOpen("0123456789abcdef")).resolves.toEqual(opened);
    const start = await workspaceApi.appStart();
    expect(start.list_error?.kind).toBe("Io");
  });
});

describe("a command the test has no handler for", () => {
  it("fails the test it arrived in: the check after each test names the command and how to answer it", async () => {
    mockCommands({ app_start: () => Promise.reject(commandFailure("Io", "No.")) });
    await api.workspaceList().catch(() => undefined);
    await api
      .overview(
        {
          status: "Open",
          fields: [],
          text: "",
          age_bands: [],
          created: { from: null, to: null },
          released: { from: null, to: null },
          size_mismatch: null,
        },
        { workspace_id: "0123456789abcdef", snapshot_id: null },
      )
      .catch(() => undefined);
    await api.workspaceList().catch(() => undefined);
    // This is what the setup file calls after every test.
    expect(checkUnhandledCommands).toThrow(/workspace_list, overview/);
    expect(checkUnhandledCommands).not.toThrow();
  });

  it("says in its failure what to do about it", async () => {
    mockCommands({});
    await api.importCancel(null).catch(() => undefined);
    let said = "";
    try {
      checkUnhandledCommands();
    } catch (error) {
      said = error instanceof Error ? error.message : String(error);
    }
    expect(said).toContain("import_cancel");
    expect(said).toContain("handler");
    expect(said).toContain("expectUnhandled");
  });

  it("is let through when the test declared that it expects it, and only that command", async () => {
    expectUnhandled("workspace_list");
    mockCommands({});
    await api.workspaceList().catch(() => undefined);
    expect(checkUnhandledCommands).not.toThrow();

    // What a test declares holds for that test alone.
    await api.workspaceList().catch(() => undefined);
    expect(checkUnhandledCommands).toThrow(/workspace_list/);

    expectUnhandled("workspace_list");
    await api.importCancel(null).catch(() => undefined);
    expect(checkUnhandledCommands).toThrow(/import_cancel/);
  });

  it("does not count a command whose handler rejects: that is an answer", async () => {
    mockCommands({
      workspace_list: () => {
        throw commandFailure("Io", "The folder could not be read.");
      },
    });
    await api.workspaceList().catch(() => undefined);
    expect(checkUnhandledCommands).not.toThrow();
  });
});
