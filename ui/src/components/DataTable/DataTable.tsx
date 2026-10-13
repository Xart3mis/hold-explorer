import { ArrowDown, ArrowUp } from "lucide-react";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Cell,
  Collection,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
  TableLayout,
  TableLoadMoreItem,
  Virtualizer,
  type Key,
  type TableLayoutProps,
} from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import { columnWidth, headerWidth, type ColumnSize, type DataTableColumnKind } from "./columns";
import styles from "./DataTable.module.css";
import { useCharWidths, useTableMetrics } from "./measure";

export { textChars, type ColumnSize, type DataTableColumnKind } from "./columns";

export interface DataTableColumn<Item> {
  id: string;
  /** The column header, in sentence case. */
  header: string;
  /** What a cell of this column shows for a row. */
  cell: (item: Item) => ReactNode;
  /**
   * `number`: right-aligned on tabular figures. `identifier`: a line ID, a tag, or a blocker
   * item, in the monospace family and never cut: size its column from the widest value. `text`
   * (the default): cut at the end when it does not fit.
   */
  kind?: DataTableColumnKind;
  /**
   * How wide the column is. Nothing is measured from what the cells hold: only the rows near
   * the visible part exist. A column is never narrower than its header needs.
   */
  size: ColumnSize;
  /** A supporting column is written in the secondary ink. */
  isSupporting?: boolean;
  /**
   * The column whose cell names the row for assistive technology. Give one. It stays in view
   * while the other columns scroll sideways.
   */
  isRowHeader?: boolean;
  /** The header is a button that asks for a sort by this column. */
  allowsSorting?: boolean;
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
   * passing `null`, for example when the detail panel closes on Escape. It marks a row only in
   * a table whose rows can be selected.
   */
  selectedKey?: string | null;
  /**
   * Called with the key of the row that was selected. Giving it makes the rows selectable.
   * Without it the table is there to be read: no row is marked as selectable or selected, and a
   * row does not answer to the pointer.
   */
  onSelectionChange?: (key: string) => void;
  /** The sort the rows are in, to mark its column. */
  sort?: DataTableSort;
  /** Called with the sort a pressed header asks for. */
  onSortChange?: (sort: DataTableSort) => void;
  /** Actions on a row, shown in a last column. They are always visible, never on hover alone. */
  rowActions?: (item: Item) => ReactNode;
  /** The width of the column of the row actions, as a column declares its own. */
  rowActionsSize?: ColumnSize;
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
  /** `fill`: the table takes the height of its container and scrolls inside it. Otherwise it is as tall as its rows, up to `maxRows`, then scrolls. Default `{ maxRows: 12 }`. */
  height?: "fill" | { maxRows: number };
  /** Rows in the whole result, when `rows` is only the part loaded. */
  totalRows?: number;
  /** The count line, written by the caller from the catalog: "200 of 3,612 lines". */
  countText?: (shown: number, total: number) => string;
  /**
   * Called when the end of the loaded rows comes into view. Only a table that scrolls inside
   * itself asks: a table as tall as its rows (`maxRows: Infinity`, or `fill` in a container
   * without a height) has its end in view at all times and would ask for every page at once, so
   * it asks for none, and says so on the console in a development build.
   */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  /**
   * What the rows are a result of: the filter, the sort. When it changes, the rows are another
   * result: the table returns to its top and forgets that it asked for more. The table compares
   * this and nothing else, so rows that only grow, shrink, or are read again under the same key
   * keep their place, and without a key the table never takes its rows for another result.
   */
  resultKey?: string;
  className?: string | undefined;
}

const ACTIONS = "data-table-actions";

/** How many shapes a skeleton line of a text column has; the stylesheet gives each its width. */
const TEXT_SHAPES = 4;

/** The room of the row actions where the caller declares none: a short verb in a quiet button. */
const ACTIONS_SIZE: ColumnSize = { chars: 12 };

const DEFAULT_HEIGHT = { maxRows: 12 } as const;

/** The table has one header row, which is a row of the grid as the others are. */
const HEADER_ROWS = 1;

/** The rows of a table that is loading: none, and the same none at every render. */
const NO_ROWS: readonly never[] = [];

/** What the layout is told besides the heights: how tall the body is while it has no row. */
interface LayoutOptions extends TableLayoutProps {
  emptyHeight?: number;
}

/** The part of a node of the collection that says which column it belongs to. */
interface ColumnPart {
  type: string;
  key: Key;
  index: number;
  colIndex?: number | null;
}

/**
 * The layout of the component library for a table, with four things of our own. The column
 * that names the row is pinned, so it stays while the rest scrolls sideways. The rows run the
 * width of the table also where the columns need less. A body without rows is as tall as it is
 * told: the library would give it the height of the scroller, which here follows from the
 * rows. And where nothing is laid out, the columns get widths that can be counted with.
 *
 * It builds on parts of the library's layout that are not all meant for us, so `package.json`
 * names `react-aria-components` by its exact version. On an upgrade, check again that the
 * header and the body nodes take `allowOverflow`, that a row takes its width from the header's,
 * that `layoutOptions.columnWidths` is still used as given, and that a `Column` outside a
 * `ResizableTableContainer` still has its `width` and `minWidth` read by the layout. The tests
 * of the pinned column, the widths, the empty height, and the row width fail if one of them goes.
 */
class DataTableLayout<T> extends TableLayout<T, LayoutOptions> {
  private emptyHeight = 0;

  override shouldInvalidateLayoutOptions(next: LayoutOptions, previous: LayoutOptions): boolean {
    return (
      next.emptyHeight !== previous.emptyHeight ||
      super.shouldInvalidateLayoutOptions(next, previous)
    );
  }

  override update(context: Parameters<TableLayout<T, LayoutOptions>["update"]>[0]): void {
    this.emptyHeight = context.layoutOptions?.emptyHeight ?? this.emptyHeight;
    if (Number.isFinite(this.virtualizer?.size.width)) {
      super.update(context);
      return;
    }
    // Nothing is laid out, as in a test that gives the table no size: the library then takes
    // the table for endlessly wide, and a share of that is no width. Every column gets the
    // least it declares, which is what it would get in a table with no room to share.
    const columnWidths = new Map<Key, number>();
    for (const column of this.collection.columns) {
      const { width, minWidth } = column.props as { width?: unknown; minWidth?: unknown };
      const least = typeof minWidth === "number" ? minWidth : 0;
      columnWidths.set(column.key, typeof width === "number" ? width : least);
    }
    super.update({ ...context, layoutOptions: { ...context.layoutOptions, columnWidths } });
  }

  protected override isStickyColumn(node: ColumnPart): boolean {
    const column =
      node.type === "column" ? node : this.collection.columns[node.colIndex ?? node.index];
    return column !== undefined && this.collection.rowHeaderColumnKeys.has(column.key);
  }

  protected override buildTableHeader() {
    const header = super.buildTableHeader();
    // A pinned column sticks to the nearest element that clips, so nothing between it and the
    // scroller may clip: the header and the body let their content show.
    header.layoutInfo.allowOverflow = true;
    // Where nothing is laid out the library takes the scroller for endless.
    const width = this.virtualizer?.size.width ?? 0;
    if (Number.isFinite(width) && width > header.layoutInfo.rect.width) {
      header.layoutInfo.rect.width = width;
    }
    return header;
  }

  protected override buildRowGroup(...group: Parameters<TableLayout<T>["buildRowGroup"]>) {
    const body = super.buildRowGroup(...group);
    body.layoutInfo.allowOverflow = true;
    if (this.collection.size === 0) body.layoutInfo.rect.height = this.emptyHeight;
    return body;
  }
}

/** What a cell needs to know of its column to be drawn; the rows are kept by these alone. */
interface CellShape {
  id: string;
  kind: DataTableColumnKind;
  isSupporting: boolean;
  isPinned: boolean;
}

/**
 * What the cells show. The rows of the table are built once for each item and kept, whatever
 * the caller renders meanwhile; a cell that is in the document reads what it shows from here,
 * so a change of the columns or of the row actions reaches the cells on screen and no other.
 */
interface Content {
  cell: (column: number, item: unknown) => ReactNode;
  actions: (item: unknown) => ReactNode;
}

const ContentContext = createContext<Content>({ cell: () => null, actions: () => null });

/**
 * The item of the row a cell is in. A cell is not handed its item: the cells of every row are
 * the same few elements, one for each column, and a row that is drawn says here whose row it is.
 * So a row costs the component library one element to keep, however many columns it has.
 */
const ItemContext = createContext<unknown>(null);

/** What a cell shows. It is drawn again when its row or what the cells show changes, and not because its cell was. */
const CellValue = memo(function CellValue({ column }: { column: number }) {
  const item = useContext(ItemContext);
  return <span className={styles.value}>{useContext(ContentContext).cell(column, item)}</span>;
});

const RowActions = memo(function RowActions() {
  const item = useContext(ItemContext);
  return useContext(ContentContext).actions(item);
});

/** The width a column declares, as the layout takes it. */
interface Width {
  width: number | `${number}fr`;
  minWidth: number;
}

/**
 * The room of a column in a row of placeholders. The rows of the table are placed by the
 * layout; a placeholder is a plain row, and shares its width out the same way: a column of a
 * fixed width keeps it, and one that takes a share grows from the least it declares.
 */
function room({ width, minWidth }: Width): CSSProperties {
  return typeof width === "number"
    ? { flex: "none", inlineSize: width }
    : { flex: `${String(Number.parseFloat(width))} 1 0`, minInlineSize: minWidth };
}

/** A picture of a row: a skeleton line in each column, in the room of that column. */
function PlaceholderRow({
  part,
  shape,
  columns,
  widths,
}: {
  part: string;
  shape: number;
  columns: readonly CellShape[];
  /** The widths of the columns, and after them the width of the row actions when there are any. */
  widths: readonly Width[];
}) {
  return (
    <div data-part={part} className={styles.placeholder}>
      {widths.map((width, index) => {
        const column = columns[index];
        // The column of the row actions holds no line.
        if (column === undefined) return <div key="actions" style={room(width)} />;
        return (
          <div
            key={column.id}
            data-kind={column.kind}
            data-shape={shape}
            className={styles.placeholderCell}
            style={room(width)}
          >
            <Skeleton className={styles.placeholderLine} />
          </div>
        );
      })}
    </div>
  );
}

/** Said in a development build, once by each table it is true of, so a caller notices: see `onLoadMore`. */
function warnOfUnboundedHeight(): void {
  if (!import.meta.env.DEV) return;
  console.error(
    "DataTable was given onLoadMore, but its height is not bounded: it is as tall as its rows, " +
      "so the end of its rows is always in view and it would ask for every page at once. It asks " +
      'for none. Give it height="fill" inside a container that has a height, or a maxRows.',
  );
}

/**
 * The table of the app: a ruled page that behaves like a grid. Arrow keys, Home, End, Page Up,
 * and Page Down move the focused row; in a table with a selection handler Enter selects it; a
 * sortable header is pressed to ask for a sort. It sits directly on the content area, with no
 * container around it.
 *
 * Only the rows near the visible part are in the document, so the table stays quick with
 * thousands of rows, and the columns are as wide as they declare. The focused row stays in the
 * document while it is scrolled away. When the end of the rows comes near the visible part the
 * table asks for more, once for each time it arrives there and again only when rows were added.
 * When the caller says the rows are another result (`resultKey`), it returns to its top.
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
  rowActionsSize = ACTIONS_SIZE,
  density,
  isLoading,
  skeletonRows = 8,
  isStale,
  emptyState,
  height = DEFAULT_HEIGHT,
  totalRows,
  countText,
  onLoadMore,
  isLoadingMore,
  resultKey,
  className,
  ...props
}: DataTableProps<Item>) {
  const countId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [scrolledAcross, setScrolledAcross] = useState(false);
  // What the scroller itself has to be asked: how much of its height a sideways scrollbar takes,
  // and how wide the layout made the pinned column.
  const [measured, setMeasured] = useState({ scrollbar: 0, pinned: 0 });
  const metrics = useTableMetrics(density);
  const chars = useCharWidths();
  const loading = isLoading === true;
  const loadingMore = isLoadingMore === true && !loading;
  const selectable = onSelectionChange !== undefined && !loading;
  const hasActions = rowActions !== undefined;
  const shown = loading ? NO_ROWS : rows;
  const total = totalRows ?? rows.length;

  const widths = columns.map((column): Width => {
    const sized = columnWidth(column.size, column.kind ?? "text", chars, metrics.paddingX);
    const least = headerWidth(
      column.header,
      column.allowsSorting === true,
      chars,
      metrics.paddingX,
      metrics.arrow,
    );
    return {
      width: typeof sized.width === "number" ? Math.max(sized.width, least) : sized.width,
      minWidth: Math.max(sized.minWidth, least),
    };
  });
  const actionsWidth = columnWidth(rowActionsSize, "text", chars, metrics.paddingX);
  const placeholderWidths = hasActions ? [...widths, actionsWidth] : widths;
  // The rows are built again only when what a row is made of changes: which columns, of which
  // kind, and whether there are actions. What a cell shows is not part of that.
  const shape = JSON.stringify(
    columns.map((column): CellShape => ({
      id: column.id,
      kind: column.kind ?? "text",
      isSupporting: column.isSupporting === true,
      isPinned: column.isRowHeader === true,
    })),
  );
  const cells = useMemo(() => JSON.parse(shape) as CellShape[], [shape]);
  const content = useMemo(
    (): Content => ({
      // The items the cells are handed are the rows of this table, so they are `Item`s.
      cell: (column, item) => columns[column]?.cell(item as Item),
      actions: (item) => rowActions?.(item as Item),
    }),
    [columns, rowActions],
  );
  // The key of a row is asked for once, when the row is built. A caller writes `rowKey` where it
  // renders, so it is a new function each time that answers as the one before did.
  const keyOf = useRef(rowKey);
  useLayoutEffect(() => {
    keyOf.current = rowKey;
  });
  // The cells of a row: one element for each column, the same for every row.
  const rowCells = useMemo(
    () => [
      ...cells.map((cell, index) => (
        <Cell
          key={cell.id}
          data-kind={cell.kind}
          data-supporting={cell.isSupporting ? "" : undefined}
          data-pinned={cell.isPinned ? "" : undefined}
          className={cx(styles.cell)}
        >
          {() => <CellValue column={index} />}
        </Cell>
      )),
      ...(hasActions
        ? [
            <Cell key={ACTIONS} data-kind="actions" className={cx(styles.cell)}>
              {() => <RowActions />}
            </Cell>,
          ]
        : []),
    ],
    [cells, hasActions],
  );
  // The rows as the component library takes them. It keeps what it built for an item, and this
  // is the same element until the rows or their shape change, so a render of the table for any
  // other reason does not walk the rows at all.
  const body = useMemo(
    () => (
      <Collection items={shown} dependencies={[rowCells]}>
        {(item) => (
          <Row
            id={keyOf.current(item)}
            className={cx(styles.row)}
            render={(domProps) => (
              <ItemContext value={item}>
                <div {...domProps} />
              </ItemContext>
            )}
          >
            {rowCells}
          </Row>
        )}
      </Collection>
    ),
    [shown, rowCells],
  );
  const layoutOptions = useMemo(
    (): LayoutOptions => ({
      rowHeight: metrics.rowHeight,
      headingHeight: metrics.headerHeight,
      loaderHeight: metrics.rowHeight,
      emptyHeight: loading ? skeletonRows * metrics.rowHeight : 0,
    }),
    [metrics, loading, skeletonRows],
  );

  const maxRows = height === "fill" ? null : height.maxRows;
  // The end of the rows is near once less than the height of the visible part is left below it.
  // `asked` holds how many rows there were at the last request of this stay at the end.
  const asked = useRef<number | null>(null);
  const warned = useRef(false);
  const lookForEnd = () => {
    const element = scroller.current;
    if (element === null) return;
    const rowsEnd = metrics.headerHeight + rows.length * metrics.rowHeight;
    const isNear =
      !loading && rows.length > 0 && element.scrollTop + 2 * element.clientHeight >= rowsEnd;
    if (!isNear) {
      asked.current = null;
      return;
    }
    if (onLoadMore === undefined || isLoadingMore === true) return;
    // A table that is as tall as its rows does not scroll inside itself, so its end is always
    // near and each page would ask for the next. That is a table without a number of rows to
    // stop at, and a table that fills a container which has no height: it has grown with its
    // rows, past the window. A table kept to a number of rows is kept to a height, also where
    // the window is shorter than that.
    const isUnbounded =
      height === "fill"
        ? element.clientHeight > window.innerHeight
        : maxRows === Number.POSITIVE_INFINITY;
    if (isUnbounded) {
      if (!warned.current) warnOfUnboundedHeight();
      warned.current = true;
      return;
    }
    if (asked.current !== null && rows.length <= asked.current) return;
    asked.current = rows.length;
    onLoadMore();
  };
  /** Asks the scroller what only it knows, and keeps it when it is another answer than before. */
  const measureScroller = () => {
    const element = scroller.current;
    if (element === null) return;
    // The layout writes the width it gave a column on the box around its header. That box is
    // watched as well: a pinned column may get another width while the scroller and what it
    // holds keep their size, when a column that takes a share gives the room.
    let pinned = 0;
    for (const header of element.querySelectorAll('[role="columnheader"][data-pinned]')) {
      const box = header.parentElement;
      if (box === null) continue;
      pinned += Number.parseFloat(box.style.width) || 0;
      if (sizes.current !== null && !watched.current.has(box)) {
        watched.current.add(box);
        sizes.current.observe(box);
      }
    }
    // A scrollbar along the lower edge is the part of the height that shows no rows.
    const scrollbar =
      element.scrollWidth > element.clientWidth
        ? Math.max(0, element.offsetHeight - element.clientHeight)
        : 0;
    setMeasured((before) =>
      before.pinned === pinned && before.scrollbar === scrollbar ? before : { pinned, scrollbar },
    );
  };
  const afterLayout = useRef<() => void>(() => undefined);
  // What tells of a resize, where there is such a thing, and the boxes it was asked to watch.
  const sizes = useRef<ResizeObserver | null>(null);
  const watched = useRef(new WeakSet<Element>());
  // After every render: rows that arrived, a page that ended, columns of another width, or a
  // table that starts with its end in view. It reads a few numbers of the scroller, asks for
  // nothing twice, and renders again only when a number is another one.
  useEffect(() => {
    afterLayout.current = () => {
      measureScroller();
      lookForEnd();
    };
    // And whenever the scroller is resized, or the box it scrolls, which has another size with
    // other rows and other columns: a window that grows may bring the end into view, and gives
    // the columns other widths. It is watched from the first render on.
    const element = scroller.current;
    if (sizes.current === null && element !== null && typeof ResizeObserver !== "undefined") {
      sizes.current = new ResizeObserver(() => {
        afterLayout.current();
      });
      watched.current = new WeakSet();
      sizes.current.observe(element);
      if (element.firstElementChild !== null) sizes.current.observe(element.firstElementChild);
    }
    afterLayout.current();
  });
  useEffect(
    () => () => {
      sizes.current?.disconnect();
      sizes.current = null;
    },
    [],
  );

  // The rows are another result when the caller says so, and only then: the table starts at its
  // top again, and the end of the other result is another end.
  const lastResult = useRef(resultKey);
  useLayoutEffect(() => {
    if (lastResult.current === resultKey) return;
    lastResult.current = resultKey;
    asked.current = null;
    if (scroller.current !== null && scroller.current.scrollTop > 0) scroller.current.scrollTop = 0;
  }, [resultKey]);

  const count = loading
    ? t("table.loading")
    : countText !== undefined
      ? countText(rows.length, total)
      : totalRows === undefined
        ? t("table.rowCount", { count: rows.length })
        : t("table.rowCountOf", { shown: rows.length, total });
  // While more rows are on their way the line is two sentences, the count first, written as
  // two: read aloud, and as the description of the grid, it must not run together.
  const status = loadingMore ? t("table.countLoadingMore", { line: count }) : count;
  const isEmpty = !loading && rows.length === 0;

  return (
    <div
      data-density={density}
      data-height={height === "fill" ? "fill" : Number.isFinite(maxRows) ? "rows" : "all"}
      data-empty={isEmpty ? "" : undefined}
      aria-busy={loading ? "true" : undefined}
      data-stale={isStale === true && !loading ? "" : undefined}
      data-scrolled={scrolled ? "" : undefined}
      data-scrolled-x={scrolledAcross ? "" : undefined}
      className={cx(styles.root, className)}
      style={
        {
          "--table-pinned-width": `${String(measured.pinned)}px`,
          "--table-scrollbar-size": `${String(measured.scrollbar)}px`,
          ...(maxRows !== null && Number.isFinite(maxRows) ? { "--table-max-rows": maxRows } : {}),
        } as CSSProperties
      }
    >
      <ContentContext value={content}>
        <Virtualizer layout={DataTableLayout} layoutOptions={layoutOptions}>
          <Table
            ref={scroller}
            aria-label={props["aria-label"]}
            aria-describedby={countId}
            data-selectable={selectable ? "" : undefined}
            selectionMode={selectable ? "single" : "none"}
            selectionBehavior="toggle"
            disallowEmptySelection
            selectedKeys={
              !selectable || selectedKey === undefined || selectedKey === null ? [] : [selectedKey]
            }
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const [key] = keys;
              if (key !== undefined) onSelectionChange?.(String(key));
            }}
            {...(sort === undefined ? {} : { sortDescriptor: sort })}
            onSortChange={(descriptor) => {
              onSortChange?.({
                column: String(descriptor.column),
                direction: descriptor.direction,
              });
            }}
            onScroll={(event) => {
              setScrolled(event.currentTarget.scrollTop > 0);
              setScrolledAcross(event.currentTarget.scrollLeft > 0);
              lookForEnd();
            }}
            className={cx(styles.table)}
            // The library counts the rows it was given. The rows of the whole result are more,
            // and it passes no count of ours on, so the count is set where it draws.
            render={(domProps) => (
              <div
                {...domProps}
                {...(totalRows === undefined || loading
                  ? {}
                  : { "aria-rowcount": totalRows + HEADER_ROWS })}
              />
            )}
          >
            <TableHeader className={cx(styles.head)}>
              {columns.map((column, index) => (
                <Column
                  key={column.id}
                  id={column.id}
                  isRowHeader={column.isRowHeader === true}
                  allowsSorting={column.allowsSorting === true && !loading}
                  textValue={column.header}
                  width={widths[index]?.width ?? null}
                  minWidth={widths[index]?.minWidth ?? null}
                  data-kind={column.kind ?? "text"}
                  data-pinned={column.isRowHeader === true ? "" : undefined}
                  className={cx(styles.column)}
                >
                  {({ sortDirection }) => (
                    <>
                      <span className={styles.label}>{column.header}</span>
                      {sortDirection === undefined ? null : (
                        <Icon icon={sortDirection === "ascending" ? ArrowUp : ArrowDown} />
                      )}
                    </>
                  )}
                </Column>
              ))}
              {hasActions ? (
                <Column
                  id={ACTIONS}
                  textValue={t("table.actions")}
                  width={actionsWidth.width}
                  minWidth={actionsWidth.minWidth}
                  className={cx(styles.column)}
                >
                  <VisuallyHidden>{t("table.actions")}</VisuallyHidden>
                </Column>
              ) : null}
            </TableHeader>
            <TableBody
              className={cx(styles.body)}
              {...(loading
                ? {
                    renderEmptyState: () => (
                      <>
                        {/* The one line assistive technology reads in place of the rows. */}
                        <VisuallyHidden>{t("table.loading")}</VisuallyHidden>
                        <div aria-hidden="true">
                          {Array.from({ length: skeletonRows }, (_, row) => (
                            <PlaceholderRow
                              key={row}
                              part="skeleton-row"
                              shape={row % TEXT_SHAPES}
                              columns={cells}
                              widths={placeholderWidths}
                            />
                          ))}
                        </div>
                      </>
                    ),
                  }
                : {})}
            >
              {body}
              {loadingMore ? (
                <TableLoadMoreItem isLoading className={cx(styles.loadMore)}>
                  <VisuallyHidden>{t("table.loadingMore")}</VisuallyHidden>
                  <div aria-hidden="true">
                    <PlaceholderRow
                      part="load-more-row"
                      shape={rows.length % TEXT_SHAPES}
                      columns={cells}
                      widths={placeholderWidths}
                    />
                  </div>
                </TableLoadMoreItem>
              ) : null}
            </TableBody>
          </Table>
        </Virtualizer>
      </ContentContext>
      {isEmpty && emptyState !== undefined ? (
        <div className={styles.empty}>{emptyState}</div>
      ) : null}
      {countText === undefined ? (
        <VisuallyHidden id={countId} role="status">
          {status}
        </VisuallyHidden>
      ) : (
        <p id={countId} role="status" className={styles.count}>
          {status}
        </p>
      )}
    </div>
  );
}
