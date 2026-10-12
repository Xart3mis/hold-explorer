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

// A plain list of names with no "and" before the last: file formats, not a sentence.
const list = new Intl.ListFormat(locale, { style: "short", type: "unit" });

const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

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

/** A plain list, its items separated the way the locale separates them: `xlsx, csv, txt`. */
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
