import type { FacetCounts } from "../../bindings/FacetCounts";
import type { Status } from "../../bindings/Status";
import { MenuButton, MenuItem, MenuSection } from "../../components";
import { formatCount } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";

/** The name of each status, in the text catalog. A status without a name does not compile. */
const NAMES: Record<Status, MessageKey> = {
  Open: "filters.status.Open",
  Released: "filters.status.Released",
  All: "filters.status.All",
};

/** The three statuses, in the order the menu lists them. */
const STATUSES: readonly Status[] = ["Open", "Released", "All"];

export interface StatusControlProps {
  /** The status in view. */
  status: Status;
  onChange: (status: Status) => void;
  /** How many holds each status would keep, as the command counted them; absent until it has. */
  facets?: FacetCounts | undefined;
  /**
   * The snapshot in view is known to have released holds. Until it is, and for a snapshot that
   * has none, only the open holds are offered, and the status in view, so that it can be left.
   */
  hasReleased: boolean;
  /** An action on the workspace runs: the control keeps its look and opens nothing. */
  isInert?: boolean;
  className?: string | undefined;
}

/**
 * Which holds are shown: the open ones, the released ones, or all. It is always set, so it is not
 * a chip: a menu button that names the status in view, and a menu of the three with the count of
 * holds each would keep. The count of all holds would be the sum of the other two; the command
 * does not give it and the interface adds nothing up, so that item has none.
 */
export function StatusControl({
  status,
  onChange,
  facets,
  hasReleased,
  isInert = false,
  className,
}: StatusControlProps) {
  const offered = STATUSES.filter((entry) => hasReleased || entry === "Open" || entry === status);
  const label = t(NAMES[status]);
  const count = (of: Status): number | undefined =>
    of === "Open" ? facets?.open : of === "Released" ? facets?.released : undefined;

  return (
    <MenuButton
      label={label}
      aria-label={t("filters.status.name", { status: label })}
      menuLabel={t("filters.status.menu")}
      isInert={isInert}
      isFlush
      className={className}
    >
      <MenuSection
        title={t("filters.status.list")}
        selectedKey={status}
        onSelectionChange={(id) => {
          // The menu reports the key of an item, and the items are the statuses that are offered.
          const chosen = offered.find((entry) => entry === id);
          if (chosen !== undefined) onChange(chosen);
        }}
      >
        {offered.map((entry) => {
          const kept = count(entry);
          return (
            <MenuItem
              key={entry}
              id={entry}
              {...(kept === undefined ? {} : { detail: formatCount(kept) })}
            >
              {t(NAMES[entry])}
            </MenuItem>
          );
        })}
      </MenuSection>
    </MenuButton>
  );
}
