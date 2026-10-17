import { useId, useState } from "react";
import { useFilters } from "../../app/filters/state";
import { TextField } from "../../components";
import { formatDate, formatLongDate, parseDateInput } from "../../text/format";
import { t } from "../../text/i18n";
import { fieldName } from "./chips";
import styles from "./FilterPicker.module.css";

type Bound = "from" | "to";

/**
 * What a field holds: no day (`null`), a day as `2026-10-01`, or text that is not a day of the
 * calendar, or not yet (`undefined`).
 */
function read(text: string): string | null | undefined {
  if (text.trim() === "") return null;
  return parseDateInput(text) ?? undefined;
}

/**
 * Whether a range has its first day after its last. Both are written year, month, day, with
 * every part at its full width, so the earlier day is the one that sorts first.
 */
function isReversed(from: string | null, to: string | null): boolean {
  return from !== null && to !== null && from > to;
}

export interface DateRangeFieldsProps {
  /** Which of the two dates of a hold is filtered. */
  kind: "created" | "released";
}

/**
 * The editor of a date: the first and the last day kept, each in a field of its own, written
 * year, month, day as in the import review. A day is sent as soon as its field holds a whole
 * date, and a bound is removed when its field is emptied. While a field holds text that is not a
 * date, the bound of before stays in force, and the field says so once it is left. A range whose
 * first day is after its last is not sent: the field that was changed last says which day is on
 * the wrong side of the other.
 */
export function DateRangeFields({ kind }: DateRangeFieldsProps) {
  const { filters, update } = useFilters();
  const range = filters[kind];
  const [typed, setTyped] = useState({ from: range.from ?? "", to: range.to ?? "" });
  // The fields that were left, or had Enter pressed in them, since they were last changed.
  const [left, setLeft] = useState({ from: false, to: false });
  const [changed, setChanged] = useState<Bound>("to");
  const title = useId();

  /** The days the fields ask for: what each holds, or the bound in force while it holds no date. */
  const asked = (texts: { from: string; to: string }) => {
    const from = read(texts.from);
    const to = read(texts.to);
    return { from: from === undefined ? range.from : from, to: to === undefined ? range.to : to };
  };
  const now = asked(typed);
  const reversed = isReversed(now.from, now.to);

  const change = (bound: Bound, text: string) => {
    const next = { ...typed, [bound]: text };
    setTyped(next);
    setChanged(bound);
    setLeft((held) => ({ ...held, [bound]: false }));
    const days = asked(next);
    if (isReversed(days.from, days.to)) return;
    update((current) => ({ ...current, [kind]: days }));
  };

  const field = (bound: Bound) => {
    const day = read(typed[bound]);
    const error =
      day === undefined
        ? left[bound]
          ? t("filters.picker.date.invalid")
          : undefined
        : !reversed || changed !== bound
          ? undefined
          : bound === "from"
            ? t("filters.picker.date.fromAfterTo", { to: formatDate(now.to ?? "") })
            : t("filters.picker.date.toBeforeFrom", { from: formatDate(now.from ?? "") });
    const leave = () => {
      setLeft((held) => ({ ...held, [bound]: true }));
    };
    return (
      <TextField
        label={t(bound === "from" ? "filters.picker.date.from" : "filters.picker.date.to")}
        placeholder={t("filters.picker.date.placeholder")}
        // A date that can be read is read back in words, so a day taken for a month shows.
        description={typeof day === "string" ? formatLongDate(day) : t("filters.picker.date.help")}
        value={typed[bound]}
        onChange={(text) => {
          change(bound, text);
        }}
        onBlur={leave}
        onKeyDown={(event) => {
          if (event.key === "Enter") leave();
          else event.continuePropagation();
        }}
        {...(error === undefined ? {} : { errorMessage: error })}
      />
    );
  };

  return (
    <div role="group" aria-labelledby={title} className={styles.dates}>
      <p id={title} className={styles.title}>
        {fieldName({ kind })}
      </p>
      {field("from")}
      {field("to")}
    </div>
  );
}
