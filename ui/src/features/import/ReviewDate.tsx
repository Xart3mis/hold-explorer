import { useState } from "react";
import { formatDateTime, formatLongDate } from "../../app/format";
import { t, type MessageKey } from "../../app/i18n";
import type { ImportReview } from "../../bindings/ImportReview";
import type { SnapshotSource } from "../../bindings/SnapshotSource";
import { Button, Checkbox, Notice, TextField } from "../../components";
import type { ImportChoices } from "./draft";
import styles from "./Import.module.css";
import type { DateState } from "./review";

/** Where a date is from, as a sentence about the date in the fields. */
const sources: Record<SnapshotSource, MessageKey> = {
  InfoSheet: "import.review.date.source.InfoSheet",
  FileName: "import.review.date.source.FileName",
  FileTime: "import.review.date.source.FileTime",
  User: "import.review.date.source.User",
};

/** What the file gave, as a sentence, beside a date the user entered in its place. */
const detectedAs: Record<SnapshotSource, MessageKey> = {
  InfoSheet: "import.review.date.detected.InfoSheet",
  FileName: "import.review.date.detected.FileName",
  FileTime: "import.review.date.detected.FileTime",
  User: "import.review.date.detected.User",
};

export interface ReviewDateProps {
  review: ImportReview;
  /** The two fields as they were last left. */
  date: DateState;
  confirmed: boolean;
  /** Keeps what was entered or confirmed. */
  onChoose: (chosen: Partial<ImportChoices>) => void;
  /** An import is running: nothing can be changed. */
  isDisabled: boolean;
}

/**
 * The snapshot date and time, in a date field and a time field, with where the date is from in
 * words. A field takes effect when it is left or Enter is pressed in it, not at every key. A
 * date that differs from the one the file gave is the user's, and the page says so and offers
 * the detected one back. A date that is only the file's modified time is explained and has to be
 * confirmed or replaced.
 */
export function ReviewDate({ review, date, confirmed, onChoose, isDisabled }: ReviewDateProps) {
  const { detected } = review;
  // What is being typed, until the field is left: the page works with what was last left.
  const [typing, setTyping] = useState<{ date?: string; time?: string }>({});
  const dateText = typing.date ?? date.dateText;
  const timeText = typing.time ?? date.timeText;

  const commit = () => {
    if (typing.date === undefined && typing.time === undefined) return;
    setTyping({});
    onChoose({ date: dateText.trim(), time: timeText.trim() });
  };
  const onKeyDown = (event: { key: string; continuePropagation: () => void }) => {
    if (event.key === "Enter") commit();
    else event.continuePropagation();
  };

  const weak = review.date_needs_confirmation && detected !== null && !date.edited;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t("import.review.date.title")}</h2>

      {detected === null ? (
        <Notice tone="warning" title={t("import.review.date.noneTitle")}>
          {t("import.review.date.noneText")}
        </Notice>
      ) : null}
      {weak ? (
        <Notice tone="warning" title={t("import.review.date.weakTitle")}>
          {t("import.review.date.weakText")}
        </Notice>
      ) : null}

      <div className={styles.dateFields}>
        <TextField
          label={t("import.review.date.date")}
          placeholder={t("import.review.date.datePlaceholder")}
          // A date that can be read is read back in words, so a day taken for a month shows.
          description={
            typing.date === undefined && date.date !== null
              ? formatLongDate(date.date)
              : t("import.review.date.dateHelp")
          }
          value={dateText}
          isDisabled={isDisabled}
          onChange={(value) => {
            setTyping((held) => ({ ...held, date: value }));
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          // The message of a year that is refused names the years the review allows.
          {...(typing.date === undefined && date.dateError !== null
            ? {
                errorMessage: t(date.dateError, {
                  first: review.min_year,
                  last: review.max_year,
                }),
              }
            : {})}
          className={styles.dateField}
        />
        <TextField
          label={t("import.review.date.time")}
          placeholder={t("import.review.date.timePlaceholder")}
          description={t("import.review.date.timeHelp")}
          value={timeText}
          isDisabled={isDisabled}
          onChange={(value) => {
            setTyping((held) => ({ ...held, time: value }));
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          {...(typing.time === undefined && date.timeError !== null
            ? { errorMessage: t(date.timeError) }
            : {})}
          className={styles.dateField}
        />
      </div>

      {detected === null ? null : date.edited ? (
        <div className={styles.line}>
          <p className={styles.text}>
            <span className={styles.textPrimary}>{t(sources.User)}</span>{" "}
            <span>{t(detectedAs[detected.source], { date: formatDateTime(detected.at) })}</span>
          </p>
          <Button
            variant="quiet"
            isDisabled={isDisabled}
            onPress={() => {
              setTyping({});
              onChoose({ date: null, time: null });
            }}
          >
            {t("import.review.date.useDetected")}
          </Button>
        </div>
      ) : (
        <p className={styles.text}>{t(sources[detected.source])}</p>
      )}

      {weak ? (
        <Checkbox
          isSelected={confirmed}
          isDisabled={isDisabled}
          onChange={(isSelected) => {
            onChoose({ confirmed: isSelected });
          }}
        >
          {t("import.review.date.confirm")}
        </Checkbox>
      ) : null}
    </section>
  );
}
