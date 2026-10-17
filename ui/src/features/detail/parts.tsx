import type { UseQueryResult } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { asCommandError } from "../../api/error";
import type { Field } from "../../bindings/Field";
import { ErrorState, IconButton, SectionTitle, Skeleton, VisuallyHidden } from "../../components";
import { t } from "../../text/i18n";
import styles from "./Detail.module.css";
import { useDetailFocus } from "./selection";

/** What the panel shows a line or a hold with. */
export interface DetailProps {
  /** The id the heading of the panel takes: the panel is named by it. */
  headingId: string;
  /**
   * The optional fields the snapshot in view has no value for, as the filter bar reads them;
   * `null` until they are known.
   */
  absent: readonly Field[] | null;
  /** Closes the panel and gives the focus back to the row that opened it. */
  onClose: () => void;
}

/**
 * The heading of the panel. It takes the focus when it is shown for a selection that was made
 * from the keyboard or from inside the panel, and whenever the page asks for it.
 */
export function useHeading(): RefObject<HTMLHeadingElement | null> {
  const heading = useRef<HTMLHeadingElement>(null);
  const focus = useDetailFocus();
  useEffect(() => {
    if (focus.takeHeadingAsk()) heading.current?.focus();
    const take = () => {
      heading.current?.focus();
    };
    focus.setHeading(take);
    return () => {
      focus.setHeading(null);
    };
  }, [focus]);
  return heading;
}

/**
 * The answer of a reading for the selection this component shows, and whether it is the answer
 * of before (another snapshot's, or the same one read again): that one is shown dimmed. An answer
 * for another selection never stands in, so a first load shows skeletons. The component is built
 * anew for each selection, so what it kept is always of its own selection.
 */
export function useKept<Data>(query: UseQueryResult<Data>): {
  data: Data | undefined;
  isStale: boolean;
} {
  const [kept, setKept] = useState<{ data: Data } | null>(null);
  const own = query.isPlaceholderData ? undefined : query.data;
  if (own !== undefined) {
    if (kept?.data !== own) setKept({ data: own });
    return { data: own, isStale: query.isRefetching };
  }
  if (kept !== null) return { data: kept.data, isStale: !query.isError };
  return { data: undefined, isStale: false };
}

export interface PanelHeadProps {
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  title: string;
  /** The title is a line ID: written in the monospace, as the export wrote it. */
  isIdentifier?: boolean;
  /** The line above the title: the way back to the line of a hold. */
  trail?: ReactNode;
  /** What stands under the title: the copy of the line ID. */
  children?: ReactNode;
  onClose: () => void;
}

/** The head of the panel: the trail, the heading and the close button, and what follows them. */
export function PanelHead({
  headingId,
  headingRef,
  title,
  isIdentifier = false,
  trail,
  children,
  onClose,
}: PanelHeadProps) {
  return (
    <div data-part="detail-head" className={styles.head}>
      {trail === undefined ? null : <div className={styles.trail}>{trail}</div>}
      <div className={styles.titleRow}>
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          data-identifier={isIdentifier ? "" : undefined}
          className={styles.heading}
        >
          {title}
        </h2>
        <IconButton icon={X} label={t("detail.closePanel")} onPress={onClose} />
      </div>
      {children}
    </div>
  );
}

export interface PanelBodyProps {
  isStale: boolean;
  /** The reading that failed, with its retry; the content of before stays under it. */
  error?: { error: unknown; title: string; retry: () => void; isRetrying: boolean } | null;
  children: ReactNode;
}

/** The part of the panel that scrolls. A re-read dims it and marks it as busy. */
export function PanelBody({ isStale, error, children }: PanelBodyProps) {
  return (
    <div
      data-part="detail-body"
      data-stale={isStale ? "" : undefined}
      aria-busy={isStale ? "true" : undefined}
      className={styles.body}
    >
      {error === undefined || error === null ? null : (
        <ErrorState
          error={asCommandError(error.error)}
          title={error.title}
          onRetry={error.retry}
          isRetrying={error.isRetrying}
        />
      )}
      {children}
    </div>
  );
}

/** A section of the panel: a title of level 3 and what it heads. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.section}>
      <SectionTitle level={3} id={id}>
        {title}
      </SectionTitle>
      {children}
    </section>
  );
}

/** Rows of still blocks in the shape of the rows of a section, on a first load. */
export function SkeletonRows({ count = 2, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div data-part="detail-skeleton" aria-hidden="true" className={styles.rows}>
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className={styles.skeletonRow}>
          {Array.from({ length: lines }, (_, line) => (
            <span key={line} className={styles.skeletonLine}>
              <Skeleton width={line === 0 ? "40%" : `${String(85 - row * 10)}%`} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Says once, to assistive technology, that the panel is loading. */
export function Loading() {
  return <VisuallyHidden role="status">{t("common.loading")}</VisuallyHidden>;
}

/** Whether the snapshot has values for a field: known only once `absent` is. */
export function has(absent: readonly Field[] | null, field: Field): boolean {
  return absent !== null && !absent.includes(field);
}

/** What a fact the hold or the line does not have reads, in the muted ink. */
export function notGiven(): { value: string; isAbsent: true } {
  return { value: t("detail.notGiven"), isAbsent: true };
}
