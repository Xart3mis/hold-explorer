import { api } from "../../api/commands";
import { useSnapshotQuery } from "../../app/view";
import type { HoldRef } from "../../bindings/HoldRef";
import { Breadcrumb, Button, EmptyState, FactList, Skeleton, type Fact } from "../../components";
import { formatDate, formatDays, isBlank } from "../../text/format";
import { t } from "../../text/i18n";
import styles from "./Detail.module.css";
import {
  has,
  Loading,
  notGiven,
  PanelBody,
  PanelHead,
  Section,
  SkeletonRows,
  useHeading,
  useKept,
  type DetailProps,
} from "./parts";
import { useDetailFocus, useSelection } from "./selection";

/** A text of the hold, or the words that say the export has none. */
function text(value: string): Pick<Fact, "value" | "isAbsent"> {
  return isBlank(value) ? notGiven() : { value };
}

function date(value: string | null): Pick<Fact, "value" | "isAbsent"> {
  return value === null ? notGiven() : { value: formatDate(value) };
}

function days(value: number | null): Pick<Fact, "value" | "isAbsent"> {
  return value === null ? notGiven() : { value: formatDays(value) };
}

/**
 * The facts of a hold that the snapshot has values for: the line, who and what, when, its age or
 * its release, its blocker, and its source ID when it has one. The labels show on a first load.
 */
function holdFacts(hold: HoldRef | undefined, absent: DetailProps["absent"]): Fact[] {
  const row = hold?.row;
  const shows = (field: Parameters<typeof has>[1]) => absent === null || has(absent, field);
  const facts: (Fact | false)[] = [
    { label: t("detail.fact.line"), value: row?.hold.line_id ?? "", kind: "identifier" },
    shows("Discipline") && {
      label: t("detail.fact.discipline"),
      ...text(row?.hold.discipline ?? ""),
    },
    { label: t("detail.fact.holdType"), ...text(row?.hold.hold_type ?? "") },
    shows("Name") && { label: t("detail.fact.name"), ...text(row?.hold.name ?? "") },
    shows("Role") && { label: t("detail.fact.role"), ...text(row?.hold.role ?? "") },
    shows("Created") && { label: t("detail.fact.created"), ...date(row?.hold.created ?? null) },
  ];
  if (row?.hold.released === true) {
    facts.push(
      shows("ReleaseDate") && {
        label: t("detail.fact.releasedOn"),
        ...date(row.hold.release_date),
      },
      shows("Created") && { label: t("detail.fact.duration"), ...days(row.duration_days) },
      shows("ReleaseRemark") && {
        label: t("detail.fact.releaseRemark"),
        ...(row.hold.release_remark === ""
          ? { value: t("detail.noReleaseRemark"), isAbsent: true }
          : { value: row.hold.release_remark }),
      },
    );
  } else {
    facts.push(shows("Created") && { label: t("detail.fact.age"), ...days(row?.age_days ?? null) });
  }
  facts.push(
    {
      label: t("detail.fact.blocker"),
      ...(row === undefined ? { value: "" } : text(row.blocker.item)),
      kind: "identifier",
    },
    { label: t("detail.fact.blockerType"), value: row?.blocker.kind ?? "" },
  );
  if (row?.hold.source_id != null) {
    facts.push({
      label: t("detail.fact.sourceId"),
      value: String(row.hold.source_id),
      kind: "identifier",
    });
  }
  return facts.filter((fact): fact is Fact => fact !== false);
}

/** The columns of the export the mapping did not recognize that have a value on this hold. */
function extraFacts(hold: HoldRef): Fact[] {
  return Object.entries(hold.row.hold.extra)
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => ({ label, value }));
}

/**
 * A hold in the detail panel: the way back to its line, its full remark, its facts, and every
 * other column of the export it has a value in. A position past the end of the snapshot in view
 * is said to be absent, with a way to close the panel.
 */
export function HoldDetail({
  position,
  headingId,
  absent,
  onClose,
}: DetailProps & { position: number }) {
  const heading = useHeading();
  const focus = useDetailFocus();
  const { select } = useSelection();
  const query = useSnapshotQuery({
    name: "holdDetail",
    params: [position],
    read: (view, at) => api.holdDetail(at, view),
  });
  const { data, isStale } = useKept(query);
  const error = query.isError
    ? {
        error: query.error,
        title: t("detail.errorHold"),
        retry: () => void query.refetch(),
        isRetrying: query.isFetching,
      }
    : null;
  const hold = data ?? undefined;
  const lineId = hold?.row.hold.line_id;

  const trail =
    data === null ? undefined : lineId === undefined ? (
      // The line is known with the hold: until then a block keeps its place.
      <span aria-hidden="true" className={styles.trailWaiting}>
        <Skeleton width="22ch" />
      </span>
    ) : (
      <Breadcrumb
        ancestors={[
          {
            label: lineId,
            onPress: () => {
              // The trail is gone once the line shows, so the focus goes to the heading.
              focus.askForHeading();
              select({ kind: "line", lineId });
            },
          },
        ]}
        current={t("detail.holdTitle")}
      />
    );

  const head = (
    <PanelHead
      headingId={headingId}
      headingRef={heading}
      title={t("detail.holdTitle")}
      onClose={onClose}
      {...(trail === undefined ? {} : { trail })}
    />
  );

  if (data === null) {
    return (
      <>
        {head}
        <PanelBody isStale={isStale} error={error}>
          <EmptyState
            title={t("detail.holdMissingTitle")}
            placement="table"
            action={<Button onPress={onClose}>{t("detail.closePanel")}</Button>}
          >
            {t("detail.holdMissingText")}
          </EmptyState>
        </PanelBody>
      </>
    );
  }

  if (data === undefined && error !== null) {
    return (
      <>
        {head}
        <PanelBody isStale={false} error={error}>
          {null}
        </PanelBody>
      </>
    );
  }

  const isLoading = hold === undefined || absent === null;
  const shown = isLoading ? undefined : hold;
  const extras = shown === undefined ? [] : extraFacts(shown);
  return (
    <>
      {head}
      <PanelBody isStale={isStale} error={error}>
        {isLoading ? <Loading /> : null}
        <Section title={t("detail.remark")}>
          {shown === undefined ? (
            <SkeletonRows count={1} />
          ) : (
            <p className={styles.prose}>{shown.row.hold.remark}</p>
          )}
        </Section>
        <Section title={t("detail.facts")}>
          <FactList
            aria-label={t("detail.holdFacts")}
            items={holdFacts(shown, absent)}
            isLoading={isLoading}
          />
        </Section>
        {extras.length === 0 ? null : (
          <Section title={t("detail.otherColumns")}>
            <FactList aria-label={t("detail.otherColumns")} items={extras} />
          </Section>
        )}
      </PanelBody>
    </>
  );
}
