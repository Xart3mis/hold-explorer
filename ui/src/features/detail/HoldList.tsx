import { Button as RacButton } from "react-aria-components";
import type { HoldRef } from "../../bindings/HoldRef";
import { formatDate, formatDays, formatList, isBlank } from "../../text/format";
import { t } from "../../text/i18n";
import { cx } from "../../components/cx";
import styles from "./Detail.module.css";
import { has, notGiven, type DetailProps } from "./parts";
import { useDetailFocus, useSelection } from "./selection";

/** What a hold is: its discipline and hold type, without what the export left blank. */
function kindOf(discipline: string, holdType: string): string {
  const kind = [discipline, holdType].filter((part) => !isBlank(part));
  return kind.length === 0 ? notGiven().value : formatList(kind);
}

/** Who raised a hold and when, as far as the export says. */
function raised({ row }: HoldRef, showsWho: boolean, showsWhen: boolean): string {
  const who = showsWho
    ? formatList([row.hold.name, row.hold.role].filter((part) => !isBlank(part)))
    : "";
  const date = showsWhen && row.hold.created !== null ? formatDate(row.hold.created) : "";
  if (who !== "" && date !== "") return t("detail.raisedByOn", { who, date });
  if (who !== "") return t("detail.raisedBy", { who });
  if (date !== "") return t("detail.raisedOn", { date });
  return t("detail.raisedUnknown");
}

export interface HoldListProps {
  holds: readonly HoldRef[];
  absent: DetailProps["absent"];
  label: string;
  /** Each row names the line of its hold first: for holds that are not all of one line. */
  showsLine?: boolean;
}

/** Holds, each a button that opens that hold in the panel. */
export function HoldList({ holds, absent, label, showsLine = false }: HoldListProps) {
  const { select } = useSelection();
  const focus = useDetailFocus();
  const showsWho = has(absent, "Name") || has(absent, "Role");
  const showsWhen = has(absent, "Created");
  return (
    <ul aria-label={label} className={styles.rows}>
      {holds.map((hold) => {
        const { row } = hold;
        const days = row.hold.released ? row.duration_days : row.age_days;
        return (
          <li key={hold.position} className={styles.holdItem}>
            <RacButton
              data-part="hold-row"
              className={cx(styles.holdRow)}
              onPress={() => {
                // The button is gone once the hold shows, so the focus goes to the heading.
                focus.askForHeading();
                select({ kind: "hold", position: hold.position });
              }}
            >
              {showsLine ? <span className={styles.lineId}>{row.hold.line_id}</span> : null}
              <span className={styles.holdHead}>
                <span className={styles.holdKind}>
                  {kindOf(row.hold.discipline, row.hold.hold_type)}
                </span>
                {days === null || !showsWhen ? null : (
                  <span className={styles.trailing}>
                    {t(row.hold.released ? "detail.duration" : "detail.age", {
                      days: formatDays(days),
                    })}
                  </span>
                )}
              </span>
              <span className={styles.remark}>{row.hold.remark}</span>
              <span className={styles.caption}>{raised(hold, showsWho, showsWhen)}</span>
            </RacButton>
          </li>
        );
      })}
    </ul>
  );
}
