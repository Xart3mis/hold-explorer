import { ArrowDown, ArrowUp } from "lucide-react";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Cell, Column, Row, Table, TableBody, TableHeader } from "react-aria-components";
import { t } from "../../app/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./DataTable.module.css";

/** What a column holds. It decides the alignment, the figures, and the typeface of its cells. */
export type DataTableColumnKind = "text" | "number" | "identifier";

export interface DataTableColumn<Item> {
  id: string;
  /** The column header, in sentence case. */
  header: string;
  /** What a cell of this column shows for a row. */
  cell: (item: Item) => ReactNode;
  /**
   * `number`: right-aligned on tabular figures. `identifier`: a line ID, a tag, or a blocker
   * item, in the monospace family and never cut. `text` (the default): cut at the end when it
   * does not fit.
   */
  kind?: DataTableColumnKind;
  /** A supporting column is written in the secondary ink. */
  isSupporting?: boolean;
  /** The column whose cell names the row for assistive technology. Give one. */
  isRowHeader?: boolean;
  /** The header is a button that asks for a sort by this column. */
  allowsSorting?: boolean;
  /** A grid track size. Numbers and identifiers take the width of their content otherwise. */
  width?: string;
}

export interface DataTableSort {
  /** The id of the sorted column. */
  column: string;
  direction: "ascending" | "descending";
}

export interface DataTableProps<Item> {
  /** The name of the table. */
  "aria-label": string;
  columns: readonly DataTableColumn<Item>[];
  /** The rows, in the order to show them. The table sorts nothing itself. */
  rows: readonly Item[];
  /** A stable key for a row. */
  rowKey: (item: Item) => string;
  /**
   * The key of the selected row: the one whose detail is open. The screen holds it. Enter or a
   * click on the selected row leaves it selected; only the screen removes the selection, by
   * passing `null`, for example when the detail panel closes on Escape.
   */
  selectedKey?: string | null;
  /** Called with the key of the row that was selected. */
  onSelectionChange?: (key: string) => void;
  /** The sort the rows are in, to mark its column. */
  sort?: DataTableSort;
  /** Called with the sort a pressed header asks for. */
  onSortChange?: (sort: DataTableSort) => void;
  /** Actions on a row, shown in a last column. They are always visible, never on hover alone. */
  rowActions?: (item: Item) => ReactNode;
  /** A density for this table, whatever the density of the app. */
  density?: "comfortable" | "compact";
  /** A first load: skeleton rows at the current density. */
  isLoading?: boolean;
  /** How many skeleton rows a first load shows. */
  skeletonRows?: number;
  /** A refetch: the previous rows stay, dimmed, until the new rows arrive. */
  isStale?: boolean;
  /** What to show under the header when there is no row: an `EmptyState` placed for a table. */
  emptyState?: ReactNode;
  className?: string | undefined;
}

const ACTIONS = "data-table-actions";

/** How many shapes a skeleton line of a text column has; the stylesheet gives each its width. */
const TEXT_SHAPES = 4;

function trackOf(kind: DataTableColumnKind, width: string | undefined): string {
  if (width !== undefined) return width;
  return kind === "text" ? "minmax(0, 1fr)" : "max-content";
}

/**
 * The table of the app: a ruled page that behaves like a grid. Arrow keys, Home, and End move
 * the focused row; Enter selects it; a sortable header is pressed to ask for a sort. It sits
 * directly on the content area, with no container around it. It is not virtualized.
 *
 * On a first load the body holds placeholders in the shape of rows. They are a picture, not
 * rows: nothing in them takes focus, and assistive technology is told once that rows are loading.
 */
export function DataTable<Item>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onSelectionChange,
  sort,
  onSortChange,
  rowActions,
  density,
  isLoading,
  skeletonRows = 8,
  isStale,
  emptyState,
  className,
  ...props
}: DataTableProps<Item>) {
  const countId = useId();
  const [scrolled, setScrolled] = useState(false);
  const loading = isLoading === true;
  const tracks = columns.map((column) => trackOf(column.kind ?? "text", column.width));
  if (rowActions !== undefined) tracks.push("max-content");

  return (
    <div
      data-density={density}
      aria-busy={loading ? "true" : undefined}
      data-stale={isStale === true && !loading ? "" : undefined}
      data-scrolled={scrolled ? "" : undefined}
      className={cx(styles.scroller, className)}
      onScroll={(event) => {
        setScrolled(event.currentTarget.scrollTop > 0);
      }}
    >
      <VisuallyHidden id={countId} role="status">
        {loading ? t("table.loading") : t("table.rowCount", { count: rows.length })}
      </VisuallyHidden>
      <Table
        aria-label={props["aria-label"]}
        aria-describedby={countId}
        selectionMode={loading ? "none" : "single"}
        selectionBehavior="toggle"
        disallowEmptySelection
        selectedKeys={selectedKey === undefined || selectedKey === null ? [] : [selectedKey]}
        onSelectionChange={(keys) => {
          if (keys === "all") return;
          const [key] = keys;
          if (key !== undefined) onSelectionChange?.(String(key));
        }}
        {...(sort === undefined ? {} : { sortDescriptor: sort })}
        onSortChange={(descriptor) => {
          onSortChange?.({ column: String(descriptor.column), direction: descriptor.direction });
        }}
        className={cx(styles.table)}
        style={{ "--table-columns": tracks.join(" ") } as CSSProperties}
      >
        <TableHeader className={cx(styles.head)}>
          {columns.map((column) => (
            <Column
              key={column.id}
              id={column.id}
              isRowHeader={column.isRowHeader === true}
              allowsSorting={column.allowsSorting === true && !loading}
              textValue={column.header}
              data-kind={column.kind ?? "text"}
              className={cx(styles.column)}
            >
              {({ sortDirection }) => (
                <>
                  {column.header}
                  {sortDirection === undefined ? null : (
                    <Icon icon={sortDirection === "ascending" ? ArrowUp : ArrowDown} />
                  )}
                </>
              )}
            </Column>
          ))}
          {rowActions === undefined ? null : (
            <Column id={ACTIONS} textValue={t("table.actions")} className={cx(styles.column)}>
              <VisuallyHidden>{t("table.actions")}</VisuallyHidden>
            </Column>
          )}
        </TableHeader>
        <TableBody
          className={cx(styles.body)}
          renderEmptyState={() =>
            loading ? (
              <>
                {/* The one line assistive technology reads in place of the rows. */}
                <VisuallyHidden>{t("table.loading")}</VisuallyHidden>
                <div aria-hidden="true" className={styles.placeholders}>
                  {Array.from({ length: skeletonRows }, (_, row) => (
                    <div key={row} data-part="skeleton-row" className={styles.placeholder}>
                      {columns.map((column) => (
                        <div
                          key={column.id}
                          data-kind={column.kind ?? "text"}
                          data-shape={row % TEXT_SHAPES}
                          className={styles.placeholderCell}
                        >
                          <Skeleton className={styles.placeholderLine} />
                        </div>
                      ))}
                      {rowActions === undefined ? null : <div />}
                    </div>
                  ))}
                </div>
              </>
            ) : emptyState === undefined ? null : (
              <div className={styles.empty}>{emptyState}</div>
            )
          }
        >
          {loading
            ? null
            : rows.map((item) => {
                const key = rowKey(item);
                return (
                  <Row key={key} id={key} className={cx(styles.row)}>
                    {columns.map((column) => (
                      <Cell
                        key={column.id}
                        data-kind={column.kind ?? "text"}
                        data-supporting={column.isSupporting === true ? "" : undefined}
                        className={cx(styles.cell)}
                      >
                        {column.cell(item)}
                      </Cell>
                    ))}
                    {rowActions === undefined ? null : (
                      <Cell data-kind="actions" className={cx(styles.cell)}>
                        {rowActions(item)}
                      </Cell>
                    )}
                  </Row>
                );
              })}
        </TableBody>
      </Table>
    </div>
  );
}
