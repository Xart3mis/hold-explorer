import type { Field } from "../../bindings/Field";
import type { HoldRef } from "../../bindings/HoldRef";
import type { Status } from "../../bindings/Status";
import { Tag, textChars } from "../../components";
import { formatDate, formatDays, isBlank } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";
import { missing, present, sorting, type NeedingColumn } from "./lineColumns";
import { HOLD_SORTS } from "./sorts";

/** Room for a date as the table writes it: `30 Sept 2026`. */
const DATE_CHARS = textChars(formatDate("2026-09-30"));
/** Room for the widest number of days the table may show. */
const DAYS_CHARS = textChars(formatDays(9999));

const date = (value: string | null) => (value === null ? missing() : formatDate(value));
const days = (value: number | null) => (value === null ? missing() : formatDays(value));
/** A text the export left blank reads as every other value a hold does not have. */
const given = (value: string) => (isBlank(value) ? missing() : value);

/**
 * The column of days, by the status the holds were read with: the age of an open hold, the
 * duration of a released one, and among all holds whichever of the two each one has.
 */
const DAYS_HEADER: Record<Status, MessageKey> = {
  Open: "lines.column.age",
  Released: "lines.column.duration",
  All: "lines.column.days",
};

/**
 * The columns of a row per hold, for the status the holds were read with: an open hold has an
 * age; a released hold has the day it was released and how long it was held; among all holds,
 * each says which it is. The line ID is never cut, as in the lines. A column whose field the
 * snapshot has no value in is left out.
 *
 * A column whose value the hold panel shows has a priority, and leaves a table that is too narrow
 * for all of them, the highest number first: role, created, name, blocker type, the release date,
 * hold type, discipline, blocker. The line, the remark, the status, and the days always stay, so
 * the age of a hold is in view at every width the app has.
 */
export function holdColumns(widestLineId: number, absent: readonly Field[], status: Status) {
  const released = <Tag>{t("lines.statusReleased")}</Tag>;
  const open = <Tag>{t("lines.statusOpen")}</Tag>;
  const columns: NeedingColumn<HoldRef>[] = [
    {
      id: "line",
      header: t("lines.column.line"),
      cell: ({ row }) => row.hold.line_id,
      kind: "identifier",
      isRowHeader: true,
      size: { chars: widestLineId },
      needs: [],
    },
    {
      id: "discipline",
      header: t("lines.column.discipline"),
      cell: ({ row }) => row.hold.discipline,
      size: { chars: 14 },
      priority: 2,
      needs: ["Discipline"],
    },
    {
      id: "holdType",
      header: t("lines.column.holdType"),
      cell: ({ row }) => given(row.hold.hold_type),
      size: { chars: 14 },
      priority: 3,
      needs: ["HoldType"],
    },
    {
      id: "remark",
      header: t("lines.column.remark"),
      cell: ({ row }) => row.hold.remark,
      size: { flex: 1, minChars: 24 },
      needs: ["Remark"],
    },
    {
      id: "blocker",
      header: t("lines.column.blocker"),
      // A blocker item is as often a word as a tag: it takes the face of the body, not the
      // monospace of the line ID (DESIGN.md, the Identifier Rule).
      cell: ({ row }) => given(row.blocker.item),
      size: { chars: 14 },
      priority: 1,
      needs: ["Remark"],
    },
    {
      id: "blockerType",
      header: t("lines.column.blockerType"),
      cell: ({ row }) => row.blocker.kind,
      isSupporting: true,
      size: { chars: 10 },
      priority: 5,
      needs: ["Remark"],
    },
    {
      id: "name",
      header: t("lines.column.name"),
      cell: ({ row }) => given(row.hold.name),
      size: { chars: 16 },
      priority: 6,
      needs: ["Name"],
    },
    {
      id: "role",
      header: t("lines.column.role"),
      cell: ({ row }) => given(row.hold.role),
      isSupporting: true,
      size: { chars: 14 },
      priority: 8,
      needs: ["Role"],
    },
    {
      id: "created",
      header: t("lines.column.created"),
      cell: ({ row }) => date(row.hold.created),
      kind: "number",
      size: { chars: DATE_CHARS },
      priority: 7,
      needs: ["Created"],
    },
  ];
  const status_: NeedingColumn<HoldRef> = {
    id: "status",
    header: t("lines.column.status"),
    cell: ({ row }) => (row.hold.released ? released : open),
    size: {
      chars: Math.max(textChars(t("lines.statusReleased")), textChars(t("lines.statusOpen"))) + 2,
    },
    needs: ["Released"],
  };
  const releasedOn: NeedingColumn<HoldRef> = {
    id: "releasedOn",
    header: t("lines.column.releasedOn"),
    cell: ({ row }) => date(row.hold.release_date),
    kind: "number",
    size: { chars: DATE_CHARS },
    priority: 4,
    needs: ["ReleaseDate"],
  };
  const dayCount: NeedingColumn<HoldRef> = {
    id: "days",
    header: t(DAYS_HEADER[status]),
    cell: ({ row }) => days(row.hold.released ? row.duration_days : row.age_days),
    kind: "number",
    size: { chars: DAYS_CHARS },
    needs: ["Created"],
  };
  const byStatus: Record<Status, NeedingColumn<HoldRef>[]> = {
    Open: [dayCount],
    Released: [releasedOn, dayCount],
    All: [status_, releasedOn, dayCount],
  };
  return present(
    [...columns, ...byStatus[status]].map((column) => ({
      ...column,
      ...sorting(HOLD_SORTS, column.id),
    })),
    absent,
  );
}
