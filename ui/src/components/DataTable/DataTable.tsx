import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  OctagonAlert,
} from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type UIEvent,
} from "react";
import {
  Button as RacButton,
  Cell,
  Collection,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
  TableLayout,
  TableLoadMoreItem,
  TableStateContext,
  Virtualizer,
  type Key,
  type Selection as RacSelection,
  type SortDescriptor,
  type TableLayoutProps,
} from "react-aria-components";
import { t } from "../../text/i18n";
import { Button } from "../Button/Button";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import {
  columnWidth,
  headerWidth,
  leavingColumns,
  type ColumnSize,
  type DataTableColumnKind,
} from "./columns";
import styles from "./DataTable.module.css";
import { useCharWidths, useTableMetrics } from "./measure";

export { isHeaderCut, textChars, type ColumnSize, type DataTableColumnKind } from "./columns";

/**
 * The column a header heads, by its id, when `target` is the header of a column or is inside one;
 * `null` elsewhere. For a screen that shows something at a header, such as the whole text of a
 * header that was cut (`headerChars`). The header element carries its column's id for this.
 */
export function columnOfHeader(target: EventTarget | null): string | null {
  const header =
    target instanceof Element ? target.closest<HTMLElement>("[role='columnheader']") : null;
  return header?.dataset.column ?? null;
}

/** The header of the column with this id under `root`, or `null`. */
export function headerOfColumn(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[role='columnheader'][data-column='${CSS.escape(id)}']`);
}

/** What every column declares, whether or not it may leave a narrow table. */
interface ColumnBase<Item> {
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
  /**
   * The most characters of the header the column makes room for; a longer header is cut at the
   * end. Only for a header that is a value of the data, as in the table view of a chart, whose
   * screen shows the whole text in another way. Other headers are never cut.
   */
  headerChars?: number;
}

/** A column of a table. It stays whatever the width of the table. */
export interface DataTableColumn<Item> extends ColumnBase<Item> {
  /** It has none: a column with a priority is a `LeavingColumn`. */
  priority?: never;
}

/**
 * A column that may leave a table that is too narrow for all of its columns. A table of such
 * columns says under itself which have left (`leftOutText`).
 */
export interface LeavingColumn<Item> extends ColumnBase<Item> {
  /**
   * The higher the number, the sooner the column leaves. Give one only to a column whose value
   * can be read elsewhere, such as in the detail panel of the row. A column without one always
   * stays, and so do the column that names the row, the column the rows are sorted by, and the
   * last column that takes a share of the width.
   */
  priority?: number;
}

export interface DataTableSort {
  /** The id of the sorted column. */
  column: string;
  direction: "ascending" | "descending";
}

/**
 * The columns of a table, and the sentence that names those that left. Columns that may leave are
 * always named when they do (DESIGN.md, Table), so a table of them must be given the sentence.
 */
type Fitting<Item> =
  | { columns: readonly DataTableColumn<Item>[]; leftOutText?: undefined }
  | {
      columns: readonly LeavingColumn<Item>[];
      /**
       * The sentence under the table that names the columns that left it for want of room, and
       * says where their values are read. Written by the caller from the catalog.
       */
      leftOutText: (headers: readonly string[]) => string;
    };

interface TableProps<Item> {
  /** The name of the table. */
  "aria-label": string;
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
  /**
   * The selection is also made outside the table, as on the curve of Blockers: whenever
   * `selectedKey` names another row, and when that row arrives, the table scrolls it into view
   * at the nearer edge, and moves no focus. A row that is in view stays where it is. For a table
   * whose rows do not expand.
   */
  revealSelected?: boolean;
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

/** The children of a row that expands, as the screen has them now. */
export interface DataTableChildren<Child> {
  /** The child rows that are there, in the order to show them. */
  rows: readonly Child[];
  /** The children are being read: while none is there, a skeleton child row stands for them. */
  isLoading?: boolean;
  /** They could not be read: a child row says so in the screen's words, with a retry. */
  error?: { text: string; onRetry: () => void };
  /** A last child row that leads on, such as "Open all 900 lines in Lines", and what it does. */
  more?: { text: string; onAction: () => void };
  /**
   * There are no children to show, for a reason the screen says, with what to do about it: a group
   * the filters no longer keep, and Collapse. A child row says so, with the action as a button.
   */
  notice?: { text: string; action: string; onAction: () => void };
}

/** What a child row shows in the track of one column of its table. */
export interface DataTableChildColumn<Child> {
  /** The id of the table's column whose track the cell takes. A track without one is blank. */
  column: string;
  cell: (child: Child) => ReactNode;
  /** As a column's own kind: the child's value may be of another kind than its parent's. */
  kind?: DataTableColumnKind;
  isSupporting?: boolean;
  /**
   * The room the child's value needs, in characters of the face of its kind: the track is never
   * narrower. For an identifier, which is never cut: the widest of the children that are shown.
   */
  chars?: number;
}

/**
 * Rows that expand to child rows: a tree grid. The screen holds which rows are expanded and reads
 * their children; the table shows them under their row, in the tracks of the table's columns.
 */
type Expanding<Item, Child> =
  | {
      childRows?: undefined;
      childKey?: undefined;
      childColumns?: undefined;
      expandedKeys?: undefined;
      onExpandedChange?: undefined;
      selectedChildKey?: undefined;
      onChildSelectionChange?: undefined;
    }
  | {
      /**
       * The children of a row as the screen has them, or `undefined` for a row that has none and
       * does not expand. It is read for an expanded row only to show its children, and for every
       * row to know whether it expands, so it answers at once: it reads nothing itself.
       */
      childRows: (item: Item) => DataTableChildren<Child> | undefined;
      /** A key of a child, unique among the children of its row. */
      childKey: (child: Child) => string;
      childColumns: readonly DataTableChildColumn<Child>[];
      /** The keys of the rows that are expanded. */
      expandedKeys: ReadonlySet<string>;
      /** Called with the keys of the expanded rows after a row was turned. */
      onExpandedChange: (keys: ReadonlySet<string>) => void;
      /** The key of the child that is selected; every row of that child is marked. */
      selectedChildKey?: string | null;
      /**
       * Called with the child whose row was selected. Giving it makes the child rows selectable.
       * A row that expands is then turned, not selected, by a press or Enter, unless the table
       * has `onSelectionChange` as well; its chevron, Right, and Left turn it either way.
       */
      onChildSelectionChange?: (child: Child) => void;
    };

export type DataTableProps<Item, Child = never> = TableProps<Item> &
  Fitting<Item> &
  Expanding<Item, Child>;

const ACTIONS = "data-table-actions";

/** How many shapes a skeleton line of a text column has; the stylesheet gives each its width. */
const TEXT_SHAPES = 4;

/** The room of the row actions where the caller declares none: a short verb in a quiet button. */
const ACTIONS_SIZE: ColumnSize = { chars: 12 };

const DEFAULT_HEIGHT = { maxRows: 12 } as const;

/**
 * How many frames a table that returns to its top for another result waits at most for the
 * component library to report the top, before it counts where it is again.
 */
const RETURN_FRAMES = 4;

/** The table has one header row, which is a row of the grid as the others are. */
const HEADER_ROWS = 1;

/** The rows of a table that is loading: none, and the same none at every render. */
const NO_ROWS: readonly never[] = [];

/**
 * What stands between the key of a row and the key of a child, and of a row that says how its
 * children are, in the keys the table gives child rows. The same child may be under two rows, so
 * its key is its row's key, this, and its own. Two marks that no key of a row holds.
 */
const CHILD = "\u001f";
const STATUS = "\u001e";

/** A child row as the table holds it: a child, or a row that says how the children are. */
type ChildEntry =
  | { kind: "child"; key: string; id: string; item: unknown }
  | { kind: "loading"; key: string }
  | { kind: "error"; key: string; text: string }
  | { kind: "more"; key: string; text: string }
  | { kind: "notice"; key: string; text: string; action: string };

const NO_CHILDREN: readonly ChildEntry[] = [];

/** What decides the child rows of an expanded row: all that `DataTableChildren` holds but its actions. */
interface ChildRowsShape {
  rows: readonly unknown[];
  isLoading: boolean;
  error: string | null;
  more: string | null;
  notice: { text: string; action: string } | null;
}

function childRowsShape(children: DataTableChildren<unknown>): ChildRowsShape {
  return {
    rows: children.rows,
    isLoading: children.isLoading === true,
    error: children.error?.text ?? null,
    more: children.more?.text ?? null,
    notice:
      children.notice === undefined
        ? null
        : { text: children.notice.text, action: children.notice.action },
  };
}

/** The child rows of an expanded row: its children, then the row that says how they are. */
function childEntries(
  parent: string,
  { rows, isLoading, error, more, notice }: ChildRowsShape,
  childKey: (child: unknown) => string,
): readonly ChildEntry[] {
  const entries: ChildEntry[] = rows.map((child) => {
    const id = childKey(child);
    return { kind: "child", key: `${parent}${CHILD}${id}`, id, item: child };
  });
  if (isLoading && entries.length === 0) {
    entries.push({ kind: "loading", key: `${parent}${STATUS}loading` });
  }
  if (error !== null) {
    entries.push({ kind: "error", key: `${parent}${STATUS}error`, text: error });
  } else if (notice !== null) {
    entries.push({ kind: "notice", key: `${parent}${STATUS}notice`, ...notice });
  } else if (more !== null && !isLoading) {
    entries.push({ kind: "more", key: `${parent}${STATUS}more`, text: more });
  }
  return entries;
}

function isSameShape(one: ChildRowsShape, other: ChildRowsShape): boolean {
  return (
    one.rows === other.rows &&
    one.isLoading === other.isLoading &&
    one.error === other.error &&
    one.more === other.more &&
    one.notice?.text === other.notice?.text &&
    one.notice?.action === other.notice?.action
  );
}

/**
 * What the table says of the children of each expanded row, for the rows to read. Each row hears
 * of its own children only: turning one row, or reading its children, renders no other row,
 * which counts in a table of a thousand rows.
 */
class ChildStore {
  private shapes = new Map<string, ChildRowsShape>();
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly get = (key: string): ChildRowsShape | undefined => this.shapes.get(key);

  /** Takes what is said of the children now, and tells the rows when any of it changed. */
  publish(next: ReadonlyMap<string, ChildRowsShape>): void {
    let changed = next.size !== this.shapes.size;
    const kept = new Map<string, ChildRowsShape>();
    for (const [key, shape] of next) {
      const old = this.shapes.get(key);
      if (old !== undefined && isSameShape(old, shape)) {
        kept.set(key, old);
      } else {
        kept.set(key, shape);
        changed = true;
      }
    }
    if (!changed) return;
    this.shapes = kept;
    for (const listener of this.listeners) listener();
  }
}

/** What the rows of a table whose rows expand are told of their children. */
interface Tree {
  store: ChildStore;
  childKey: (child: unknown) => string;
  /** The row of a child, or of what is said of the children, under its row. */
  childRow: (parent: string, child: ChildEntry) => ReactElement;
}

const TreeContext = createContext<Tree | null>(null);

/**
 * Keeps the focus of the table on a row that is drawn. The children of a collapsed row stay in
 * the table, out of sight, so the library would keep the focus on one of them when the row
 * collapses by any other way than Left on it: the chevron, the action of a notice row, the screen
 * (an address that changed). When the row that collapses holds the focused row, the focus goes to
 * that row. It draws nothing; it sits inside the table, where the table's state is.
 */
function KeepFocusDrawn() {
  const state = useContext(TableStateContext);
  const before = useRef(state?.expandedKeys);
  useLayoutEffect(() => {
    if (state === null) return;
    const was = before.current;
    const now = state.expandedKeys;
    before.current = now;
    const focused = state.selectionManager.focusedKey;
    if (was === undefined || was === now || focused === null) return;
    const key = String(focused);
    for (const parent of was) {
      if (now.has(parent)) continue;
      const row = String(parent);
      if (key.startsWith(`${row}${CHILD}`) || key.startsWith(`${row}${STATUS}`)) {
        state.selectionManager.setFocusedKey(parent);
        return;
      }
    }
  });
  return null;
}

const NO_STORE = new ChildStore();
const noShape = (): undefined => undefined;

/**
 * The child rows under a row, while it is expanded. A row of the table is built once for its
 * item and kept; its children are read here, from what the table says of them now, and built
 * again only when they change. So turning a row, or reading its children, builds no other row.
 */
function TreeChildren({ parent }: { parent: string }) {
  const tree = useContext(TreeContext);
  const store = tree?.store ?? NO_STORE;
  const shape = useSyncExternalStore(store.subscribe, () => store.get(parent), noShape);
  const childKey = tree?.childKey;
  const entries = useMemo(
    () =>
      shape === undefined || childKey === undefined
        ? NO_CHILDREN
        : childEntries(parent, shape, childKey),
    [parent, shape, childKey],
  );
  if (tree === null || entries.length === 0) return null;
  return (
    <Collection items={entries} dependencies={[tree.childRow]}>
      {(child) => tree.childRow(parent, child)}
    </Collection>
  );
}

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
 *
 * A table whose rows expand relies on more of the library, checked again on an upgrade as well:
 * that the rows under an expanded row are flattened into the body by the table's collection and
 * laid out there as rows of their own, by `buildRowGroup`, at the height of a row; that a row
 * tells assistive technology whether it expands, and answers Right and Left, from a prop named
 * `hasChildRows` (the hook of the row reads that name, the component `hasChildItems`, so the
 * table passes both) and only in a table with a `treeColumn`; that a `Button` in the slot
 * `chevron` of a row turns it; that a cell with a `colSpan` takes the tracks it spans; and that a
 * row's own `disabledBehavior` of `selection` keeps it focusable in a table whose disabled rows
 * are disabled for all. The tests of the expanding rows fail if one of them goes.
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

/**
 * The props of a row that can never be selected in a table whose other rows can: without the
 * `aria-selected` the library gives every row of such a table, so that a group is not read out as
 * "not selected".
 */
function unmarked<Props extends object>(props: Props): Props {
  // The same props, one fewer.
  return Object.fromEntries(
    Object.entries(props).filter(([name]) => name !== "aria-selected"),
  ) as Props;
}

/** What a cell shows. It is drawn again when its row or what the cells show changes, and not because its cell was. */
const CellValue = memo(function CellValue({ column }: { column: number }) {
  const item = useContext(ItemContext);
  return <span className={styles.value}>{useContext(ContentContext).cell(column, item)}</span>;
});

/** What the cells of a child row show, by the index of the table's column whose track they take. */
interface ChildContent {
  cell: (column: number, child: unknown) => ReactNode;
}

const ChildContentContext = createContext<ChildContent>({ cell: () => null });

/** What a cell of a child row shows; the child is the item of its row. */
const ChildValue = memo(function ChildValue({ column }: { column: number }) {
  const child = useContext(ItemContext);
  return (
    <span className={styles.value}>{useContext(ChildContentContext).cell(column, child)}</span>
  );
});

/**
 * The chevron of a row that expands, before the text of the cell that names the row. It is for
 * the pointer: the row tells assistive technology whether it is expanded, and Right and Left turn
 * it, so the chevron is hidden from it and out of the Tab order. The component library gives it
 * its press through the slot.
 */
function Chevron() {
  return (
    // The library gives the button names of its own, so it is hidden by what holds it.
    <span aria-hidden="true" className={styles.chevronRoom}>
      <RacButton slot="chevron" data-part="chevron" className={cx(styles.chevron)}>
        <Icon icon={ChevronRight} />
      </RacButton>
    </span>
  );
}

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
 *
 * Rows may expand to child rows (`childRows`): the table is then a tree grid. A row that expands
 * has a chevron before its name; the chevron, a press on the row, or Enter turns it, Right
 * expands it, and Left collapses it or goes from a child row to its row. The child rows stand in
 * the tracks of the table's columns, with cells of their own (`childColumns`). While the children
 * are read one skeleton row stands for them, which takes no focus; when they could not be read a
 * row says so, with a retry; a last row may lead on to all of them. The count line counts the rows,
 * not their children.
 */
export function DataTable<Item, Child = never>({
  columns: given,
  rows,
  rowKey,
  selectedKey,
  onSelectionChange,
  revealSelected,
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
  leftOutText,
  childRows,
  childKey,
  childColumns,
  expandedKeys,
  onExpandedChange,
  selectedChildKey,
  onChildSelectionChange,
  className,
  ...props
}: DataTableProps<Item, Child>) {
  const countId = useId();
  const leftOutId = useId();
  // A column that cannot leave is one whose priority is not there.
  const allColumns: readonly LeavingColumn<Item>[] = given;
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [scrolledAcross, setScrolledAcross] = useState(false);
  // What the scroller itself has to be asked: how much of its height a sideways scrollbar takes,
  // how wide the layout made the pinned column, and how wide the scroller is, which decides the
  // columns that leave it.
  const [measured, setMeasured] = useState({ scrollbar: 0, pinned: 0, width: 0 });
  const metrics = useTableMetrics(density);
  const chars = useCharWidths();
  const loading = isLoading === true;
  const loadingMore = isLoadingMore === true && !loading;
  const expandable = childRows !== undefined;
  const parentSelectable = onSelectionChange !== undefined && !loading;
  const childSelectable = expandable && onChildSelectionChange !== undefined && !loading;
  const selectable = parentSelectable || childSelectable;
  const hasActions = rowActions !== undefined;
  const shown = loading ? NO_ROWS : rows;
  const total = totalRows ?? rows.length;

  const widthOf = (column: LeavingColumn<Item>): Width => {
    const sized = columnWidth(column.size, column.kind ?? "text", chars, metrics.paddingX);
    const least = headerWidth(
      column.header,
      column.allowsSorting === true,
      chars,
      metrics.paddingX,
      metrics.arrow,
      column.headerChars,
    );
    // In a table whose rows expand, the cell that names a row starts with the room of the
    // chevron, and the cells of child rows are indented as far: the column takes that room on top
    // of what it declares, so an identifier under a row is not cut.
    const chevron = expandable && column.isRowHeader === true ? metrics.arrow : 0;
    const child = childColumns?.find((candidate) => candidate.column === column.id);
    const childLeast =
      child?.chars === undefined
        ? 0
        : columnWidth({ chars: child.chars }, child.kind ?? "text", chars, metrics.paddingX)
            .minWidth + chevron;
    return {
      width:
        typeof sized.width === "number"
          ? Math.max(sized.width + chevron, least, childLeast)
          : sized.width,
      minWidth: Math.max(sized.minWidth + chevron, least, childLeast),
    };
  };
  const actionsWidth = columnWidth(rowActionsSize, "text", chars, metrics.paddingX);
  // The columns that leave for want of room, by their priority. The same list of columns is kept
  // for as long as the same columns stay, so nothing that is built from it is built again.
  const leaving = [
    ...leavingColumns(
      allColumns.map((column) => ({
        id: column.id,
        least: widthOf(column).minWidth,
        priority: column.priority,
        stays: column.isRowHeader === true || column.id === sort?.column,
        takesShare: "flex" in column.size,
      })),
      measured.width,
      hasActions ? actionsWidth.minWidth : 0,
    ),
  ].join("\n");
  const columns = useMemo(() => {
    const gone = new Set(leaving.split("\n"));
    return allColumns.filter((column) => !gone.has(column.id));
  }, [allColumns, leaving]);
  const leftOut = allColumns.filter((column) => !columns.includes(column));
  // Where the focus was last in the table: the column, and the row when it was not the header. A
  // cell or a header that leaves gives its focus to the cell that names the same row, or to the
  // header of that column, so the focus is never left on the page behind.
  const focused = useRef<{ column: string; row: string | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const last = focused.current;
    const root = box.current;
    if (last === null || root === null || !leaving.split("\n").includes(last.column)) return;
    const active = document.activeElement;
    // The focus is still in the table, on an element the library gave to another cell, or on the
    // page behind. Focus that went elsewhere is left there.
    if (active !== null && active !== document.body && !root.contains(active)) return;
    const pinned =
      last.row === null
        ? root.querySelector<HTMLElement>('[role="columnheader"][data-pinned]')
        : [...root.querySelectorAll<HTMLElement>('[role="row"][data-key]')]
            .find((row) => row.dataset.key === last.row)
            ?.querySelector<HTMLElement>('[role="rowheader"]');
    pinned?.focus();
  }, [leaving]);
  // The widths in one word: what is built from them is built again only when one changes.
  const widthsText = JSON.stringify(columns.map(widthOf));
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
          data-column={cell.id}
          data-kind={cell.kind}
          data-supporting={cell.isSupporting ? "" : undefined}
          data-pinned={cell.isPinned ? "" : undefined}
          className={cx(styles.cell)}
        >
          {expandable && cell.isPinned
            ? ({ hasChildItems }) => (
                <>
                  {hasChildItems ? (
                    <Chevron />
                  ) : (
                    <span data-part="chevron-room" className={styles.chevronRoom} />
                  )}
                  <CellValue column={index} />
                </>
              )
            : () => <CellValue column={index} />}
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
    [cells, hasActions, expandable],
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

  // Rows that expand. The screen says which rows are expanded and what their children are; the
  // table builds a row for each child and for what it says of them (they are being read, they
  // could not be read, there are more), and keeps every row whose children did not change.
  const childShape = JSON.stringify(
    columns.map((column): CellShape & { hasValue: boolean } => {
      const own = childColumns?.find((child) => child.column === column.id);
      return {
        id: column.id,
        kind: own?.kind ?? "text",
        isSupporting: own?.isSupporting === true,
        isPinned: column.isRowHeader === true,
        hasValue: own !== undefined,
      };
    }),
  );
  const childCellShapes = useMemo(
    () => JSON.parse(childShape) as (CellShape & { hasValue: boolean })[],
    [childShape],
  );
  const childContent = useMemo((): ChildContent => {
    const byTrack = columns.map((column) =>
      childColumns?.find((child) => child.column === column.id),
    );
    // The items the child cells are handed are children of this table, so they are `Child`s.
    return { cell: (column, child) => byTrack[column]?.cell(child as Child) };
  }, [columns, childColumns]);
  // The cells of a child row, in the tracks of the table's columns.
  const childCells = useMemo(
    () => [
      ...childCellShapes.map((cell, index) => (
        <Cell
          key={cell.id}
          data-column={cell.id}
          data-kind={cell.kind}
          data-supporting={cell.isSupporting ? "" : undefined}
          data-pinned={cell.isPinned ? "" : undefined}
          className={cx(styles.cell)}
        >
          {() => (cell.hasValue ? <ChildValue column={index} /> : null)}
        </Cell>
      )),
      ...(hasActions
        ? [<Cell key={ACTIONS} data-kind="actions" className={cx(styles.cell)} />]
        : []),
    ],
    [childCellShapes, hasActions],
  );
  // The cells of the row that stands for children that are being read: a skeleton line in each
  // track, and the one line assistive technology reads in place of them.
  const loadingCells = useMemo(
    () => [
      ...childCellShapes.map((cell) => (
        <Cell
          key={cell.id}
          data-column={cell.id}
          data-kind={cell.kind}
          data-pinned={cell.isPinned ? "" : undefined}
          className={cx(styles.cell)}
        >
          {cell.isPinned ? <VisuallyHidden>{t("table.childLoading")}</VisuallyHidden> : null}
          {cell.hasValue ? <Skeleton className={styles.placeholderLine} /> : null}
        </Cell>
      )),
      ...(hasActions
        ? [<Cell key={ACTIONS} data-kind="actions" className={cx(styles.cell)} />]
        : []),
    ],
    [childCellShapes, hasActions],
  );
  const cellCount = columns.length + (hasActions ? 1 : 0);

  // What the screen says of the children of each row, and the child rows that makes. The
  // children of a row that is collapsed stay in the table as well, out of sight, so that turning a
  // row whose children are there changes which rows are drawn and nothing else: one render. The
  // drawn rows are counted here for the selection and for the end of the rows.
  const childStates = new Map<string, DataTableChildren<Child>>();
  const childShapes = new Map<string, ChildRowsShape>();
  const childByKey = new Map<string, Extract<ChildEntry, { kind: "child" }>>();
  const leafKeys: string[] = [];
  let drawnRows = rows.length;
  if (childRows !== undefined && !loading) {
    for (const item of shown) {
      const key = rowKey(item);
      const children = childRows(item);
      if (children === undefined) {
        leafKeys.push(key);
        continue;
      }
      const shape = childRowsShape(children);
      const isBare =
        shape.rows.length === 0 &&
        !shape.isLoading &&
        shape.error === null &&
        shape.more === null &&
        shape.notice === null;
      if (!isBare) {
        childStates.set(key, children);
        childShapes.set(key, shape);
      }
      if (isBare || !expandedKeys.has(key)) continue;
      // The children of the table are `Child`s.
      const entries = childEntries(key, shape, (child) => childKey(child as Child));
      drawnRows += entries.length;
      for (const entry of entries) if (entry.kind === "child") childByKey.set(entry.key, entry);
    }
  }

  // What a press on a row asks for, and whether a row expands, is read when it is asked: the rows
  // are kept while the screen renders, and the functions it passes are new each time.
  const latest = useRef({ expandedKeys, onExpandedChange, childStates, childKey });
  useLayoutEffect(() => {
    latest.current = { expandedKeys, onExpandedChange, childStates, childKey };
  });
  const turn = useCallback((key: string) => {
    const { expandedKeys: open, onExpandedChange: change } = latest.current;
    if (open === undefined || change === undefined) return;
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    change(next);
  }, []);
  const retry = useCallback((key: string) => {
    latest.current.childStates.get(key)?.error?.onRetry();
  }, []);
  const leadOn = useCallback((key: string) => {
    latest.current.childStates.get(key)?.more?.onAction();
  }, []);
  const answerNotice = useCallback((key: string) => {
    latest.current.childStates.get(key)?.notice?.onAction();
  }, []);
  const keyOfChild = useCallback(
    // The children of the table are `Child`s.
    (child: unknown) => latest.current.childKey?.(child as Child) ?? "",
    [],
  );
  // The rows that do not expand, in one word: the rows are built again when it changes, and read
  // whether they expand from it, in the render that built them.
  const leaves = leafKeys.join(CHILD);
  const leafSet = useMemo(() => new Set(leaves === "" ? [] : leaves.split(CHILD)), [leaves]);

  const childRow = useCallback(
    (parent: string, child: ChildEntry): ReactElement => {
      // A row that cannot be selected is still focused and pressed: it is disabled for the
      // selection alone.
      const unselectable = { isDisabled: true, disabledBehavior: "selection" } as const;
      const status = {
        ...unselectable,
        render: (domProps: object) => <div {...unmarked(domProps)} />,
      } as const;
      switch (child.kind) {
        case "child":
          return (
            <Row
              id={child.key}
              data-part="child-row"
              className={cx(styles.row)}
              {...(childSelectable ? {} : unselectable)}
              render={(domProps) => (
                <ItemContext value={child.item}>
                  <div {...(childSelectable ? domProps : unmarked(domProps))} />
                </ItemContext>
              )}
            >
              {childCells}
            </Row>
          );
        case "loading":
          return (
            <Row
              id={child.key}
              isDisabled
              data-part="loading-row"
              className={cx(styles.row)}
              render={(domProps) => <div {...unmarked(domProps)} />}
            >
              {loadingCells}
            </Row>
          );
        case "error":
          return (
            <Row
              id={child.key}
              data-part="error-row"
              className={cx(styles.row)}
              {...status}
              onAction={() => {
                retry(parent);
              }}
            >
              <Cell
                colSpan={cellCount}
                data-pinned=""
                data-kind="status"
                className={cx(styles.cell)}
              >
                <span className={styles.status} data-tone="danger">
                  <Icon icon={OctagonAlert} className={styles.statusIcon} />
                  <span className={styles.value}>{child.text}</span>
                  <Button
                    variant="quiet"
                    onPress={() => {
                      retry(parent);
                    }}
                  >
                    {t("common.retry")}
                  </Button>
                </span>
              </Cell>
            </Row>
          );
        case "notice":
          return (
            <Row
              id={child.key}
              data-part="notice-row"
              className={cx(styles.row)}
              {...status}
              onAction={() => {
                answerNotice(parent);
              }}
            >
              <Cell
                colSpan={cellCount}
                data-pinned=""
                data-kind="status"
                className={cx(styles.cell)}
              >
                <span className={styles.status} data-tone="neutral">
                  <span className={styles.value}>{child.text}</span>
                  <Button
                    variant="quiet"
                    onPress={() => {
                      answerNotice(parent);
                    }}
                  >
                    {child.action}
                  </Button>
                </span>
              </Cell>
            </Row>
          );
        case "more":
          return (
            <Row
              id={child.key}
              data-part="more-row"
              className={cx(styles.row)}
              {...status}
              onAction={() => {
                leadOn(parent);
              }}
            >
              <Cell
                colSpan={cellCount}
                data-pinned=""
                data-kind="status"
                className={cx(styles.cell)}
              >
                <span className={styles.status} data-tone="action">
                  <span className={styles.value}>{child.text}</span>
                  <Icon icon={ArrowRight} className={styles.statusIcon} />
                </span>
              </Cell>
            </Row>
          );
      }
    },
    [childCells, loadingCells, cellCount, childSelectable, retry, leadOn, answerNotice],
  );
  // Told to the rows after every render: each hears of its own children, when they changed.
  const [store] = useState(() => new ChildStore());
  useLayoutEffect(() => {
    store.publish(childShapes);
  });
  const tree = useMemo(
    (): Tree => ({ store, childKey: keyOfChild, childRow }),
    [store, keyOfChild, childRow],
  );

  // The rows of a table whose rows expand, as the library takes them: built once for each item,
  // as the rows of any table are, with their children under them.
  const treeBody = useMemo(() => {
    if (!expandable) return null;
    const unselectable = { isDisabled: true, disabledBehavior: "selection" } as const;
    return (
      <Collection items={shown} dependencies={[rowCells, parentSelectable, leafSet]}>
        {(item) => {
          const key = keyOf.current(item);
          const expands = !leafSet.has(key);
          return (
            <Row
              id={key}
              hasChildItems={expands}
              // The library reads whether a row expands under this name where it tells assistive
              // technology and answers Right and Left (see the notes of the layout on an upgrade).
              {...{ hasChildRows: expands }}
              data-part="parent-row"
              className={cx(styles.row)}
              {...(parentSelectable
                ? {}
                : {
                    ...unselectable,
                    ...(expands
                      ? {
                          onAction: () => {
                            turn(key);
                          },
                        }
                      : {}),
                  })}
              render={(domProps) => (
                <ItemContext value={item}>
                  <div {...(parentSelectable ? domProps : unmarked(domProps))} />
                </ItemContext>
              )}
            >
              {rowCells}
              <TreeChildren parent={key} />
            </Row>
          );
        }}
      </Collection>
    );
  }, [expandable, shown, rowCells, parentSelectable, leafSet, turn]);
  const selectedKeys: string[] = [];
  if (parentSelectable && selectedKey !== undefined && selectedKey !== null) {
    selectedKeys.push(selectedKey);
  }
  if (childSelectable && selectedChildKey !== undefined && selectedChildKey !== null) {
    for (const child of childByKey.values()) {
      if (child.id === selectedChildKey) selectedKeys.push(child.key);
    }
  }
  const treeColumn = expandable
    ? columns.find((column) => column.isRowHeader === true)?.id
    : undefined;

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
  // True while the table returns to its top for another result: see where `resultKey` is read.
  const returning = useRef(false);
  const warned = useRef(false);
  const lookForEnd = () => {
    const element = scroller.current;
    // On the way back to the top for another result, the table is nowhere near its end.
    if (element === null || returning.current) return;
    const rowsEnd = metrics.headerHeight + drawnRows * metrics.rowHeight;
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
    // The width the columns share. A scrollbar along the lower edge takes none of it.
    const width = element.clientWidth;
    setMeasured((before) =>
      before.pinned === pinned && before.scrollbar === scrollbar && before.width === width
        ? before
        : { pinned, scrollbar, width },
    );
  };
  // The selected row the table last brought into view, so that each is brought once: when it is
  // selected, or when it arrives after it was selected.
  const revealed = useRef<string | null>(null);
  const revealSelectedRow = () => {
    const key = selectedKey ?? null;
    // A row selected again after none was is brought again.
    if (key === null) revealed.current = null;
    const element = scroller.current;
    if (revealSelected !== true || expandable || element === null) return;
    if (key === null || key === revealed.current) return;
    // Nothing is laid out yet, or the scroller has no height: there is no view to bring it into.
    if (element.clientHeight === 0) return;
    const index = rows.findIndex((item) => rowKey(item) === key);
    if (index === -1) return;
    revealed.current = key;
    // Rows stand at one height under the header, which stays over the top of the visible part.
    const top = metrics.headerHeight + index * metrics.rowHeight;
    const bottom = top + metrics.rowHeight;
    if (top < element.scrollTop + metrics.headerHeight) {
      element.scrollTop = top - metrics.headerHeight;
    } else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight;
    }
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
      revealSelectedRow();
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
    const element = scroller.current;
    if (element === null || element.scrollTop === 0) return;
    element.scrollTop = 0;
    // The component library keeps the place it was scrolled to until the scroll event of this
    // change reaches it, which the browser sends with the next frame. Rows of another length make
    // it place the visible part again before that, at the old place as far as the new rows reach,
    // and it scrolls back there. So the table goes to its top once more in that frame, before it
    // is drawn, and the end it passes on the way is not taken for the end of the rows.
    //
    // It never waits long: after a few frames the table counts where it is again, wherever the
    // library left it, and so it does as soon as the user scrolls, by wheel, key, or pointer.
    returning.current = true;
    let frames = 0;
    let frame = 0;
    const settle = () => {
      frames += 1;
      if (frames === 1 && element.scrollTop > 0) element.scrollTop = 0;
      if (frames < RETURN_FRAMES) {
        frame = window.requestAnimationFrame(settle);
        return;
      }
      returning.current = false;
      afterLayout.current();
    };
    frame = window.requestAnimationFrame(settle);
    const byUser = () => {
      returning.current = false;
    };
    const inputs = ["wheel", "keydown", "pointerdown", "touchstart"] as const;
    for (const input of inputs) element.addEventListener(input, byUser, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      for (const input of inputs) element.removeEventListener(input, byUser);
      returning.current = false;
    };
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
  // The page's count line is seen under every result but an empty one, whose empty state says
  // that nothing is there; it is still heard. It is a live region only on a table whose rows the
  // page counts or loads in pages; a read-only table keeps its count as the grid's description.
  const countShown = countText !== undefined && !isEmpty;
  const countLive = countText !== undefined || totalRows !== undefined || onLoadMore !== undefined;
  const leftOutLine =
    leftOutText === undefined || leftOut.length === 0
      ? null
      : leftOutText(leftOut.map((column) => column.header));

  // The table and its rows, as the component library takes them. They are built again only when
  // what they show changes: a render of the page for any other reason, with handlers written anew
  // where it renders, does not reach the rows, each of which the library renders again whenever it
  // renders the table.
  const label = props["aria-label"];
  const describedBy = leftOutLine === null ? countId : `${countId} ${leftOutId}`;
  const selectedText = JSON.stringify(selectable ? selectedKeys : []);
  const chosen = useMemo(() => JSON.parse(selectedText) as string[], [selectedText]);
  const columnWidths = useMemo(() => JSON.parse(widthsText) as Width[], [widthsText]);
  const actionsWidthValue = actionsWidth.width;
  const actionsMinWidth = actionsWidth.minWidth;
  const placeholders = useMemo(
    (): Width[] =>
      hasActions
        ? [...columnWidths, { width: actionsWidthValue, minWidth: actionsMinWidth }]
        : columnWidths,
    [columnWidths, hasActions, actionsWidthValue, actionsMinWidth],
  );
  const sortColumn = sort?.column;
  const sortDirection = sort?.direction;
  const loadMoreShape = rows.length % TEXT_SHAPES;
  const rowCount =
    totalRows === undefined || loading || expandable ? undefined : totalRows + HEADER_ROWS;
  const isPressable = selectable || (expandable && !loading);
  // What the table answers is read when it answers: the page writes its handlers anew at every
  // render, and the table is not built again for that.
  const answers = useRef({
    onSelectionChange,
    onChildSelectionChange,
    onExpandedChange,
    onSortChange,
    childByKey,
    lookForEnd,
  });
  useLayoutEffect(() => {
    answers.current = {
      onSelectionChange,
      onChildSelectionChange,
      onExpandedChange,
      onSortChange,
      childByKey,
      lookForEnd,
    };
  });
  const answerSelection = useCallback((keys: RacSelection) => {
    if (keys === "all") return;
    const [key] = keys;
    if (key === undefined) return;
    const now = answers.current;
    const child = now.childByKey.get(String(key));
    // The items of child rows are children of this table, so they are `Child`s.
    if (child !== undefined) now.onChildSelectionChange?.(child.item as Child);
    else now.onSelectionChange?.(String(key));
  }, []);
  const answerExpanded = useCallback((keys: Set<Key>) => {
    answers.current.onExpandedChange?.(new Set([...keys].map(String)));
  }, []);
  const answerSort = useCallback((descriptor: SortDescriptor) => {
    answers.current.onSortChange?.({
      column: String(descriptor.column),
      direction: descriptor.direction,
    });
  }, []);
  const answerScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    // The scroll that brought the table back to its top for another result has arrived.
    if (event.currentTarget.scrollTop === 0) returning.current = false;
    setScrolled(event.currentTarget.scrollTop > 0);
    setScrolledAcross(event.currentTarget.scrollLeft > 0);
    answers.current.lookForEnd();
  }, []);
  const virtualized = useMemo(
    () => (
      <Virtualizer layout={DataTableLayout} layoutOptions={layoutOptions}>
        <Table
          ref={scroller}
          aria-label={label}
          aria-describedby={describedBy}
          // Rows that expand answer the pointer whether or not they can be selected.
          data-selectable={isPressable ? "" : undefined}
          selectionMode={selectable ? "single" : "none"}
          selectionBehavior="toggle"
          disallowEmptySelection
          selectedKeys={chosen}
          onSelectionChange={answerSelection}
          {...(treeColumn === undefined || expandedKeys === undefined
            ? {}
            : {
                treeColumn,
                // A row that cannot be selected is disabled for the selection alone; a row
                // that stands for children being read is disabled for all, so it takes no focus.
                disabledBehavior: "all",
                expandedKeys,
                onExpandedChange: answerExpanded,
              })}
          {...(sortColumn === undefined || sortDirection === undefined
            ? {}
            : { sortDescriptor: { column: sortColumn, direction: sortDirection } })}
          onSortChange={answerSort}
          onScroll={answerScroll}
          className={cx(styles.table)}
          // The library counts the rows it was given. The rows of the whole result are more,
          // and it passes no count of ours on, so the count is set where it draws.
          render={(domProps) => (
            <div {...domProps} {...(rowCount === undefined ? {} : { "aria-rowcount": rowCount })}>
              {domProps.children}
              {expandable ? <KeepFocusDrawn /> : null}
            </div>
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
                width={columnWidths[index]?.width ?? null}
                minWidth={columnWidths[index]?.minWidth ?? null}
                data-column={column.id}
                data-kind={column.kind ?? "text"}
                data-pinned={column.isRowHeader === true ? "" : undefined}
                className={cx(styles.column)}
              >
                {({ sortDirection, allowsSorting }) => (
                  <>
                    <span className={styles.label}>{column.header}</span>
                    {/* At rest a muted two-way mark says the header sorts; the sorted header
                          alone has an arrow, which says the order of the rows. */}
                    {!allowsSorting ? null : sortDirection === undefined ? (
                      <span data-mark="rest" className={styles.mark}>
                        <Icon icon={ChevronsUpDown} />
                      </span>
                    ) : (
                      <span
                        data-mark="sorted"
                        data-direction={sortDirection}
                        className={styles.mark}
                      >
                        <Icon icon={sortDirection === "ascending" ? ArrowUp : ArrowDown} />
                      </span>
                    )}
                  </>
                )}
              </Column>
            ))}
            {hasActions ? (
              <Column
                id={ACTIONS}
                textValue={t("table.actions")}
                width={actionsWidthValue}
                minWidth={actionsMinWidth}
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
                            widths={placeholders}
                          />
                        ))}
                      </div>
                    </>
                  ),
                }
              : {})}
          >
            {expandable ? treeBody : body}
            {loadingMore ? (
              <TableLoadMoreItem isLoading className={cx(styles.loadMore)}>
                <VisuallyHidden>{t("table.loadingMore")}</VisuallyHidden>
                <div aria-hidden="true">
                  <PlaceholderRow
                    part="load-more-row"
                    shape={loadMoreShape}
                    columns={cells}
                    widths={placeholders}
                  />
                </div>
              </TableLoadMoreItem>
            ) : null}
          </TableBody>
        </Table>
      </Virtualizer>
    ),
    [
      layoutOptions,
      label,
      describedBy,
      isPressable,
      selectable,
      chosen,
      answerSelection,
      treeColumn,
      expandedKeys,
      answerExpanded,
      sortColumn,
      sortDirection,
      answerSort,
      answerScroll,
      rowCount,
      columns,
      columnWidths,
      loading,
      hasActions,
      actionsWidthValue,
      actionsMinWidth,
      skeletonRows,
      cells,
      placeholders,
      expandable,
      treeBody,
      body,
      loadingMore,
      loadMoreShape,
    ],
  );

  return (
    <div
      ref={box}
      onFocus={(event) => {
        const cell = (event.target as Element).closest<HTMLElement>("[data-column]");
        if (cell === null) return;
        const row = cell.closest<HTMLElement>('[role="row"][data-key]');
        focused.current = { column: cell.dataset.column ?? "", row: row?.dataset.key ?? null };
      }}
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
        <ChildContentContext value={childContent}>
          <TreeContext value={tree}>{virtualized}</TreeContext>
        </ChildContentContext>
      </ContentContext>
      {isEmpty && emptyState !== undefined ? (
        <div className={styles.empty}>{emptyState}</div>
      ) : null}
      {countShown || leftOutLine !== null ? (
        <div className={styles.foot}>
          {countShown ? (
            <p id={countId} role="status" className={styles.count}>
              {status}
            </p>
          ) : (
            <VisuallyHidden id={countId} {...(countLive ? { role: "status" } : {})}>
              {status}
            </VisuallyHidden>
          )}
          {leftOutLine === null ? null : (
            <p id={leftOutId} data-part="left-out" className={styles.leftOut}>
              {leftOutLine}
            </p>
          )}
        </div>
      ) : (
        <VisuallyHidden id={countId} {...(countLive ? { role: "status" } : {})}>
          {status}
        </VisuallyHidden>
      )}
    </div>
  );
}
