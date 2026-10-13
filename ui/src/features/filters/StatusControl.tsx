import type { FacetCounts } from "../../bindings/FacetCounts";
import type { Status } from "../../bindings/Status";
import { MenuButton, MenuItem, MenuSection } from "../../components";
import { formatCount } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";

/** The three statuses, in the order the menu lists them, each with its name in the catalog. */
const STATUSES: readonly { status: Status; name: MessageKey }[] = [
  { status: "Open", name: "filters.status.Open" },
  { status: "Released", name: "filters.status.Released" },
  { status: "All", name: "filters.status.All" },
];

function isStatus(id: string): id is Status {
  return STATUSES.some(({ status }) => status === id);
}

export interface StatusControlProps {
  /** The status in view. */
  status: Status;
  onChange: (status: Status) => void;
  /** How many holds each status would keep, as the command counted them; absent until it has. */
  facets?: FacetCounts | undefined;
  /**
   * The snapshot can tell an open hold from a released one. Without that only the open holds are
   * offered, and the status in view, so that it can be left.
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
  const offered = STATUSES.filter(
    (entry) => hasReleased || entry.status === "Open" || entry.status === status,
  );
  const current = STATUSES.find((entry) => entry.status === status);
  const label = current === undefined ? status : t(current.name);
  const count = (of: Status): number | undefined =>
    of === "Open" ? facets?.open : of === "Released" ? facets?.released : undefined;

  return (
    <MenuButton
      label={label}
      aria-label={t("filters.status.name", { status: label })}
      menuLabel={t("filters.status.menu")}
      isInert={isInert}
      className={className}
    >
      <MenuSection
        title={t("filters.status.list")}
        selectedKey={status}
        onSelectionChange={(id) => {
          if (isStatus(id)) onChange(id);
        }}
      >
        {offered.map((entry) => {
          const kept = count(entry.status);
          return (
            <MenuItem
              key={entry.status}
              id={entry.status}
              {...(kept === undefined ? {} : { detail: formatCount(kept) })}
            >
              {t(entry.name)}
            </MenuItem>
          );
        })}
      </MenuSection>
    </MenuButton>
  );
}
