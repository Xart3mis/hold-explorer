import { mockIPC } from "@tauri-apps/api/mocks";
import { describe, expect, it } from "vitest";
import commandArgs from "./command-args.json";
import { api, type ArgsOf, type CommandName } from "./commands";

/**
 * The arguments of a command as they cross to Rust: JSON, in which the progress channel is the
 * text Tauri writes for a channel.
 */
type OnTheWire<Args> = { [Key in keyof Args]: Key extends "onProgress" ? string : Args[Key] };

/**
 * `command-args.json`: for every command, one arguments object exactly as the interface sends
 * it. The Rust tests invoke every registered command with the same objects, so a key or a shape
 * that one side changes fails on the other.
 */
const fixture = commandArgs as { [Name in CommandName]: OnTheWire<ArgsOf<Name>> };

/** The id every channel has in the fixture; a real one is a number the page draws. */
const CHANNEL = "__CHANNEL__:1";

/** What `invoke` hands to Tauri, as the JSON Tauri sends, with the channel under its fixture id. */
function onTheWire(payload: unknown): unknown {
  return JSON.parse(JSON.stringify(payload), (_key, value: unknown) =>
    typeof value === "string" && /^__CHANNEL__:\d+$/.test(value) ? CHANNEL : value,
  );
}

/** Every command, called through its function of `api` with the values of the fixture. */
const calls: Record<CommandName, () => Promise<unknown>> = {
  app_start: () => api.appStart(),
  settings_set_theme: () => api.setTheme(fixture.settings_set_theme.theme),
  workspace_list: () => api.workspaceList(),
  workspace_create: () => api.workspaceCreate(fixture.workspace_create.name),
  workspace_open: () => api.workspaceOpen(fixture.workspace_open.id),
  workspace_rename: () => api.workspaceRename(fixture.workspace_rename.name),
  import_open: () => api.importOpen(fixture.import_open.path),
  import_choose_sheet: () => api.importChooseSheet(fixture.import_choose_sheet.sheet),
  import_review: () => api.importReview(fixture.import_review.fields),
  import_check_target: () =>
    api.importCheckTarget(fixture.import_check_target.target, fixture.import_check_target.takenAt),
  import_commit: () => api.importCommit(fixture.import_commit.request, () => undefined),
  import_cancel: () => api.importCancel(),
  snapshot_select: () => api.snapshotSelect(fixture.snapshot_select.id),
  overview: () => api.overview(fixture.overview.spec, fixture.overview.view),
  demo_create: () => api.demoCreate(),
  filter_options: () => api.filterOptions(fixture.filter_options.spec, fixture.filter_options.view),
  filter_values: () =>
    api.filterValues(
      fixture.filter_values.spec,
      fixture.filter_values.dim,
      fixture.filter_values.search,
      fixture.filter_values.view,
    ),
  lines: () =>
    api.lines(fixture.lines.spec, fixture.lines.query, fixture.lines.offset, fixture.lines.view),
  holds: () => api.holds(fixture.holds.spec, fixture.holds.query, fixture.holds.view),
  line_detail: () => api.lineDetail(fixture.line_detail.lineId, fixture.line_detail.view),
  hold_detail: () => api.holdDetail(fixture.hold_detail.position, fixture.hold_detail.view),
  workspace_current: () => api.workspaceCurrent(),
};

const names = Object.keys(calls).sort() as CommandName[];

describe("the arguments of the commands", () => {
  it("has one entry in the fixture for every command, and no other", () => {
    expect(Object.keys(commandArgs).sort()).toEqual(names);
  });

  it.each(names)("sends %s with the keys and the shapes of the fixture", async (name) => {
    const sent: { command: string; args: unknown }[] = [];
    mockIPC((command, payload) => {
      sent.push({ command, args: onTheWire(payload ?? {}) });
      return null;
    });
    await calls[name]();
    expect(sent).toEqual([{ command: name, args: commandArgs[name] }]);
  });

  it("writes a channel as the text the fixture holds for one, with the number of the channel", async () => {
    let sent = "";
    mockIPC((_command, payload) => {
      sent = JSON.stringify(payload);
      return null;
    });
    await calls.import_commit();
    expect(sent).toMatch(/"onProgress":"__CHANNEL__:\d+"/);
    expect(fixture.import_commit.onProgress).toBe(CHANNEL);
  });
});
