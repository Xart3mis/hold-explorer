// What the review page works out from the review and the choices: the snapshot date as the two
// fields hold it, and the target. Nothing here is counted or dated by hand; dates are read and
// written by ui/src/app/format.ts.
import {
  isSameSecond,
  parseDateInput,
  parseTimeInput,
  toDateInput,
  toTimeInput,
  yearOf,
} from "../../app/format";
import type { MessageKey } from "../../app/i18n";
import type { ImportReview } from "../../bindings/ImportReview";
import type { SnapshotDate } from "../../bindings/SnapshotDate";
import type { WorkspaceView } from "../../bindings/WorkspaceView";
import { NEW_WORKSPACE, type ImportChoices } from "./draft";

/**
 * The years a snapshot date may have. The Rust side refuses any other year (the error kind
 * `SnapshotDateOutOfRange`); the date field says so before anything is sent.
 */
export const SNAPSHOT_YEARS = { first: 2000, last: 2100 } as const;

export interface DateState {
  /** What the date field holds. */
  dateText: string;
  /** What the time field holds. */
  timeText: string;
  /** The date or the time differs from what the file gave, or the file gave none. */
  edited: boolean;
  /** What is wrong with the date field, when something is. */
  dateError: MessageKey | null;
  /** What is wrong with the time field, when something is. */
  timeError: MessageKey | null;
  /** The date as `2026-10-07`, once the date field can be read. */
  date: string | null;
  /**
   * The snapshot date to send, once both fields can be read and the year is allowed: the detected
   * one exactly as the review gave it while nothing was changed, the entered one otherwise.
   */
  moment: string | null;
}

/** Reads the two fields of the snapshot date. */
export function readDate(
  detected: SnapshotDate | null,
  choices: Pick<ImportChoices, "date" | "time">,
): DateState {
  const typed = choices.date !== null || choices.time !== null;
  const dateText = choices.date ?? (detected === null ? "" : toDateInput(detected.at));
  const timeText = choices.time ?? (detected === null ? "" : toTimeInput(detected.at));
  const date = parseDateInput(dateText);
  const time = parseTimeInput(timeText);
  const year = date === null ? null : yearOf(date);
  const inRange = year !== null && year >= SNAPSHOT_YEARS.first && year <= SNAPSHOT_YEARS.last;

  // A field that was never touched and is empty has no error yet: the page asks for the date.
  let dateError: MessageKey | null = null;
  if (date === null) {
    if (typed) dateError = "import.review.date.dateInvalid";
  } else if (!inRange) {
    dateError = "import.review.date.dateRange";
  }
  const timeError: MessageKey | null =
    time === null && typed ? "import.review.date.timeInvalid" : null;

  const entered = date !== null && time !== null && inRange ? `${date}T${time}` : null;
  const unchanged = detected !== null && entered !== null && isSameSecond(entered, detected.at);
  return {
    dateText,
    timeText,
    edited: detected === null || (typed && !unchanged),
    dateError,
    timeError,
    date,
    moment: unchanged ? detected.at : entered,
  };
}

export interface TargetState {
  /** The chosen option: the id of a workspace, `NEW_WORKSPACE`, or `null` while nothing is chosen. */
  id: string | null;
  /** The workspace that exists and is chosen. */
  workspace: WorkspaceView | undefined;
  /** A new workspace is chosen. */
  isNew: boolean;
  /** The name of the new workspace, as its field holds it. */
  name: string;
}

/**
 * Reads the target. Until the user chooses, it is the workspace the review suggests; with no
 * workspace at all, it is a new one. Without a suggestion the choice is left to the user.
 */
export function readTarget(
  review: ImportReview,
  choices: Pick<ImportChoices, "target" | "newName">,
): TargetState {
  const { all, suggested } = review.target;
  const proposed = suggested ?? (all.length === 0 ? NEW_WORKSPACE : null);
  const asked = choices.target ?? proposed;
  const workspace = all.find((candidate) => candidate.id === asked);
  const isNew = asked === NEW_WORKSPACE;
  return {
    id: isNew ? NEW_WORKSPACE : (workspace?.id ?? null),
    workspace,
    isNew,
    name: choices.newName ?? review.project_no ?? "",
  };
}
