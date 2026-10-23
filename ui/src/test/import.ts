// Fixtures of the import flow: a file as the commands describe it at each step. The tests and the
// development page (ui/src/dev/) both read them, so what is looked at is what is tested.
import type { ColumnMap } from "../bindings/ColumnMap";
import type { Field } from "../bindings/Field";
import type { ImportDone } from "../bindings/ImportDone";
import type { ImportDraft } from "../bindings/ImportDraft";
import type { ImportReview } from "../bindings/ImportReview";
import type { ImportWarning } from "../bindings/ImportWarning";
import type { SkippedRow } from "../bindings/SkippedRow";
import type { SnapshotInfo } from "../bindings/SnapshotInfo";
import type { TargetCheck } from "../bindings/TargetCheck";
import type { WarningGroup } from "../bindings/WarningGroup";
import type { WarningKind } from "../bindings/WarningKind";
import type { WorkspaceView } from "../bindings/WorkspaceView";
import { opened, otherWorkspace, snapshot, twoSnapshots, workspace } from "./fixtures";

/** The headers of a full export, in the order the export writes them, and one extra column. */
export const EXPORT_HEADERS = [
  "id",
  "line_id",
  "name",
  "role",
  "hold_remark",
  "hold_type",
  "discipline",
  "date",
  "released",
  "release_remark",
  "release_date",
  "model_size",
  "ldt_size",
  "stress_calc",
  "Area",
];

const EXPORT_FIELDS: Field[] = [
  "SourceId",
  "LineId",
  "Name",
  "Role",
  "Remark",
  "HoldType",
  "Discipline",
  "Created",
  "Released",
  "ReleaseRemark",
  "ReleaseDate",
  "ModelSize",
  "LdtSize",
  "StressCalc",
];

/** The mapping of a full export: every field has the column the export gives it. */
export function exportMap(): ColumnMap {
  const fields: ColumnMap["fields"] = {};
  EXPORT_FIELDS.forEach((field, column) => {
    fields[field] = column;
  });
  return { fields, extras: [{ column: 14, name: "Area" }] };
}

const EXPORT_PREVIEW = [
  [
    "104223",
    "78B01-573-4434-FW-001",
    "A. Okafor",
    "Piping engineer",
    "HOLD FOR 577-PR-400 VENDOR DATA",
    "Vendor data",
    "Process",
    "2026-08-03 09:14",
    "FALSE",
    "",
    "",
    '6"',
    "6",
    "NR",
    "573",
  ],
  [
    "104224",
    "78B01-573-4434-FW-002",
    "A. Okafor",
    "Piping engineer",
    "HOLD FOR STRESS CALC SC-0417",
    "Stress",
    "",
    "2026-08-03 09:20",
    "TRUE",
    "Released after SC-0417 rev B",
    "2026-09-18 15:02",
    '4"',
    "4",
    "SC-0417",
    "573",
  ],
  [
    "104310",
    "78B01-573-OO-0100",
    "M. Haddad",
    "Lead",
    "FIV/AIV REPORT",
    "Study",
    "Mechanical",
    "2026-08-11 13:40",
    "FALSE",
    "",
    "",
    '12"',
    "12",
    "NR",
    "573",
  ],
];

/** A full export, read from the sheet named `data` of a workbook with two sheets. */
export function exportDraft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  const map = exportMap();
  return {
    file: {
      file_name: "Holds_2026-10-14.xlsx",
      content_hash: "f".repeat(64),
      sheet_name: "data",
      sheets: ["info", "data"],
      headers: EXPORT_HEADERS,
      preview: EXPORT_PREVIEW,
      auto_map: map,
      error_cells: 0,
      row_count: 9702,
    },
    proposed: map,
    required: ["LineId", "Remark", "HoldType"],
    missing_required: [],
    used_saved_mapping: false,
    saved_mapping_problem: null,
    ...overrides,
  };
}

/** The headers of a file nobody mapped yet: no header names a field. */
export const TRIMMED_HEADERS = ["Kind", "Line", "Why", "Raised on", "Size"];

/**
 * A text file whose headers name no field: every required field is missing, and the automatic
 * mapping keeps every column as an extra one.
 */
export function unmappedDraft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  const map: ColumnMap = {
    fields: {},
    extras: TRIMMED_HEADERS.map((name, column) => ({ column, name })),
  };
  return {
    file: {
      file_name: "open-holds.csv",
      content_hash: "e".repeat(64),
      sheet_name: "open-holds.csv",
      sheets: [],
      headers: TRIMMED_HEADERS,
      preview: [
        ["Vendor data", "78B01-573-4434-FW-001", "HOLD FOR 577-PR-400", "03/08/2026", '6"'],
        ["Stress", "78B01-573-4434-FW-002", "HOLD FOR SC-0417", "03/08/2026", '4"'],
        ["Study", "78B01-573-OO-0100", "", "11/08/2026", '12"'],
      ],
      auto_map: map,
      error_cells: 0,
      row_count: 5042,
    },
    proposed: map,
    required: ["LineId", "Remark", "HoldType"],
    missing_required: ["LineId", "Remark", "HoldType"],
    used_saved_mapping: false,
    saved_mapping_problem: null,
    ...overrides,
  };
}

/** The same file once the workspace's saved mapping was applied to it: nothing is missing. */
export function savedMappingDraft(): ImportDraft {
  const base = unmappedDraft();
  return {
    ...base,
    proposed: {
      fields: { HoldType: 0, LineId: 1, Remark: 2, Created: 3 },
      extras: [{ column: 4, name: "Size" }],
    },
    missing_required: [],
    used_saved_mapping: true,
  };
}

export const unit573 = workspace();

/** What the review of the full export finds: nothing skipped, nothing assumed. */
export function review(overrides: Partial<ImportReview> = {}): ImportReview {
  return {
    file_name: "Holds_2026-10-14.xlsx",
    project_no: "5359-200",
    detected: { at: "2026-10-14T08:00:00", source: "InfoSheet" },
    date_needs_confirmation: false,
    row_count: 9702,
    open_count: 5010,
    released_count: 4692,
    limited: false,
    skipped_count: 0,
    skipped: [],
    warning_count: 0,
    warnings: [],
    mapping: exportMap(),
    target: {
      suggested: unit573.id,
      matching: [unit573],
      all: [otherWorkspace, unit573],
    },
    min_year: 2000,
    max_year: 2100,
    ...overrides,
  };
}

/** Skipped rows of both kinds, in file order. */
export function skippedRows(count: number): SkippedRow[] {
  return Array.from({ length: count }, (_, index): SkippedRow => {
    const row = 418 + index * 7;
    return index % 3 === 1
      ? {
          row_number: row,
          kind: "UnreadableDate",
          value: `31/02/${String(2026 - (index % 2))}`,
          reason: `unparseable date "31/02/${String(2026 - (index % 2))}"`,
        }
      : { row_number: row, kind: "BlankLineId", value: null, reason: "blank line_id" };
  });
}

function warning(
  kind: WarningKind,
  row: number | null,
  column: string | null,
  value: string | null,
  detail: string,
): ImportWarning {
  return { kind, row_number: row, column, value, detail };
}

/** Warnings of four kinds, one of them with more of its kind than the five that are listed. */
export function warningGroups(): WarningGroup[] {
  return [
    {
      kind: "UnreadableReleaseDate",
      count: 37,
      examples: [612, 640, 655, 701, 733].map((row) =>
        warning(
          "UnreadableReleaseDate",
          row,
          "release_date",
          "soon",
          `Row ${String(row)}: the release date "soon" could not be read as a date, so the hold has no release date. Correct the value in the source and import again.`,
        ),
      ),
    },
    {
      kind: "UnrecognizedReleased",
      count: 2,
      examples: [88, 1204].map((row) =>
        warning(
          "UnrecognizedReleased",
          row,
          "released",
          "maybe",
          `Row ${String(row)}: the released value "maybe" is not a recognized true or false value, so the hold is treated as open. Correct the value in the source and import again.`,
        ),
      ),
    },
    {
      kind: "AssumedDateOrder",
      count: 1,
      examples: [
        warning(
          "AssumedDateOrder",
          null,
          "date",
          null,
          'The dates in column "date" such as 02/09/2026 could be day/month or month/day, and no value settles it, so they were read day-first. If they are month-first, change the dates in the source to yyyy-mm-dd and import again.',
        ),
      ],
    },
    {
      kind: "ErrorCells",
      count: 1,
      examples: [
        warning(
          "ErrorCells",
          null,
          null,
          null,
          "4 cells hold a spreadsheet error such as #N/A and were read as blank. Correct them in the source and import again if the values matter.",
        ),
      ],
    },
  ];
}

/** A review with skipped rows and warnings of several kinds. */
export function reviewWithFindings(skipped = 12): ImportReview {
  const warnings = warningGroups();
  return review({
    row_count: 9702 - skipped,
    open_count: 5010 - skipped,
    skipped_count: skipped,
    skipped: skippedRows(Math.min(skipped, 200)),
    warning_count: 41,
    warnings,
  });
}

/** A review whose only date is the file's modified time. */
export function reviewToConfirm(): ImportReview {
  return review({
    file_name: "open-holds.csv",
    project_no: null,
    detected: { at: "2026-10-12T16:41:09", source: "FileTime" },
    date_needs_confirmation: true,
    mapping: savedMappingDraft().proposed,
    row_count: 5042,
    open_count: 5042,
    released_count: 0,
    limited: true,
    target: { suggested: unit573.id, matching: [], all: [otherWorkspace, unit573] },
  });
}

/** A workspace that has nothing against the file: not imported yet, no snapshot of the day. */
export const freeTarget: TargetCheck = { already_imported: null, same_day: [] };

/** The snapshot a workspace already has of the same day. */
export const sameDaySnapshot: SnapshotInfo = snapshot(7, "2026-10-14T06:30:00", {
  file_name: "Holds_2026-10-14_early.xlsx",
  row_count: 9688,
  open_count: 5021,
});

/** The snapshot a workspace already has of the very same file. */
export const sameFileSnapshot: SnapshotInfo = snapshot(8, "2026-10-14T08:00:00", {
  file_name: "Holds_2026-10-14.xlsx",
  content_hash: "f".repeat(64),
  date_source: "InfoSheet",
  row_count: 9702,
  open_count: 5010,
});

/** What a commit into a workspace returns: the workspace open, with the new snapshot selected. */
export function done(
  into: WorkspaceView = unit573,
  overrides: Partial<ImportDone> = {},
): ImportDone {
  const imported = snapshot(3, "2026-10-14T08:00:00", {
    file_name: "Holds_2026-10-14.xlsx",
    content_hash: "f".repeat(64),
    date_source: "InfoSheet",
    row_count: 9702,
    open_count: 5010,
  });
  const held = into.id === unit573.id ? twoSnapshots : [];
  return {
    open: opened({
      workspace: {
        ...into,
        snapshot_count: held.length + 1,
        latest_taken_at: imported.taken_at,
      },
      snapshots: [...held, imported],
      selected: imported.id,
    }),
    snapshot: imported,
    ...overrides,
  };
}
