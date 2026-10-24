// Answers the commands from fixtures, so the app's pages can be opened in a plain browser. For
// development only; see ui/src/dev/app.tsx.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { openHoldsFilter } from "../api/filter";
import { dimNeeds, partNeeds } from "../api/filter-needs";
import type { AppStart } from "../bindings/AppStart";
import { defaultFilters, type Filters, type FilterValue } from "../app/filters/state";
import type { CommandError } from "../bindings/CommandError";
import type { ErrorKind } from "../bindings/ErrorKind";
import type { Density } from "../bindings/Density";
import type { Dim } from "../bindings/Dim";
import type { ExportPhase } from "../bindings/ExportPhase";
import type { ExportRequest } from "../bindings/ExportRequest";
import type { ExportSaved } from "../bindings/ExportSaved";
import type { Field } from "../bindings/Field";
import type { FilterPart } from "../bindings/FilterPart";
import type { Inactive } from "../bindings/Inactive";
import type { FilterLabel } from "../bindings/FilterLabel";
import type { FilterOptions } from "../bindings/FilterOptions";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { FolderMoved } from "../bindings/FolderMoved";
import type { HoldQuery } from "../bindings/HoldQuery";
import type { ImportCommit } from "../bindings/ImportCommit";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { ImportPhase } from "../bindings/ImportPhase";
import type { ImportReview } from "../bindings/ImportReview";
import type { LineQuery } from "../bindings/LineQuery";
import type { SavedView } from "../bindings/SavedView";
import type { SearchResults } from "../bindings/SearchResults";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { Theme } from "../bindings/Theme";
import type { ValuePage } from "../bindings/ValuePage";
import type { ViewRef } from "../bindings/ViewRef";
import type { WorkspaceOpen } from "../bindings/WorkspaceOpen";
import type { TargetCheck } from "../bindings/TargetCheck";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import {
  exportDraft,
  exportMap,
  review,
  reviewToConfirm,
  reviewWithFindings,
  savedMappingDraft,
  unmappedDraft,
} from "../test/import";
import {
  devBlockerDetail,
  devBreakdown,
  devGroupDetail,
  devMatrix,
  devHoldCount,
  devHoldDetail,
  devHolds,
  devLineDetail,
  devLines,
  devSolveOrder,
} from "./lines";
import { devKept, devOverview, type DevOverview } from "./overview";
import { devSearch } from "./search";
import { devValues } from "./values";

/** What `pnpm check:dist` looks for: this module must never be part of a build. */
const MARKER = "hx-dev-commands";

/** The states the development page can start in. */
export const DEV_STATES = [
  "first-run",
  "workspaces",
  // The list of workspaces, where an action that is started never ends: press Open on a row, or
  // the demo button, to see the spinner on what was pressed and the other controls waiting.
  "workspaces-pending",
  "open",
  "older",
  "list-error",
  "warning",
  // The settings file could not be understood at start and was set aside.
  "settings-problem",
  // The check after the start found a newer release: the shell offers its release page, and to
  // skip it. Every other state finds none.
  "update-available",
  // A move of the workspaces folder (Change folder in Settings) where the new folder already holds
  // a file of every name, so no file moves and the result says why for each:
  //   dev.html?state=folder-taken#/settings
  "folder-taken",
  // The Rust side has moved on to the snapshot before the newest and the interface was not told:
  // the Overview is refused, asks what is open, and the shell says that it was brought in step.
  "view-resynced",
  // The Overview: a workspace without snapshots, a snapshot whose file has no creation dates, a
  // first load that never ends, an update that never ends (select another snapshot to see it), a
  // failure, groups of three and of twenty-five values, and a workspace whose newest snapshot is
  // a limited one.
  "empty",
  "no-dates",
  "overview-limited",
  "overview-loading",
  "overview-updating",
  "overview-error",
  "overview-few",
  "overview-many",
  // The filter bar on the Overview: several filters set, more than fit in one line, a snapshot
  // whose export had no size columns, a selection that never ends (select another snapshot to see
  // the bar wait), and counts that cannot be read. `filters-absent` also sets a filter on the
  // sizes, which that snapshot lacks. `overview-limited` shows the bar of a
  // snapshot without its released column.
  "filters",
  "filters-many",
  "filters-absent",
  "filters-busy",
  "filters-error",
  // The filter picker: the filters of `filters`, line IDs in the thousands (open Line ID from
  // "Add filter" to see the line that says how many more there are), and values that take a
  // second to be read, so that a first read and a re-read after a tick can be seen.
  "filters-picker",
  // Lines: every state answers the lines and the holds of its snapshot from made-up holds. These
  // add a snapshot of 30,000 holds, filters that keep none, a snapshot whose sizes all match (the
  // preset Size mismatch then finds nothing), a reading that fails, and a first load that never
  // ends. Open them on the page: dev.html?state=lines-many#/lines?rows=holds
  "lines-many",
  "lines-none",
  "lines-matching-sizes",
  "lines-error",
  "lines-loading",
  // The detail panel: every state answers a line and a hold from the same made-up holds. Open a
  // line or a hold by its address, and a line that is in no snapshot the same way:
  //   dev.html?state=open#/lines?line=78B02-501-00002-PL-002
  //   dev.html?state=open#/lines?rows=holds&hold=3
  //   dev.html?state=open#/lines?line=78B99-000-00000-XX-000
  // These add a newest snapshot that is limited (no released column, no hold ID), answers that
  // take two seconds (select another snapshot to see a re-read), and a reading that fails.
  // A blocker opens the same way, from Blockers or from any other data destination; these add a
  // first load that never ends, and filters that leave out the blocker (Clear filters in the panel
  // brings it back). `blockers-many` has blockers of hundreds of lines:
  //   dev.html?state=open#/blockers?blocker=Piping%7CStress
  //   dev.html?state=detail-loading#/blockers?blocker=Piping%7CStress
  //   dev.html?state=detail-filtered#/lines?blocker=Piping%7CStress
  //   dev.html?state=blockers-many#/blockers?blocker=Piping%7CStress
  "detail-limited",
  "detail-slow",
  "detail-error",
  "detail-loading",
  "detail-filtered",
  // Breakdown: every state answers the groups and their lines from the same made-up holds. These
  // add a snapshot of 30,000 holds grouped by blocker, its first 1,500 groups, the largest with
  // more than 900 lines; lines of a group that are never read (a skeleton row stays); and lines
  // of a group that cannot be read (an error row with a retry). Open them on the page:
  //   dev.html?state=breakdown-many#/breakdown?mode=list&by=Blocker
  //   dev.html?state=breakdown-group-loading#/breakdown?mode=list&by=Discipline&open=Piping
  "breakdown-many",
  "breakdown-group-loading",
  "breakdown-group-error",
  // The matrix of Breakdown answers from the same holds in every state, folded at thirty values
  // a side as the command folds. These fold at six a side, so that disciplines by hold type has
  // an Other row and an Other column; give a matrix that never comes (skeletons); and one that
  // cannot be read (an error with a retry):
  //   dev.html?state=open#/breakdown?mode=matrix
  //   dev.html?state=breakdown-matrix-folded#/breakdown?mode=matrix
  "breakdown-matrix-folded",
  "breakdown-matrix-loading",
  "breakdown-matrix-error",
  // Blockers: every state answers the solve order of the same made-up holds, a step for each of
  // their blockers. These add the snapshot of 30,000 holds, whose solve order has thousands of
  // steps; a first load that never ends (skeletons); and a reading that fails (an error with a
  // retry). `lines-none` shows it under filters that keep no hold, and `empty` in a workspace
  // without snapshots. Select a step by its address as well:
  //   dev.html?state=open#/blockers
  //   dev.html?state=blockers-many#/blockers?blocker=Piping%7CStress
  "blockers-many",
  "blockers-loading",
  "blockers-error",
  // The import flow, with a file already open. Open them on a page of the flow:
  //   dev.html?state=import-clean#/import/review
  //   dev.html?state=import-mapping#/import/mapping
  //   dev.html?state=import-sheet#/import/sheet
  //   dev.html?state=import-mapping-wide#/import/mapping (a full export, fifteen columns)
  "import-clean",
  "import-findings",
  "import-confirm",
  "import-imported",
  "import-same-day",
  "import-limited",
  "import-mapping",
  "import-mapping-wide",
  "import-saved",
  "import-sheet",
  "import-committing",
  "import-failed",
  // The search field of the top bar answers every state from a fixed result (ui/src/dev/search.ts).
  // These add a search that finds nothing, one whose answers take three seconds (type, wait for
  // the results, then type another character to see them dimmed), and one that fails:
  //   dev.html?state=search-none#/overview
  "search-none",
  "search-slow",
  "search-error",
  // Saved views in the sidebar: four views, one with a long name and one on a field the snapshot
  // lacks. Apply one to see it current; Save view in the filter bar saves another.
  //   dev.html?state=views#/lines
  "views",
] as const;
export type DevState = (typeof DEV_STATES)[number];

export function isDevState(value: string): value is DevState {
  return DEV_STATES.some((state) => state === value);
}

const FOLDER = "/home/ada/.local/share/hold-explorer/workspaces";
/** Where the development page says the settings file is. */
const SETTINGS_FILE = "/home/ada/.config/hold-explorer/settings.json";
const LOGS_FOLDER = "/home/ada/.local/share/hold-explorer/logs";

/** What a reading answers when the workspace file is locked. */
const LOCKED =
  "The workspace file could not be read (it is locked by another program). Close the other program, then try again.";

/**
 * The filter the solve order and a blocker's detail rank, as the desktop side's `open_only`
 * leaves it: the open holds among those the filter keeps, and nothing under the status Released.
 */
function openOnly(spec: FilterSpec): FilterSpec | null {
  return spec.status === "Released" ? null : { ...spec, status: "Open" };
}

function failure(kind: ErrorKind, message: string): Error & CommandError {
  return Object.assign(new Error(message), { kind });
}

function later<T>(milliseconds: number, answer: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        resolve(answer());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, milliseconds);
  });
}

function snapshot(id: number, takenAt: string, rows: number, open: number): SnapshotInfo {
  return {
    id,
    taken_at: takenAt,
    date_source: "FileName",
    file_name: `Holds_${takenAt.slice(0, 10)}.xlsx`,
    content_hash: String(id).padStart(64, "0"),
    imported_at: "2026-10-07T09:12:00",
    limited: false,
    row_count: rows,
    open_count: open,
  };
}

const fourSnapshots: SnapshotInfo[] = [
  snapshot(1, "2026-09-16T08:00:00", 9300, 5390),
  snapshot(2, "2026-09-23T08:00:00", 9412, 5241),
  snapshot(3, "2026-09-30T14:05:00", 9518, 5127),
  snapshot(4, "2026-10-07T08:00:00", 9634, 5042),
];

const unit573: WorkspaceView = {
  id: "a1b2c3d4e5f60718",
  name: "Unit 573 piping",
  project_numbers: ["5359-200"],
  created_at: "2026-09-16T07:55:00",
  snapshot_count: 4,
  latest_taken_at: "2026-10-07T08:00:00",
};

const tankFarm: WorkspaceView = {
  id: "b2c3d4e5f6071829",
  name: "Tank farm",
  project_numbers: ["5360-110"],
  created_at: "2026-08-03T10:20:00",
  snapshot_count: 11,
  latest_taken_at: "2026-09-23T07:30:00",
};

const offsites: WorkspaceView = {
  id: "c3d4e5f607182930",
  name: "Offsites and utilities, phase 2",
  project_numbers: ["5359-310", "5359-320"],
  created_at: "2026-10-01T15:42:00",
  snapshot_count: 0,
  latest_taken_at: null,
};

const value = (label: string): FilterValue => ({ key: label, label });

/** A few filters, as a user who looks for old civil holds would set them. */
const SOME_FILTERS: Filters = {
  ...defaultFilters,
  fields: [
    { dim: "Discipline", values: [value("Civil"), value("Structural")], negate: false },
    { dim: "HoldType", values: [value("Vendor data")], negate: true },
  ],
  ageBands: [{ min_days: 90, max_days: null }],
};

/** More filters than one line holds, one of every kind, with a value too long for a chip. */
const MANY_FILTERS: Filters = {
  status: "All",
  fields: [
    {
      dim: "Discipline",
      values: ["Civil", "Structural", "Piping", "Process"].map(value),
      negate: false,
    },
    { dim: "HoldType", values: [value("Vendor data"), value("Client decision")], negate: false },
    { dim: "Role", values: [value("Lead engineer")], negate: true },
    {
      dim: "Remark",
      values: [
        value(
          "HOLD FOR VENDOR DATA OF PACKAGE UNIT 577-PK-400, NOZZLE ORIENTATION AND LOADS TO BE CONFIRMED",
        ),
      ],
      negate: false,
    },
    { dim: { Custom: "Area" }, values: [value("North rack")], negate: false },
  ],
  text: "577-PR",
  ageBands: [
    { min_days: 60, max_days: 89 },
    { min_days: 90, max_days: null },
  ],
  created: { from: "2026-06-01", to: "2026-09-30" },
  released: { from: null, to: "2026-10-07" },
  sizeMismatch: true,
};

/**
 * The filter as the core's `FilterSpec::applicable` leaves it for a snapshot that lacks `absent`
 * and names `customDims`, with what it left out.
 */
function devApplicable(
  spec: FilterSpec,
  absent: Field[],
  customDims: string[],
): { applied: FilterSpec; inactive: Inactive } {
  const lacks = (needs: readonly Field[]) => needs.some((field) => absent.includes(field));
  const isAbsent = (dim: Dim) =>
    typeof dim === "string" ? lacks(dimNeeds(dim)) : !customDims.includes(dim.Custom);
  const inactive: Inactive = {
    dims: spec.fields
      .filter((field) => field.values.length > 0 && isAbsent(field.dim))
      .map((field) => field.dim),
    parts: [],
  };
  const applied: FilterSpec = {
    ...spec,
    fields: spec.fields.filter((field) => field.values.length === 0 || !isAbsent(field.dim)),
  };
  const isBounded = (range: FilterSpec["created"]) => range.from !== null || range.to !== null;
  const parts: [FilterPart, boolean, () => void][] = [
    ["AgeBands", spec.age_bands.length > 0, () => (applied.age_bands = [])],
    ["Created", isBounded(spec.created), () => (applied.created = { from: null, to: null })],
    ["Released", isBounded(spec.released), () => (applied.released = { from: null, to: null })],
    ["SizeMismatch", spec.size_mismatch !== null, () => (applied.size_mismatch = null)],
  ];
  for (const [part, isSet, clear] of parts) {
    if (isSet && lacks(partNeeds(part))) {
      inactive.parts.push(part);
      clear();
    }
  }
  return { applied, inactive };
}

/** The filters a state starts with, for the workspace it opens; `null` for the default. */
export function devFilters(state: DevState): { workspaceId: string; filters: Filters } | null {
  switch (state) {
    case "filters":
    case "filters-busy":
    case "filters-error":
    case "filters-picker":
      return { workspaceId: unit573.id, filters: SOME_FILTERS };
    // A filter on the sizes, which the snapshot lacks: its chip stays, marked, and is not sent.
    case "filters-absent":
      return { workspaceId: unit573.id, filters: { ...SOME_FILTERS, sizeMismatch: true } };
    case "filters-many":
      return { workspaceId: unit573.id, filters: MANY_FILTERS };
    case "lines-none":
      return { workspaceId: unit573.id, filters: { ...defaultFilters, text: "no such line" } };
    case "detail-filtered":
      return {
        workspaceId: unit573.id,
        filters: {
          ...defaultFilters,
          fields: [{ dim: "Discipline", values: [value("Civil")], negate: false }],
        },
      };
    default:
      return null;
  }
}

/** The file a state of the import flow has open, when the state is one of the flow. */
export function devDraft(state: DevState): ImportDraft | null {
  switch (state) {
    case "import-mapping":
      return unmappedDraft();
    case "import-saved":
    case "import-confirm":
      return savedMappingDraft();
    case "import-sheet": {
      const workbook = exportDraft();
      return { ...workbook, file: { ...workbook.file, sheets: ["info", "data", "Sheet3"] } };
    }
    case "import-clean":
    case "import-findings":
    case "import-imported":
    case "import-same-day":
    case "import-limited":
    case "import-mapping-wide":
    case "import-committing":
    case "import-failed":
      return exportDraft();
    default:
      return null;
  }
}

/** What the review of that file finds, by the state. */
function devReview(state: DevState, all: WorkspaceView[]): ImportReview {
  const target = { suggested: unit573.id, matching: [unit573], all };
  switch (state) {
    case "import-findings":
      return { ...reviewWithFindings(312), target };
    case "import-confirm":
      return { ...reviewToConfirm(), target: { ...target, matching: [] } };
    case "import-limited": {
      const map = exportMap();
      const fields = { ...map.fields };
      delete fields.SourceId;
      return {
        ...review({ limited: true, mapping: { ...map, fields } }),
        target,
      };
    }
    case "import-mapping":
    case "import-saved":
      return {
        ...review({
          file_name: "open-holds.csv",
          project_no: null,
          detected: { at: "2026-10-12T00:00:00", source: "FileName" },
          mapping: savedMappingDraft().proposed,
          row_count: 5042,
          open_count: 5042,
          released_count: 0,
          limited: true,
        }),
        target: { ...target, matching: [] },
      };
    default:
      return { ...review(), target };
  }
}

/** The saved views of the state `views`, in sidebar order. */
const DEV_VIEWS: SavedView[] = [
  {
    id: 1,
    name: "Civil holds",
    address: "/lines?rows=holds",
    filters: {
      ...openHoldsFilter(),
      fields: [{ dim: "Discipline", values: ["Civil"], negate: false }],
    },
  },
  {
    id: 2,
    name: "Blockers, all holds",
    address: "/blockers",
    filters: { ...openHoldsFilter(), status: "All" },
  },
  {
    id: 3,
    name: "Stress calculations waiting on the vendor data of the north area",
    address: "/breakdown?mode=list&by=StressCalc",
    filters: {
      ...openHoldsFilter(),
      fields: [{ dim: { Custom: "Area" }, values: ["North"], negate: false }],
    },
  },
  { id: 4, name: "Overview", address: "/overview", filters: openHoldsFilter() },
];

/** The shape of the overview a state shows. */
function overviewShape(state: DevState): DevOverview {
  switch (state) {
    case "no-dates":
      return "no-dates";
    case "overview-few":
      return "few";
    case "overview-many":
      return "many";
    default:
      return "full";
  }
}

interface World {
  start: AppStart;
  /** What each workspace holds, by id. */
  snapshots: Map<string, SnapshotInfo[]>;
  /** Whether the workspaces folder can be read. */
  folderReadable: boolean;
}

function world(state: DevState, theme: Theme, density: Density): World {
  const snapshots = new Map<string, SnapshotInfo[]>([
    [unit573.id, fourSnapshots],
    [tankFarm.id, fourSnapshots.slice(0, 2)],
    [offsites.id, []],
  ]);
  const start: AppStart = {
    version: "0.1.0",
    settings_file: SETTINGS_FILE,
    logs_folder: LOGS_FOLDER,
    settings: {
      theme,
      density,
      author_name: "",
      workspace_dir: null,
      workspace_folder_chosen: false,
      last_workspace: null,
      update_check: true,
      update_checked_at: null,
      skipped_version: null,
    },
    list: { workspaces: [], unreadable: [], folder: FOLDER },
    list_error: null,
    open: null,
    settings_problem: null,
    e2e: false,
  };
  const opened = (selected: number, warning: CommandError | null): WorkspaceOpen => ({
    workspace: unit573,
    snapshots: fourSnapshots,
    selected,
    views: [],
    warning,
  });
  const all = [offsites, tankFarm, unit573];

  switch (state) {
    case "overview-limited":
    case "detail-limited": {
      // The newest export came without its released column.
      const held = fourSnapshots.map((taken) =>
        taken.id === 4 ? { ...taken, limited: true, open_count: taken.row_count } : taken,
      );
      snapshots.set(unit573.id, held);
      start.list.workspaces = all;
      start.open = { ...opened(4, null), snapshots: held };
      break;
    }
    case "lines-many":
    case "breakdown-many":
    case "blockers-many": {
      // The newest export holds thirty thousand holds, six thousand of them released.
      const held = fourSnapshots.map((taken) =>
        taken.id === 4 ? { ...taken, row_count: 30_000, open_count: 24_000 } : taken,
      );
      snapshots.set(unit573.id, held);
      start.list.workspaces = all;
      start.open = { ...opened(4, null), snapshots: held };
      break;
    }
    case "first-run":
      break;
    case "folder-taken":
      start.list.workspaces = [unit573];
      start.list.unreadable = [
        {
          file_name: "d4e5f60718293041.holdx-ws",
          path: `${FOLDER}/d4e5f60718293041.holdx-ws`,
          kind: "NewerSchema",
          message:
            "This workspace was written by a newer version of Hold Explorer (schema 9; this version reads up to schema 3). Update Hold Explorer to open it.",
        },
      ];
      break;
    case "workspaces":
    case "workspaces-pending":
      start.list.workspaces = all;
      start.list.unreadable = [
        {
          file_name: "d4e5f60718293041.holdx-ws",
          path: `${FOLDER}/d4e5f60718293041.holdx-ws`,
          kind: "NewerSchema",
          message:
            "This workspace was written by a newer version of Hold Explorer (schema 9; this version reads up to schema 3). Update Hold Explorer to open it.",
        },
      ];
      break;
    case "views":
      start.list.workspaces = all;
      start.open = { ...opened(4, null), views: DEV_VIEWS };
      break;
    case "open":
    case "update-available":
    case "view-resynced":
    case "no-dates":
    case "overview-loading":
    case "overview-updating":
    case "overview-error":
    case "overview-few":
    case "overview-many":
    case "filters":
    case "filters-many":
    case "filters-absent":
    case "filters-busy":
    case "filters-error":
    case "filters-picker":
    case "lines-none":
    case "lines-matching-sizes":
    case "lines-error":
    case "lines-loading":
    case "breakdown-group-loading":
    case "breakdown-group-error":
    case "breakdown-matrix-folded":
    case "breakdown-matrix-loading":
    case "breakdown-matrix-error":
    case "blockers-loading":
    case "blockers-error":
    case "detail-slow":
    case "detail-error":
    case "detail-loading":
    case "detail-filtered":
    case "import-clean":
    case "import-findings":
    case "import-confirm":
    case "import-imported":
    case "import-same-day":
    case "import-limited":
    case "import-mapping":
    case "import-mapping-wide":
    case "import-saved":
    case "import-sheet":
    case "import-committing":
    case "import-failed":
    case "search-none":
    case "search-slow":
    case "search-error":
      start.list.workspaces = all;
      start.open = opened(4, null);
      break;
    case "older":
      start.list.workspaces = all;
      start.open = opened(3, null);
      break;
    case "empty":
      start.list.workspaces = all;
      start.open = {
        workspace: offsites,
        snapshots: [],
        selected: null,
        views: [],
        warning: null,
      };
      break;
    case "warning":
      start.list.workspaces = all;
      start.open = opened(4, {
        kind: "Settings",
        message:
          "The workspace is open, but Hold Explorer could not remember it for the next start. The settings file /home/ada/.config/hold-explorer/settings.json could not be written (permission denied). Check that you may write to that folder.",
      });
      break;
    case "settings-problem":
      start.list.workspaces = all;
      start.open = opened(4, null);
      start.settings_problem = {
        kind: "SettingsSetAside",
        message:
          "Your settings file could not be read, so it was set aside as settings.json.unreadable and the defaults are in use. Choose your settings again in Settings; the old file is kept in /home/ada/.config/hold-explorer.",
      };
      break;
    case "list-error":
      start.list.folder = "/mnt/projects/5359/hold-explorer";
      start.list_error = {
        kind: "Io",
        message:
          "The workspaces folder could not be read (permission denied). Check that the drive is connected and that you may read the folder, then try again.",
      };
      break;
  }
  return { start, snapshots, folderReadable: state !== "list-error" };
}

/**
 * How many rows a saved export holds, as the development page tells it: those the request names.
 */
function exportedRows(request: ExportRequest, selected: SnapshotInfo | undefined): number {
  if (request.rows.kind === "Keys") return request.rows.keys.length;
  if (request.rows.kind === "First") return request.rows.count;
  return selected?.open_count ?? 0;
}

/**
 * Makes the commands, the file dialog, and the file manager answer from fixtures, in the given
 * state. Returns the marker of the development page. A dragged file is played from the console:
 * `hxDev.enter(["/exports/Holds.xlsx"])`, `hxDev.leave()`, `hxDev.drop([...])`.
 */
export function installDevCommands(
  state: DevState,
  theme: Theme,
  density: Density = "Comfortable",
): string {
  const { start, snapshots, folderReadable } = world(state, theme, density);
  let nextId = 1;
  let nextSnapshot = 5;
  let overviewReadings = 0;
  const draft = devDraft(state) ?? exportDraft();
  // The same day as the file, earlier, and the very same file: what a target can already hold.
  const earlier: SnapshotInfo = {
    ...snapshot(5, "2026-10-14T06:30:00", 9688, 5021),
    file_name: "Holds_2026-10-14_early.xlsx",
  };
  const sameFile: SnapshotInfo = {
    ...snapshot(6, "2026-10-14T08:00:00", 9702, 5010),
    content_hash: "f".repeat(64),
    date_source: "InfoSheet",
  };

  // The saved views of each workspace, in sidebar order; they last until the page is reloaded.
  const views = new Map<string, SavedView[]>();
  // The next id of each workspace: one more than the highest ever given.
  const nextViews = new Map<string, number>();
  if (start.open !== null && start.open.views.length > 0) {
    views.set(start.open.workspace.id, start.open.views);
    nextViews.set(
      start.open.workspace.id,
      Math.max(...start.open.views.map((view) => view.id)) + 1,
    );
  }

  const open = (workspace: WorkspaceView): WorkspaceOpen => {
    const held = snapshots.get(workspace.id) ?? [];
    const opened = {
      workspace,
      snapshots: held,
      selected: held.at(-1)?.id ?? null,
      views: views.get(workspace.id) ?? [],
      warning: null,
    };
    start.open = opened;
    return opened;
  };

  const create = (name: string, held: SnapshotInfo[]): WorkspaceOpen => {
    const workspace: WorkspaceView = {
      id: `e${String(nextId).padStart(15, "0")}`,
      name: name.trim() === "" ? "Workspace" : name.trim(),
      project_numbers: [],
      created_at: "2026-10-12T10:00:00",
      snapshot_count: held.length,
      latest_taken_at: held.at(-1)?.taken_at ?? null,
    };
    nextId += 1;
    snapshots.set(workspace.id, held);
    start.list.workspaces = [...start.list.workspaces, workspace].sort((a, b) =>
      a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
    );
    return open(workspace);
  };

  const idOf = (payload: unknown): number => {
    const value = (payload as { id?: unknown } | undefined)?.id;
    return typeof value === "number" ? value : -1;
  };

  /** The saved views of the workspace a command names; the open one only, as in Rust. */
  const viewsOf = (payload: unknown) => {
    const workspace = text(payload, "workspace");
    if (!start.open) throw failure("NoWorkspace", "No workspace is open. Open a workspace first.");
    if (start.open.workspace.id !== workspace) {
      throw failure(
        "ViewChanged",
        "That workspace is not the one that is open, so its saved views were not changed. Open the workspace, then try again.",
      );
    }
    const list = views.get(workspace) ?? [];
    return {
      list,
      find: (id: number): SavedView => {
        const found = list.find((view) => view.id === id);
        if (!found) {
          throw failure(
            "ViewNotFound",
            "That saved view is not in the list. It may have been deleted already; the list shows the views there are.",
          );
        }
        return found;
      },
      nextId: (): number => nextViews.get(workspace) ?? 1,
      issue: (next: number) => nextViews.set(workspace, next),
      keep: (next: SavedView[]): SavedView[] => {
        views.set(workspace, next);
        if (start.open) start.open = { ...start.open, views: next };
        return next;
      },
    };
  };

  const checkRoom = (current: { list: SavedView[] }) => {
    if (current.list.length >= 100) {
      throw failure(
        "TooManyViews",
        `A workspace holds at most 100 saved views, and this one holds ${String(current.list.length)}. Delete a view you no longer use, then save again.`,
      );
    }
  };

  /** A data screen's path, and no selection in its query, in the words of the Rust side. */
  const checkAddress = (address: string) => {
    const refused = (why: string) =>
      failure(
        "ViewAddress",
        `The address "${address}" cannot be saved as a view: ${why}. This is a fault of Hold Explorer; report it, and save the view again from the screen.`,
      );
    if (address.includes("#")) throw refused("it has a fragment");
    const at = address.indexOf("?");
    const path = at === -1 ? address : address.slice(0, at);
    const query = at === -1 ? "" : address.slice(at + 1);
    if (!["/overview", "/breakdown", "/lines", "/blockers"].includes(path)) {
      throw refused("it is not the address of Overview, Breakdown, Lines, or Blockers");
    }
    for (const pair of query.split("&")) {
      const [key = ""] = pair.split("=", 1);
      if (key.includes("%")) throw refused("a name in its query is escaped");
      if (["line", "hold", "blocker"].includes(key) || (path === "/breakdown" && key === "open")) {
        throw refused(`it carries the selection "${key}"`);
      }
    }
  };

  /** The name trimmed, in the words of the Rust side when it is empty or too long. */
  const clean = (raw: string): string => {
    const name = raw.trim();
    const length = Array.from(name).length;
    if (length === 0) {
      throw failure(
        "ViewName",
        "A saved view needs a name of at least one character. Type a name, then save again.",
      );
    }
    if (length > 80) {
      throw failure(
        "ViewName",
        `A saved view's name has at most 80 characters, and this one has ${String(length)}. Shorten the name, then save again.`,
      );
    }
    return name;
  };

  const checkFree = (current: { list: SavedView[] }, name: string, except: number | null) => {
    const taken = current.list.find(
      (view) => view.id !== except && view.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      throw failure(
        "ViewNameTaken",
        `A saved view named "${taken.name}" already exists, and names are compared without regard to case. Choose another name, or delete that view first.`,
      );
    }
  };

  const text = (payload: unknown, key: string): string => {
    const value = (payload as Record<string, unknown> | undefined)?.[key];
    return typeof value === "string" ? value : "";
  };

  /**
   * What a data command is asked with, once the view it names is the one held here. As the Rust
   * side does, a request for another view is refused.
   */
  // The states of Lines and of the panel answer from holds that carry two columns the mapping
  // did not know, and the bar offers them.
  const isLines =
    state.startsWith("lines-") ||
    state.startsWith("detail-") ||
    state.startsWith("breakdown-") ||
    state.startsWith("blockers-");
  const customDims = isLines ? ["Area", "Work pack"] : state === "filters-many" ? ["Area"] : [];
  const absentOf = (selected: SnapshotInfo): Field[] =>
    selected.limited
      ? ["Released", "ReleaseRemark", "ReleaseDate"]
      : state === "filters-absent"
        ? ["ModelSize", "LdtSize", "StressCalc"]
        : [];

  /**
   * The snapshot a request names, once its view is checked, with its filter as the command
   * applies it: without what the snapshot cannot apply, which `inactive` names.
   */
  const inView = (
    payload: unknown,
  ): { spec: FilterSpec; inactive: Inactive; selected: SnapshotInfo | undefined } => {
    // The commands that read one line or one hold take no filter.
    const { view, spec = openHoldsFilter() } = payload as { view?: ViewRef; spec?: FilterSpec };
    const held = start.open;
    if (!held) throw failure("NoWorkspace", "No workspace is open. Open a workspace first.");
    if (view?.workspace_id !== held.workspace.id || view.snapshot_id !== held.selected) {
      throw failure(
        "ViewChanged",
        "The workspace or the snapshot in view changed while the request was on its way, so its answer would belong to a view that is no longer shown. Nothing is wrong and nothing was changed; the page reads it again for the view it shows now.",
      );
    }
    const selected = held.snapshots.find(({ id }) => id === held.selected);
    if (selected === undefined) {
      return { spec, inactive: { dims: [], parts: [] }, selected };
    }
    const { applied, inactive } = devApplicable(spec, absentOf(selected), customDims);
    return { spec: applied, inactive, selected };
  };

  const answers: Record<string, (payload: unknown) => unknown> = {
    app_start: () => {
      const answer = structuredClone(start);
      // From here on the Rust side holds another snapshot than the one it has just named: the
      // one before the newest.
      if (state === "view-resynced" && start.open) {
        start.open = { ...start.open, selected: start.open.snapshots.at(-2)?.id ?? null };
      }
      return answer;
    },
    workspace_current: () => start.open,
    settings_set_theme: (payload) => {
      const chosen = text(payload, "theme");
      if (chosen === "Dark" || chosen === "Light" || chosen === "System") {
        start.settings = { ...start.settings, theme: chosen };
      }
      return start.settings;
    },
    settings_set_density: (payload) => {
      const chosen = text(payload, "density");
      if (chosen === "Comfortable" || chosen === "Compact") {
        start.settings = { ...start.settings, density: chosen };
      }
      return start.settings;
    },
    settings_set_update_check: (payload) => {
      const { enabled } = payload as { enabled: boolean };
      start.settings = { ...start.settings, update_check: enabled };
      return start.settings;
    },
    update_check: () =>
      later(400, () =>
        state === "update-available" && start.settings.update_check ? { version: "0.2.0" } : null,
      ),
    update_skip: (payload) => {
      start.settings = { ...start.settings, skipped_version: text(payload, "version") };
      return start.settings;
    },
    open_release_page: () => later(300, () => null),
    // Only a smoke run of the app does anything with it.
    smoke_ready: () => null,
    settings_set_author_name: (payload) => {
      const name = text(payload, "name").trim();
      if (Array.from(name).length > 80) {
        throw failure(
          "Settings",
          "The name is longer than 80 characters, so it was not saved. Shorten it, then save it again.",
        );
      }
      start.settings = { ...start.settings, author_name: name };
      return start.settings;
    },
    // A folder is checked at once; the folder in use is refused. A move takes a second and a half
    // and moves every listed file, unless the state says their names are taken.
    check_workspace_folder: (payload) => {
      const path = text(payload, "path") || FOLDER;
      if (path === start.list.folder) {
        throw failure(
          "SameFolder",
          `The workspaces are already kept in ${path}. Choose another folder to keep them in.`,
        );
      }
      const movable = [
        ...start.list.workspaces.map((workspace) => `${workspace.id}.holdx-ws`),
        ...start.list.unreadable.map((file) => file.file_name),
      ].sort();
      return later(300, () => ({ path, movable, count: movable.length }));
    },
    set_workspace_folder: (payload): Promise<FolderMoved> => {
      const { path, moveFiles } = payload as { path: string | null; moveFiles: boolean };
      const to = path ?? FOLDER;
      return later(1500, () => {
        const files = [
          ...start.list.workspaces.map((workspace) => `${workspace.id}.holdx-ws`),
          ...start.list.unreadable.map((file) => file.file_name),
        ].sort();
        // In `folder-taken` the new folder already holds a file of every name.
        const taken = state === "folder-taken";
        const moved = moveFiles && !taken ? files : [];
        const left =
          moveFiles && taken
            ? files.map((file) => ({
                file_name: file,
                path: `${start.list.folder}/${file}`,
                kind: "NameTaken" as const,
                message: `${file} was left in ${start.list.folder}, because a file of that name is already in ${to}. Rename or remove one of the two, then move the file there by hand.`,
              }))
            : [];
        start.settings = { ...start.settings, workspace_dir: path };
        start.list = {
          workspaces: moved.length > 0 ? start.list.workspaces : [],
          unreadable: moved.length > 0 ? start.list.unreadable : [],
          folder: to,
        };
        return { start: structuredClone(start), moved, left };
      });
    },
    workspace_list: () => {
      if (!folderReadable) throw failure("Io", start.list_error?.message ?? "");
      return start.list;
    },
    workspace_create: (payload) => {
      const name = text(payload, "name");
      if (name.toLowerCase().includes("fail")) {
        throw failure(
          "Io",
          `The workspace file could not be created in ${FOLDER} (the disk is full). Free some space, then create the workspace again.`,
        );
      }
      return later(400, () => create(name, []));
    },
    workspace_open: (payload) => {
      const id = text(payload, "id");
      const workspace = start.list.workspaces.find((candidate) => candidate.id === id);
      if (!workspace) {
        throw failure(
          "WorkspaceNotFound",
          "That workspace is not in the workspace folder. It may have been moved or deleted; choose a workspace from the list, or create a new one.",
        );
      }
      if (state === "workspaces-pending") return new Promise<WorkspaceOpen>(() => undefined);
      return later(300, () => open(workspace));
    },
    // The saved views keep the rules of the Rust side (src-tauri/src/app/views.rs), in its order
    // and its words: a name of 1 to 80 characters, unique without regard to case, an address of
    // a data screen without a selection, and at most 100 views.
    save_view: (payload) => {
      const current = viewsOf(payload);
      const name = clean(text(payload, "name"));
      const address = text(payload, "address");
      checkAddress(address);
      checkFree(current, name, null);
      checkRoom(current);
      const id = current.nextId();
      current.issue(id + 1);
      const saved: SavedView = {
        id,
        name,
        address,
        filters: (payload as { filters: FilterSpec }).filters,
      };
      return current.keep([...current.list, saved]);
    },
    rename_view: (payload) => {
      const current = viewsOf(payload);
      const id = idOf(payload);
      const name = clean(text(payload, "name"));
      const found = current.find(id);
      checkFree(current, name, id);
      return current.keep(current.list.map((view) => (view === found ? { ...view, name } : view)));
    },
    delete_view: (payload) => {
      const current = viewsOf(payload);
      const found = current.find(idOf(payload));
      return current.keep(current.list.filter((view) => view !== found));
    },
    restore_view: (payload) => {
      const current = viewsOf(payload);
      const { view, index } = payload as { view: SavedView; index: number };
      const name = clean(view.name);
      checkAddress(view.address);
      if (view.id < 1 || view.id >= current.nextId()) current.find(-1);
      if (current.list.some((other) => other.id === view.id)) {
        throw failure(
          "Internal",
          "That saved view is in the list already, so it was not restored. Reload the list; if it keeps happening, report it.",
        );
      }
      checkFree(current, name, null);
      checkRoom(current);
      const next = [...current.list];
      next.splice(Math.min(index, next.length), 0, { ...view, name });
      return current.keep(next);
    },
    move_view: (payload) => {
      const current = viewsOf(payload);
      const found = current.find(idOf(payload));
      const next = current.list.filter((view) => view !== found);
      next.splice(Math.min((payload as { index: number }).index, next.length), 0, found);
      return current.keep(next);
    },
    workspace_rename: (payload) => {
      const name = text(payload, "name");
      if (!start.open)
        throw failure("NoWorkspace", "No workspace is open. Open a workspace first.");
      if (name.toLowerCase().includes("fail")) {
        throw failure(
          "Io",
          "The workspace file could not be written (it is read-only). Remove the write protection from the file, then rename the workspace again.",
        );
      }
      const renamed = { ...start.open.workspace, name };
      start.open = { ...start.open, workspace: renamed };
      start.list.workspaces = start.list.workspaces.map((workspace) =>
        workspace.id === renamed.id ? renamed : workspace,
      );
      return later(300, () => renamed);
    },
    snapshot_select: (payload) => {
      const id = (payload as { id?: unknown } | undefined)?.id;
      if (!start.open || typeof id !== "number") {
        throw failure("NoWorkspace", "No workspace is open. Open a workspace first.");
      }
      // A selection that is looked at stays on its way, and the Rust side holds what it held.
      if (state === "filters-busy") return new Promise<WorkspaceOpen>(() => undefined);
      start.open = { ...start.open, selected: id };
      return later(250, () => start.open);
    },
    demo_create: () =>
      state === "workspaces-pending"
        ? new Promise<WorkspaceOpen>(() => undefined)
        : later(2200, () => create("Demo", fourSnapshots)),
    import_open: (payload) => {
      const path = text(payload, "path");
      return later(1500, () => {
        if (path.includes("missing")) {
          throw failure(
            "NotFound",
            `The file ${path} was not found. It may have been moved or renamed; choose the file again.`,
          );
        }
        return draft;
      });
    },
    import_choose_sheet: (payload) => {
      const sheet = text(payload, "sheet");
      return later(900, () => {
        if (sheet === "Sheet3") {
          throw failure(
            "NoHolds",
            "No hold could be read: 12 rows were skipped, for example row 2: blank line_id. Check the column mapping and the date format.",
          );
        }
        return sheet === "info"
          ? {
              ...unmappedDraft(),
              file: { ...unmappedDraft().file, sheets: draft.file.sheets, sheet_name: sheet },
            }
          : { ...draft, file: { ...draft.file, sheet_name: sheet } };
      });
    },
    import_review: () => later(700, () => devReview(state, start.list.workspaces)),
    import_check_target: (payload): Promise<TargetCheck> => {
      const target = (payload as { target?: { id?: string } } | undefined)?.target;
      return later(350, () => {
        if (target?.id !== unit573.id) return { already_imported: null, same_day: [] };
        if (state === "import-imported")
          return { already_imported: sameFile, same_day: [sameFile] };
        if (state === "import-same-day") return { already_imported: null, same_day: [earlier] };
        return { already_imported: null, same_day: [] };
      });
    },
    import_commit: (payload): Promise<ImportDone> => {
      const { request, onProgress } = payload as {
        request: ImportCommit;
        onProgress: { onmessage: (phase: ImportPhase) => void };
      };
      window.setTimeout(() => {
        onProgress.onmessage("Checking");
      }, 700);
      if (state === "import-failed") {
        return later(1400, () => {
          throw failure(
            "Io",
            "The workspace file could not be written (the disk is full). Free some space, then import again.",
          );
        });
      }
      window.setTimeout(() => {
        onProgress.onmessage("Storing");
      }, 1600);
      // A commit that is looked at stays where it is.
      if (state === "import-committing") return new Promise<ImportDone>(() => undefined);
      return later(2600, () => {
        const imported: SnapshotInfo = {
          ...snapshot(nextSnapshot, request.taken_at, 9702, 5010),
          file_name: draft.file.file_name,
          date_source: request.date_edited ? "User" : "InfoSheet",
        };
        nextSnapshot += 1;
        const into =
          request.target.kind === "New"
            ? create(request.target.name, []).workspace
            : (start.list.workspaces.find(
                ({ id }) => id === (request.target as { id: string }).id,
              ) ?? unit573);
        const held = (snapshots.get(into.id) ?? []).filter(({ id }) => id !== request.replace);
        const next = [...held, imported];
        snapshots.set(into.id, next);
        const workspace = {
          ...into,
          snapshot_count: next.length,
          latest_taken_at: imported.taken_at,
        };
        start.list.workspaces = start.list.workspaces.map((entry) =>
          entry.id === workspace.id ? workspace : entry,
        );
        return { open: { ...open(workspace), selected: imported.id }, snapshot: imported };
      });
    },
    import_cancel: () => null,
    overview: (payload) => {
      const { spec } = inView(payload);
      overviewReadings += 1;
      if (state === "overview-loading") return new Promise(() => undefined);
      // The first reading answers; every reading after it stays on its way.
      if (state === "overview-updating" && overviewReadings > 1) {
        return new Promise(() => undefined);
      }
      if (state === "overview-error") {
        throw failure(
          "Io",
          "The workspace file could not be read (it is locked by another program). Close the other program, then try again.",
        );
      }
      return later(200, () => devOverview(start.open, overviewShape(state), spec));
    },
    filter_options: (payload): Promise<FilterOptions> => {
      const { spec, inactive, selected } = inView(payload);
      if (state === "filters-error") {
        throw failure(
          "Io",
          "The workspace file could not be read (it is locked by another program). Close the other program, then try again.",
        );
      }
      return later(120, () => {
        // Each count is the filter with that one part replaced, as the command counts them. The
        // states of Lines count the made-up holds their tables show, so the two agree.
        const kept = (part: Partial<FilterSpec>) =>
          selected === undefined
            ? 0
            : isLines
              ? devHoldCount(selected, { ...spec, ...part }, state === "lines-matching-sizes")
              : devKept(selected, { ...spec, ...part });
        const total = kept({});
        const bands = [0.08, 0.13, 0.22, 0.2, 0.37];
        const mismatch = Math.round(kept({ size_mismatch: null }) * 0.06);
        return {
          total,
          facets: {
            open: kept({ status: "Open" }),
            released: kept({ status: "Released" }),
            age_bands: bands.map((share) => Math.round(kept({ age_bands: [] }) * share)),
            size_mismatch: mismatch,
            size_match: kept({ size_mismatch: null }) - mismatch,
          },
          age_bands: [
            { min_days: 0, max_days: 13 },
            { min_days: 14, max_days: 29 },
            { min_days: 30, max_days: 59 },
            { min_days: 60, max_days: 89 },
            { min_days: 90, max_days: null },
          ],
          custom_dims: customDims,
          absent: selected === undefined ? [] : absentOf(selected),
          inactive,
        };
      });
    },
    lines: (payload) => {
      const { spec, selected } = inView(payload);
      const { query, offset } = payload as { query: LineQuery; offset: number };
      if (state === "lines-loading") return new Promise(() => undefined);
      if (state === "lines-error") throw failure("Io", LOCKED);
      return later(150, () =>
        selected === undefined
          ? { total: 0, widest_line_id: 0, rows: [] }
          : devLines(selected, spec, query, offset, state === "lines-matching-sizes"),
      );
    },
    holds: (payload) => {
      const { spec, selected } = inView(payload);
      const { query } = payload as { query: HoldQuery };
      if (state === "lines-loading") return new Promise(() => undefined);
      if (state === "lines-error") throw failure("Io", LOCKED);
      return later(150, () =>
        selected === undefined
          ? { total: 0, widest_line_id: 0, rows: [] }
          : devHolds(selected, spec, query, state === "lines-matching-sizes"),
      );
    },
    line_detail: (payload) => {
      const { selected } = inView(payload);
      const { lineId } = payload as { lineId: string };
      if (state === "detail-loading") return new Promise(() => undefined);
      if (state === "detail-error") throw failure("Io", LOCKED);
      const matching = state === "lines-matching-sizes";
      return later(state === "detail-slow" ? 2000 : 120, () =>
        selected === undefined ? null : devLineDetail(selected, lineId, matching),
      );
    },
    hold_detail: (payload) => {
      const { selected } = inView(payload);
      const { position } = payload as { position: number };
      if (state === "detail-loading") return new Promise(() => undefined);
      if (state === "detail-error") throw failure("Io", LOCKED);
      const matching = state === "lines-matching-sizes";
      return later(state === "detail-slow" ? 2000 : 120, () =>
        selected === undefined ? null : devHoldDetail(selected, position, matching),
      );
    },
    blocker_detail: (payload) => {
      const { spec, selected } = inView(payload);
      const { key } = payload as { key: string };
      if (state === "detail-loading") return new Promise(() => undefined);
      if (state === "detail-error") throw failure("Io", LOCKED);
      const matching = state === "lines-matching-sizes";
      const ranked = openOnly(spec);
      return later(state === "detail-slow" ? 2000 : 150, () =>
        selected === undefined || ranked === null
          ? null
          : devBlockerDetail(selected, ranked, key, matching),
      );
    },
    breakdown: (payload) => {
      const { spec, selected } = inView(payload);
      const { dim } = payload as { dim: Dim };
      const limit = state === "breakdown-many" ? 1500 : Number.POSITIVE_INFINITY;
      return later(150, () =>
        selected === undefined ? [] : devBreakdown(selected, spec, dim, false, limit),
      );
    },
    group_detail: (payload) => {
      const { spec, selected } = inView(payload);
      const { dim, key } = payload as { dim: Dim; key: string };
      if (state === "breakdown-group-loading") return new Promise(() => undefined);
      if (state === "breakdown-group-error") throw failure("Io", LOCKED);
      return later(250, () =>
        selected === undefined ? null : devGroupDetail(selected, spec, dim, key),
      );
    },
    matrix: (payload) => {
      const { spec, selected } = inView(payload);
      const { rowDim, colDim } = payload as { rowDim: Dim; colDim: Dim };
      if (state === "breakdown-matrix-loading") return new Promise(() => undefined);
      if (state === "breakdown-matrix-error") throw failure("Io", LOCKED);
      const side = state === "breakdown-matrix-folded" ? 6 : 30;
      return later(200, () =>
        selected === undefined
          ? {
              rows: [],
              cols: [],
              other_row: null,
              other_col: null,
              cells: [],
              max_cell: 0,
              folded_rows: 0,
              folded_cols: 0,
            }
          : devMatrix(selected, spec, rowDim, colDim, side),
      );
    },
    solve_order: (payload) => {
      const { spec, selected } = inView(payload);
      if (state === "blockers-loading") return new Promise(() => undefined);
      if (state === "blockers-error") throw failure("Io", LOCKED);
      const ranked = openOnly(spec);
      return later(200, () =>
        selected === undefined || ranked === null
          ? { rows: [], lines_on_hold: 0, steps_to_most: 0 }
          : devSolveOrder(selected, ranked),
      );
    },
    // A value is labelled as the picker of its dimension lists it, and with its key otherwise.
    filter_labels: (payload): Promise<FilterLabel[]> => {
      const { spec, selected } = inView(payload);
      return later(100, () =>
        spec.fields.flatMap((field) => {
          const listed = devValues(selected, spec, field.dim, "", true).values;
          return field.values.map((key) => ({
            dim: field.dim,
            key,
            label: listed.find((group) => group.key === key)?.label ?? key,
          }));
        }),
      );
    },
    filter_values: (payload): Promise<ValuePage> => {
      const { spec, selected } = inView(payload);
      const { dim, search } = payload as { dim: Dim; search: string };
      const isPicker = state === "filters-picker";
      return later(isPicker ? 1200 : 150, () => devValues(selected, spec, dim, search, isPicker));
    },
    search: (payload): Promise<SearchResults> => {
      inView(payload);
      const query = text(payload, "query");
      return later(state === "search-slow" ? 3000 : 150, () => {
        if (state === "search-error") throw failure("Internal", LOCKED);
        return state === "search-none" ? { query, groups: [] } : devSearch(query);
      });
    },
    // An export is saved where the dialog says, after a moment of reading and one of writing; it
    // says how many rows the request names, or the snapshot's open holds for every row.
    export_save: (payload): Promise<ExportSaved> => {
      const { request, path, onProgress } = payload as {
        request: ExportRequest;
        path: string;
        onProgress: { onmessage: (phase: ExportPhase) => void };
      };
      const { selected } = inView(payload);
      onProgress.onmessage("Reading");
      return later(300, () => {
        onProgress.onmessage("Writing");
      }).then(() => later(500, () => ({ path, rows: exportedRows(request, selected) })));
    },
    export_copy: (payload) => {
      inView(payload);
      return later(150, () => null);
    },
    export_open: () => null,
    diagnostics_copy: () => later(150, () => "Version: 0.1.0\nOS: linux\n"),
    // The folder dialog picks a folder on the project drive; the file dialog an export.
    "plugin:dialog|open": (payload) => {
      const { options } = payload as { options: { directory?: boolean } };
      return options.directory === true
        ? "/mnt/projects/5359/hold-explorer"
        : "/home/ada/exports/Holds_2026-10-14.xlsx";
    },
    // The save dialog takes the name it offers, in the folder of the exports.
    "plugin:dialog|save": (payload) => {
      const { options } = payload as { options: { defaultPath?: string } };
      return `/home/ada/exports/${options.defaultPath ?? "HoldExplorer.xlsx"}`;
    },
    "plugin:opener|reveal_item_in_dir": () => null,
  };

  mockWindows("main");
  mockIPC(
    (command, payload) => {
      const answer = answers[command];
      if (!answer) {
        throw failure("Internal", `The development page has no answer for the command ${command}.`);
      }
      // A command's answer crosses the boundary as a copy. Handing out the fixture itself would
      // let a later change to the fixture reach what the interface already holds.
      return Promise.resolve(answer(payload)).then((result) => structuredClone(result));
    },
    { shouldMockEvents: true },
  );

  // The drag of a file, played by hand: the mocked window passes the event on to its listeners.
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__: { invoke: (command: string, payload: unknown) => Promise<unknown> };
    }
  ).__TAURI_INTERNALS__;
  const send = (event: string, payload: unknown) =>
    internals.invoke("plugin:event|emit", { event, payload });
  const position = { x: 0, y: 0 };
  Object.assign(window, {
    hxDev: {
      enter: (paths: string[]) => send("tauri://drag-enter", { paths, position }),
      leave: () => send("tauri://drag-leave", null),
      drop: (paths: string[]) => send("tauri://drag-drop", { paths, position }),
    },
  });

  return MARKER;
}
