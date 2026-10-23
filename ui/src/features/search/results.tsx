// The results of the search field as the list shows them: grouped, with what matched marked, the
// detail of each result, the number of its holds, and the Released tag. What is shown is what the
// command returned; nothing is counted or matched here. See DESIGN.md, "Search field".
import { ListBoxItem, ListBoxSection, Header, Text, Collection } from "react-aria-components";
import type { SearchGroup } from "../../bindings/SearchGroup";
import type { SearchGroupKind } from "../../bindings/SearchGroupKind";
import type { SearchHit } from "../../bindings/SearchHit";
import type { TextPart } from "../../bindings/TextPart";
import { Tag, VisuallyHidden } from "../../components";
import { cx } from "../../components/cx";
import { dimName } from "../../app/filters/dims";
import { formatCount, formatList } from "../../text/format";
import { t } from "../../text/i18n";
import { DIM_OF_KIND, isValueKind, textOf } from "./choose";
import styles from "./SearchField.module.css";

/** What was picked in the list; the field adds what is typed to make it a `SearchChoice`. */
export type Picked = { kind: "hit"; hit: SearchHit } | { kind: "more"; group: SearchGroupKind };

/** One item of the list: a result, or the last item of a group that has more than it shows. */
export type ResultRow =
  | { id: string; kind: "hit"; hit: SearchHit }
  | { id: string; kind: "more"; group: SearchGroupKind; count: number };

/** A group of the list, with its rows. */
export interface ResultSection {
  id: string;
  group: SearchGroupKind;
  heading: string;
  rows: ResultRow[];
}

/** The heading of a group: its name and how many results it has in all, "Lines · 12". */
export function headingOf(group: SearchGroup): string {
  return t("search.heading", {
    name: t(`search.group.${group.kind}`),
    total: formatCount(group.total),
  });
}

/** The sections of the list for the groups of an answer, each with its "N more" row when it has more. */
export function sectionsOf(groups: readonly SearchGroup[]): ResultSection[] {
  return groups.map((group) => {
    const rows: ResultRow[] = group.hits.map((hit, index) => ({
      id: `${group.kind}:${String(index)}:${hit.kind}:${hit.value}`,
      kind: "hit",
      hit,
    }));
    const more = group.total - group.hits.length;
    if (more > 0)
      rows.push({ id: `${group.kind}:more`, kind: "more", group: group.kind, count: more });
    return { id: group.kind, group: group.kind, heading: headingOf(group), rows };
  });
}

/** What a polite status says once the answer for what is typed is there: the headings of its groups. */
export function statusOf(groups: readonly SearchGroup[]): string {
  return formatList(groups.map(headingOf));
}

/** Where the results of a group that has more are listed: Blockers for blockers, Lines otherwise. */
function placeOf(group: SearchGroupKind): string {
  return t(group === "Blockers" ? "destinations.name.blockers" : "destinations.name.lines");
}

/** The text of the "N more" row of a group. */
export function moreText(group: SearchGroupKind, count: number): string {
  return t("search.more", { count, place: placeOf(group) });
}

/** The second line of a result: the role of a person, or the name of the field of a value. */
function detailOf(hit: SearchHit): string {
  if (hit.detail !== "") return hit.detail;
  // A person without a role has none; a remark is told by its group.
  if (hit.kind === "Person" || hit.kind === "Remark" || !isValueKind(hit.kind)) return "";
  return dimName(DIM_OF_KIND[hit.kind]);
}

/** The text of a result, its matched parts in the strong weight and the primary ink. */
export function MatchedText({ parts }: { parts: readonly TextPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.matched ? (
          <strong key={index} data-matched="" className={styles.matched}>
            {part.text}
          </strong>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function HitItem({
  row,
  onChoose,
}: {
  row: Extract<ResultRow, { kind: "hit" }>;
  onChoose: () => void;
}) {
  const { hit } = row;
  const text = textOf(hit.parts);
  const detail = detailOf(hit);
  const holds = t("search.holds", { count: hit.holds });
  // What the result is read with after its text: its detail, the tag, the number of its holds.
  const description = formatList(
    [detail, hit.released ? t("search.released") : "", holds].filter((part) => part !== ""),
  );
  return (
    <ListBoxItem id={row.id} textValue={text} onAction={onChoose} className={cx(styles.item)}>
      <Text
        slot="label"
        className={styles.text}
        data-identifier={hit.kind === "Line" ? "" : undefined}
      >
        {/* The marks are for the eye; the text is read whole, as one name. */}
        <span aria-hidden="true">
          <MatchedText parts={hit.parts} />
        </span>
        <VisuallyHidden>{text}</VisuallyHidden>
      </Text>
      <span aria-hidden="true" className={styles.end}>
        {hit.released ? <Tag>{t("search.released")}</Tag> : null}
        <span className={styles.count}>{formatCount(hit.holds)}</span>
      </span>
      {detail === "" ? null : (
        <span aria-hidden="true" className={styles.detail}>
          {detail}
        </span>
      )}
      <VisuallyHidden>
        <Text slot="description">{description}</Text>
      </VisuallyHidden>
    </ListBoxItem>
  );
}

/** The sections of the list, as the children of its `ListBox`. */
export function ResultSectionView({
  section,
  onChoose,
}: {
  section: ResultSection;
  onChoose: (picked: Picked) => void;
}) {
  return (
    <ListBoxSection id={section.id} className={cx(styles.section)}>
      <Header className={styles.heading}>{section.heading}</Header>
      <Collection items={section.rows}>
        {(row) =>
          row.kind === "hit" ? (
            <HitItem
              row={row}
              onChoose={() => {
                onChoose({ kind: "hit", hit: row.hit });
              }}
            />
          ) : (
            <ListBoxItem
              id={row.id}
              textValue={moreText(row.group, row.count)}
              onAction={() => {
                onChoose({ kind: "more", group: row.group });
              }}
              className={cx(styles.item)}
            >
              <Text slot="label" className={styles.more}>
                {moreText(row.group, row.count)}
              </Text>
            </ListBoxItem>
          )
        }
      </Collection>
    </ListBoxSection>
  );
}
