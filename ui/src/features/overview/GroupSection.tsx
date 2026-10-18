import { useId } from "react";
import { isSameDim } from "../../app/filters/dims";
import type { Filters } from "../../app/filters/state";
import type { Dim } from "../../bindings/Dim";
import type { Group } from "../../bindings/Group";
import {
  BarRow,
  BarRowGroup,
  Checkbox,
  DataTable,
  type DataTableColumn,
  textChars,
} from "../../components";
import { formatCount } from "../../text/format";
import { t } from "../../text/i18n";
import styles from "./Section.module.css";

export interface GroupSectionProps {
  /** What the group shows: "Open holds by discipline". */
  title: string;
  /** What a row of it is: "Discipline". The header of the first column of its table. */
  column: string;
  /**
   * The name of its switch for assistive technology. Both switches show "Show as table"; the
   * name adds the group, so that two controls of one page do not share a name. It starts with
   * the words that are shown, so that the switch can also be asked for by them.
   */
  toTable: string;
  /** What the group says when the command sent it no row. */
  none: string;
  /** The groups as the command sent them. Absent on a first load. */
  groups?: readonly Group[];
  skeletonRows: number;
  /** Whether the group is shown as a table in place of its bars. */
  asTable: boolean;
  onAsTableChange: (asTable: boolean) => void;
  /** Whether a value of the group is in the active filter. */
  isFiltered: (group: Group) => boolean;
  /** Filters by the value of a bar that is pressed. */
  onPress: (group: Group) => void;
}

/** Whether the filters keep a value of a dimension: it is among the values of its entry. */
export function isFilteredBy(filters: Filters, dim: Dim, group: Group): boolean {
  return filters.fields.some(
    (entry) =>
      isSameDim(entry.dim, dim) &&
      !entry.negate &&
      entry.values.some((value) => value.key === group.key),
  );
}

/** The room the widest of the counts shown needs, so the name of the group gets the rest. */
function countChars(counts: readonly number[]): number {
  return Math.max(1, ...counts.map((count) => textChars(formatCount(count))));
}

/** The least room of the name of a group before its table scrolls sideways. */
const LABEL_CHARS = 16;

const ALL_ROWS = { maxRows: Number.POSITIVE_INFINITY } as const;

/**
 * One group of the page: its title, the switch to its table, and its rows, as bars or as a table.
 * A bar is pressed to see the lines of its value: it filters by that value and opens Lines.
 * The rows are shown in the order the command sends, largest first; the interface sorts nothing.
 * The length of a bar is its row's holds as a share of the largest count of the group; no number
 * that is shown is worked out here.
 */
export function GroupSection({
  title,
  column,
  toTable,
  none,
  groups,
  skeletonRows,
  asTable,
  onAsTableChange,
  isFiltered,
  onPress,
}: GroupSectionProps) {
  const titleId = useId();
  const rows = groups ?? [];
  const largest = rows.reduce((most, group) => Math.max(most, group.holds), 0);
  const columns: DataTableColumn<Group>[] = [
    {
      id: "label",
      header: column,
      cell: (group) => group.label,
      isRowHeader: true,
      size: { flex: 1, minChars: LABEL_CHARS },
    },
    {
      id: "holds",
      header: t("overview.columnHolds"),
      cell: (group) => formatCount(group.holds),
      kind: "number",
      size: { chars: countChars(rows.map((group) => group.holds)) },
    },
    {
      id: "lines",
      header: t("overview.columnLines"),
      cell: (group) => formatCount(group.lines),
      kind: "number",
      isSupporting: true,
      size: { chars: countChars(rows.map((group) => group.lines)) },
    },
  ];

  return (
    <section className={styles.group}>
      <div className={styles.groupHeader}>
        <h2 id={titleId} className={styles.groupTitle}>
          {title}
        </h2>
        {rows.length === 0 ? null : (
          <Checkbox isSelected={asTable} onChange={onAsTableChange} aria-label={toTable}>
            {t("overview.showAsTable")}
          </Checkbox>
        )}
      </div>
      {groups === undefined ? (
        <BarRowGroup isLoading skeletonRows={skeletonRows} aria-labelledby={titleId} />
      ) : rows.length === 0 ? (
        <p className={styles.none}>{none}</p>
      ) : asTable ? (
        <DataTable
          aria-label={title}
          columns={columns}
          rows={rows}
          // A blank value has the empty key, and a row needs a key that is not empty.
          rowKey={(group) => `group:${group.key}`}
          // A group is read whole, as its bars are: the page scrolls, the table does not.
          height={ALL_ROWS}
        />
      ) : (
        <BarRowGroup aria-labelledby={titleId}>
          {rows.map((group) => (
            <BarRow
              key={group.key}
              isSelected={isFiltered(group)}
              onPress={() => {
                onPress(group);
              }}
              label={group.label}
              value={formatCount(group.holds)}
              secondaryValue={t("overview.lines", { count: group.lines })}
              fraction={largest > 0 ? group.holds / largest : 0}
            />
          ))}
        </BarRowGroup>
      )}
    </section>
  );
}
