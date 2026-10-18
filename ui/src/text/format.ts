// The one module that formats numbers and dates. Components call these helpers and never `Intl`.
import { locale, t } from "./i18n";

const count = new Intl.NumberFormat(locale);

// Dates cross the boundary as the wall-clock time the file gives, without a time zone. They are
// read as UTC and written as UTC, so the day and the hour shown are the ones the file gave,
// whatever the time zone of this machine.
const date = new Intl.DateTimeFormat(locale, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dateTime = new Intl.DateTimeFormat(locale, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const longDate = new Intl.DateTimeFormat(locale, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const time = new Intl.DateTimeFormat(locale, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

// A plain list with no "and" before the last: file formats, the disciplines of a line. Not a sentence.
const list = new Intl.ListFormat(locale, { style: "short", type: "unit" });

// A size as a drawing gives it: a whole number of inches, or a fraction to three places at most.
const size = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });

const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

// Text in the order a reader expects of a sorted column: case and accents aside, the numbers in it
// as numbers ("Item 2" before "Item 10").
const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });

/**
 * How two texts compare in a sorted column: below zero when `one` comes first, above when
 * `other` does, zero when they are the same to a reader (case and accents aside).
 */
export function compareText(one: string, other: string): number {
  return collator.compare(one, other);
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** The moment a wall-clock text names, read as UTC; `null` when the text is not such a moment. */
function parse(value: string): Date | null {
  const parts = WALL_CLOCK.exec(value);
  if (!parts) return null;
  // A group that did not take part, such as the time of a plain date, is absent and counts as 0.
  const [year, month, day, hour, minute, second] = parts
    .slice(1)
    .map((part: string | undefined) => (part === undefined ? 0 : Number(part)));
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    return null;
  }
  // A year below 100 would be taken as 19xx by the constructor, so the year is set afterwards.
  const moment = new Date(Date.UTC(2000, month - 1, day, hour, minute, second));
  moment.setUTCFullYear(year);
  const same =
    moment.getUTCFullYear() === year &&
    moment.getUTCMonth() === month - 1 &&
    moment.getUTCDate() === day &&
    moment.getUTCHours() === hour &&
    moment.getUTCMinutes() === minute &&
    moment.getUTCSeconds() === second;
  return same ? moment : null;
}

/** A whole number with its thousands separated: `5,042`. */
export function formatCount(value: number): string {
  return count.format(value);
}

/**
 * Whether a text of the export stands for a blank cell: the engine's blank spelling `—` (of a
 * name, a role, a hold type, or the blocker of a blank remark), or nothing at all. Such a text is
 * shown as the mark for no value, and left out of a list.
 */
export function isBlank(value: string): boolean {
  const text = value.trim();
  return text === "" || text === "—";
}

/** A plain list, its items separated the way the locale separates them: `xlsx, csv, txt`, `Piping, Civil`. */
export function formatList(items: readonly string[]): string {
  return list.format(items);
}

/** A share of one as a whole percentage: `45%`. */
export function formatPercent(share: number): string {
  return percent.format(share);
}

/** A date as day, short month, year: `30 Sept 2026`. A text that is not a date is returned as it is. */
export function formatDate(value: string): string {
  const moment = parse(value);
  return moment ? date.format(moment) : value;
}

/** A date and its time on a 24-hour clock: `30 Sept 2026, 14:05`. Other text is returned as it is. */
export function formatDateTime(value: string): string {
  const moment = parse(value);
  return moment ? dateTime.format(moment) : value;
}

/** A number of days the way the export writes it: `71 d`. */
export function formatDays(days: number): string {
  return t("units.days", { value: formatCount(days) });
}

/** A size in inches the way the export writes it: `6"`, `0.75"`. */
export function formatSize(inches: number): string {
  return t("units.inches", { value: size.format(inches) });
}

/**
 * A band of ages in words: `0 to 13 days`, `90 days or more`. A bound that is `null` is open. The
 * word takes its form from the number that stands beside it.
 */
export function formatAgeBand(band: { min_days: number | null; max_days: number | null }): string {
  const { min_days: min, max_days: max } = band;
  if (min === null) return max === null ? t("ageBand.any") : t("ageBand.upTo", { count: max });
  if (max === null) return t("ageBand.from", { count: min });
  if (min === max) return t("ageBand.exact", { count: max });
  return t("ageBand.between", { min: formatCount(min), count: max });
}

/**
 * A range of days in words: `1 Sept 2026 to 30 Sept 2026`, and `from 1 Sept 2026` or
 * `until 30 Sept 2026` for a range that is open at one end. Empty for a range without days.
 */
export function formatDateRange(range: { from: string | null; to: string | null }): string {
  const { from, to } = range;
  if (from === null) return to === null ? "" : t("dateRange.until", { to: formatDate(to) });
  if (to === null) return t("dateRange.from", { from: formatDate(from) });
  if (from === to) return formatDate(from);
  return t("dateRange.between", { from: formatDate(from), to: formatDate(to) });
}

/** A date with its weekday and its month in full, to read back a date that was typed: `Wednesday, 7 October 2026`. */
export function formatLongDate(value: string): string {
  const moment = parse(value);
  return moment ? longDate.format(moment) : value;
}

/** The time of a moment on a 24-hour clock: `14:05`. Other text is returned as it is. */
export function formatTime(value: string): string {
  const moment = parse(value);
  return moment ? time.format(moment) : value;
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

/** The date of a moment as a date field holds it: `2026-10-07`. Empty for text that is no moment. */
export function toDateInput(value: string): string {
  const moment = parse(value);
  if (!moment) return "";
  const year = String(moment.getUTCFullYear()).padStart(4, "0");
  return `${year}-${two(moment.getUTCMonth() + 1)}-${two(moment.getUTCDate())}`;
}

/**
 * The time of a moment as a time field holds it: `08:00`, and `08:00:30` when the moment has
 * seconds, so that what the field shows is the moment to the second. Empty for text that is no
 * moment.
 */
export function toTimeInput(value: string): string {
  const moment = parse(value);
  if (!moment) return "";
  const minutes = `${two(moment.getUTCHours())}:${two(moment.getUTCMinutes())}`;
  const seconds = moment.getUTCSeconds();
  return seconds === 0 ? minutes : `${minutes}:${two(seconds)}`;
}

const TYPED_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const TYPED_TIME = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/;

/**
 * Reads a date as it is typed into a date field: year, month, day, separated by hyphens, slashes,
 * or full stops. Returns it as `2026-10-07`, or `null` when the text is not a day of the calendar.
 */
export function parseDateInput(text: string): string | null {
  const parts = TYPED_DATE.exec(text.trim());
  if (!parts) return null;
  const [, year = "", month = "", day = ""] = parts;
  const written = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return parse(written) ? written : null;
}

/**
 * Reads a time as it is typed into a time field: hours and minutes on a 24-hour clock, with
 * seconds when they are given. Returns it as `08:00:00`, or `null` when the text is not a time of
 * day.
 */
export function parseTimeInput(text: string): string | null {
  const parts = TYPED_TIME.exec(text.trim());
  if (!parts) return null;
  const [, hour = "", minute = "", second = "00"] = parts;
  const written = `${hour.padStart(2, "0")}:${minute}:${second}`;
  return parse(`2000-01-01T${written}`) ? written : null;
}

/** The year of a moment or of a date; `null` for text that is neither. */
export function yearOf(value: string): number | null {
  return parse(value)?.getUTCFullYear() ?? null;
}

/** Whether two moments are the same second. A fraction of a second does not tell them apart. */
export function isSameSecond(first: string, second: string): boolean {
  const one = parse(first);
  const other = parse(second);
  return one !== null && other !== null && one.getTime() === other.getTime();
}
