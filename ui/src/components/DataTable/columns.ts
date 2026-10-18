import type { CharWidths } from "./measure";

/** What a column holds. It decides the alignment, the figures, and the typeface of its cells. */
export type DataTableColumnKind = "text" | "number" | "identifier";

/** How wide a column is. `chars`: room for that many characters of its typeface. `flex`: a share of the width that is left, never narrower than `minChars`. */
export type ColumnSize = { chars: number } | { flex: number; minChars: number };

/** The room that many characters of a column take, with the padding of the cell around them. */
function room(chars: number, kind: DataTableColumnKind, widths: CharWidths, paddingX: number) {
  const char = kind === "identifier" ? widths.mono : widths.text;
  // A part of a pixel is rounded up: a column a hair too narrow would cut its last character.
  return Math.ceil(chars * char) + 2 * paddingX;
}

/** Pixel widths for the layout: `chars` times the width of one character of the column's typeface, plus the cell padding on both sides. */
export function columnWidth(
  size: ColumnSize,
  kind: DataTableColumnKind,
  widths: CharWidths,
  paddingX: number,
): { width: number | `${number}fr`; minWidth: number } {
  if ("chars" in size) {
    const width = room(size.chars, kind, widths, paddingX);
    return { width, minWidth: width };
  }
  const share = `${String(size.flex)}fr` as `${number}fr`;
  return { width: share, minWidth: room(size.minChars, kind, widths, paddingX) };
}

/**
 * A letter of running text against a figure. A column is sized in figures, the widest
 * characters of the table face, which are set on equal widths; the letters of a sentence take
 * less. Measured in the table face: a header in sentence case comes to 0.65 to 0.79 of a figure
 * for each character, a remark in capitals to 0.84.
 */
const LETTER = 0.85;

/**
 * The characters to declare for a column that has to hold this text: its figures count in full
 * and every other character as a letter. For a column sized from the texts it shows, such as a
 * date or the values of a preview. An identifier is counted by its length alone: every
 * character of the monospace face is as wide as the next.
 */
export function textChars(text: string): number {
  const figures = text.replace(/\D/g, "").length;
  return figures + (text.length - figures) * LETTER;
}

/**
 * The least width of a column, whatever it declares: the room of its header. A header is not
 * cut, also not one that is longer than the values under it or that grew in a translation,
 * unless the column says how much of it to make room for (`most`, in characters): the table view
 * of a chart, whose headers are values of the data. It is counted from its text as `textChars`
 * counts, and a header that can be sorted keeps the room of the arrow (`arrow`: the icon and its
 * gap).
 */
/** Whether a column that makes room for `most` characters of its header cuts this header. */
export function isHeaderCut(header: string, most: number | undefined): boolean {
  return most !== undefined && textChars(header) > most;
}

export function headerWidth(
  header: string,
  allowsSorting: boolean,
  widths: CharWidths,
  paddingX: number,
  arrow: number,
  most = Number.POSITIVE_INFINITY,
): number {
  const chars = Math.min(textChars(header), most);
  return room(chars, "text", widths, paddingX) + (allowsSorting ? arrow : 0);
}

/** What `leavingColumns` needs to know of a column. */
export interface FitColumn {
  id: string;
  /** The least width the column takes, in pixels. */
  least: number;
  /** The higher, the sooner it leaves; a column without one always stays. */
  priority?: number | undefined;
  /** The column names the row, or the rows are sorted by it: it always stays. */
  stays: boolean;
  /** The column takes a share of the width that is left; the last such column stays. */
  takesShare?: boolean;
}

/**
 * The columns that leave a table of this width, so that the rest fit: the one of the highest
 * priority first, and of two with the same priority the later one, until the least widths of the
 * others and of the room that is kept besides (`kept`: the row actions) fit in the width. The last
 * column that takes a share of the width stays, so the rows reach the edge of a wider table. A
 * width that is not known (zero, where nothing is laid out) lets every column stay. When no column
 * is left that may leave, the rest stay, and the table scrolls sideways.
 */
export function leavingColumns(
  columns: readonly FitColumn[],
  width: number,
  kept = 0,
): ReadonlySet<string> {
  const leaving = new Set<string>();
  if (!(width > 0)) return leaving;
  let needed = kept + columns.reduce((sum, column) => sum + column.least, 0);
  let shares = columns.filter((column) => column.takesShare === true).length;
  const candidates = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.priority !== undefined && !column.stays)
    .sort(
      (one, other) =>
        (other.column.priority ?? 0) - (one.column.priority ?? 0) || other.index - one.index,
    );
  for (const { column } of candidates) {
    if (needed <= width) break;
    if (column.takesShare === true) {
      if (shares === 1) continue;
      shares -= 1;
    }
    leaving.add(column.id);
    needed -= column.least;
  }
  return leaving;
}
