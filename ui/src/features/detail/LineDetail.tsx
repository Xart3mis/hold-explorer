import { Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button as RacButton } from "react-aria-components";
import { api } from "../../api/commands";
import { useSnapshotQuery } from "../../app/view";
import type { ChainLink } from "../../bindings/ChainLink";
import type { LineDetail as LineAnswer } from "../../bindings/LineDetail";
import {
  Button,
  Disclosure,
  DisclosureGroup,
  DisclosureStatement,
  EmptyState,
  FactList,
  Notice,
  Tag,
  type Fact,
} from "../../components";
import { cx } from "../../components/cx";
import { formatSize } from "../../text/format";
import { t } from "../../text/i18n";
import styles from "./Detail.module.css";
import { HoldList } from "./HoldList";
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

/** Stands for the line ID in a text of the catalog, until the ID is put in as an element. */
const MARK = "\u0000";

/**
 * A sentence of the catalog with the line ID in it, written as an identifier: in the monospace,
 * and never broken at one of its hyphens. The sentence is translated whole; only the place of
 * the ID is filled with an element.
 */
function WithLineId({ text, lineId }: { text: string; lineId: string }) {
  const [before = "", after = ""] = text.split(MARK);
  return (
    <>
      {before}
      <span className={styles.identifier}>{lineId}</span>
      {after}
    </>
  );
}

/**
 * What the copy of the line ID came to: nothing yet, done (counted, so that each copy is said
 * anew), or refused with what to say.
 */
type Copied =
  { state: "idle" } | { state: "done"; count: number } | { state: "refused"; message: string };

/** The button that copies the line ID, what it came to, and, when it was refused, why. */
function CopyLineId({ lineId }: { lineId: string }) {
  const [copied, setCopied] = useState<Copied>({ state: "idle" });
  const copy = () => {
    // The clipboard of the web view: no command of the app and no permission of its own. A
    // web view without it, or a system that refuses, is said so beside the button.
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setCopied({ state: "refused", message: t("detail.noClipboard") });
      return;
    }
    clipboard.writeText(lineId).then(
      () => {
        setCopied((before) => ({
          state: "done",
          count: before.state === "done" ? before.count + 1 : 1,
        }));
      },
      (error: unknown) => {
        setCopied({
          state: "refused",
          message: t("detail.copyFailed", {
            reason: error instanceof Error ? error.message : String(error),
          }),
        });
      },
    );
  };
  return (
    <>
      <div className={styles.copyRow}>
        <Button variant="quiet" icon={Copy} onPress={copy}>
          {t("detail.copyLineId")}
        </Button>
        <span role="status" className={styles.copyStatus}>
          {/* A new element for each copy, so the same words are announced again. */}
          {copied.state === "done" ? <span key={copied.count}>{t("detail.copied")}</span> : null}
        </span>
      </div>
      {copied.state === "refused" ? (
        <Notice tone="danger" title={t("detail.copyFailedTitle")}>
          {copied.message}
        </Notice>
      ) : null}
    </>
  );
}

/**
 * One blocker of the line: its label, its type, its place in the solve order, the lines it
 * blocks. The whole row is the button that opens that blocker in the panel.
 */
function BlockerRow({ link }: { link: ChainLink }) {
  const { select } = useSelection();
  const focus = useDetailFocus();
  return (
    <li className={styles.holdItem}>
      <RacButton
        data-part="blocker-row"
        className={cx(styles.holdRow)}
        onPress={() => {
          // The button is gone once the blocker shows, so the focus goes to the heading.
          focus.askForHeading();
          select({ kind: "blocker", key: link.key });
        }}
      >
        <span className={styles.rowTitle}>{link.label}</span>
        <span className={styles.rowFoot}>
          <Tag>{link.kind}</Tag>
          <span className={styles.caption}>
            {link.step === null ? t("detail.noStep") : t("detail.step", { step: link.step })}
          </span>
          <span className={styles.trailing}>{t("detail.blocksLines", { count: link.lines })}</span>
        </span>
      </RacButton>
    </li>
  );
}

/** The facts of the line that the snapshot has values for. */
function lineFacts(line: LineAnswer | undefined, absent: DetailProps["absent"]): Fact[] {
  const facts: Fact[] = [];
  // Until it is known what the snapshot lacks, every label shows, over its skeleton.
  const shows = (field: "ModelSize" | "LdtSize" | "StressCalc") => absent?.includes(field) !== true;
  if (shows("ModelSize")) {
    facts.push({
      label: t("detail.fact.modelSize"),
      ...(line?.model_size == null ? notGiven() : { value: formatSize(line.model_size) }),
    });
  }
  if (shows("LdtSize")) {
    facts.push({
      label: t("detail.fact.ldtSize"),
      ...(line?.ldt_size == null
        ? notGiven()
        : {
            value: (
              <span className={styles.sizes}>
                {formatSize(line.ldt_size)}
                {line.size_mismatch ? (
                  <Tag tone="warning" icon={TriangleAlert}>
                    {t("detail.sizeMismatch")}
                  </Tag>
                ) : null}
              </span>
            ),
          }),
    });
  }
  if (shows("StressCalc")) {
    facts.push({
      label: t("detail.fact.stressCalc"),
      ...(line === undefined || line.stress_calc === "" ? notGiven() : { value: line.stress_calc }),
    });
  }
  return facts;
}

/**
 * A line in the detail panel: its ID, which can be copied; its sizes and stress calc; the
 * blockers to clear, in the order of the solve plan; its open holds; and its released holds,
 * one press away. A press on a hold opens that hold. A line that has no hold in the snapshot in
 * view is said to be absent, with a way to close the panel.
 */
export function LineDetail({
  lineId,
  headingId,
  absent,
  onClose,
}: DetailProps & { lineId: string }) {
  const heading = useHeading();
  const query = useSnapshotQuery({
    name: "lineDetail",
    params: [lineId],
    read: (view, id) => api.lineDetail(id, view),
  });
  const { data, isStale } = useKept(query);
  const isLoading = data === undefined || absent === null;
  const error = query.isError
    ? {
        error: query.error,
        title: t("detail.errorLine"),
        retry: () => void query.refetch(),
        isRetrying: query.isFetching,
      }
    : null;

  const head = (
    <PanelHead
      headingId={headingId}
      headingRef={heading}
      title={lineId}
      isIdentifier
      onClose={onClose}
    >
      <CopyLineId lineId={lineId} />
    </PanelHead>
  );

  if (data === null) {
    return (
      <>
        {head}
        <PanelBody isStale={isStale} error={error}>
          <EmptyState
            title={t("detail.lineMissingTitle")}
            placement="table"
            action={<Button onPress={onClose}>{t("detail.closePanel")}</Button>}
          >
            <WithLineId text={t("detail.lineMissingText", { lineId: MARK })} lineId={lineId} />
          </EmptyState>
        </PanelBody>
      </>
    );
  }

  // A first load that failed has nothing under its notice.
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

  const facts = lineFacts(data, absent);
  const line = isLoading ? undefined : data;
  return (
    <>
      {head}
      <PanelBody isStale={isStale} error={error}>
        {isLoading ? <Loading /> : null}
        {facts.length === 0 ? null : (
          <FactList aria-label={t("detail.lineFacts")} items={facts} isLoading={isLoading} />
        )}
        <Section title={t("detail.blockers")}>
          {line === undefined ? (
            <SkeletonRows />
          ) : line.chain.length === 0 ? (
            <p className={styles.statement}>{t("detail.noBlockers")}</p>
          ) : (
            <ol aria-label={t("detail.blockers")} className={styles.rows}>
              {line.chain.map((link) => (
                <BlockerRow key={link.key} link={link} />
              ))}
            </ol>
          )}
        </Section>
        <Section title={t("detail.openHolds")}>
          {line === undefined ? (
            <SkeletonRows lines={3} />
          ) : line.open.length === 0 ? (
            <p className={styles.statement}>{t("detail.noOpenHolds")}</p>
          ) : (
            <HoldList holds={line.open} absent={absent} label={t("detail.openHolds")} />
          )}
        </Section>
        {line === undefined || !has(absent, "Released") ? null : (
          <DisclosureGroup>
            {line.released.length === 0 ? (
              <DisclosureStatement>{t("detail.noReleasedHolds")}</DisclosureStatement>
            ) : (
              <Disclosure
                title={t("detail.releasedHolds")}
                count={t("detail.holdCount", { count: line.released.length })}
                level={3}
              >
                <HoldList holds={line.released} absent={absent} label={t("detail.releasedHolds")} />
              </Disclosure>
            )}
          </DisclosureGroup>
        )}
      </PanelBody>
    </>
  );
}
