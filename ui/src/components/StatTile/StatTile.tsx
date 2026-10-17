import { ArrowDown, ArrowUp, ChevronRight, Minus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button as RacButton } from "react-aria-components";
import { t } from "../../text/i18n";
import { cx } from "../cx";
import { Icon } from "../Icon/Icon";
import { Skeleton } from "../Skeleton/Skeleton";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./StatTile.module.css";

export interface StatTileGroupProps {
  /** What the figures have in common. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** The tiles. */
  children: ReactNode;
  className?: string | undefined;
}

/** A row of figures in one container, divided by hairlines. Not a row of cards. */
export function StatTileGroup({ children, className, ...props }: StatTileGroupProps) {
  return (
    <div role="group" {...props} className={cx(styles.group, className)}>
      {children}
    </div>
  );
}

const arrows: Record<StatTileDelta["direction"], LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  none: Minus,
};

export interface StatTileDelta {
  /** Which way the figure moved. Shown by an arrow, never by a color. */
  direction: "up" | "down" | "none";
  /** The signed change, formatted: "+24". */
  change: string;
  /** What it is compared with: "since previous snapshot". */
  caption: string;
}

export interface StatTileProps {
  /** The name of the figure. */
  label: string;
  /** The figure, formatted. */
  value?: string;
  /** The change since the previous snapshot, when there is one. */
  delta?: StatTileDelta;
  /** Opens the screen behind the figure. With it, the tile is a button. */
  onPress?: () => void;
  /** A first load: a skeleton stands for the value and the label stays. */
  isLoading?: boolean;
  /** Why the snapshot cannot give the figure. The tile then shows a dash and this reason. */
  unavailable?: string;
}

/** One figure of a stat tile group: a label, a value, and the change when it is known. */
export function StatTile({ label, value, delta, onPress, isLoading, unavailable }: StatTileProps) {
  const loading = isLoading === true;
  const missing = !loading && unavailable !== undefined;
  const pressable = onPress !== undefined && !loading && !missing;
  const content = (
    <>
      <span className={styles.label}>
        {label}
        {/* A tile that opens a screen says so before it is hovered: the ink of what acts, and a chevron. */}
        {pressable ? <Icon icon={ChevronRight} /> : null}
      </span>{" "}
      {loading ? (
        <span className={styles.value}>
          <Skeleton variant="stat" />
          <VisuallyHidden>{t("common.loading")}</VisuallyHidden>
        </span>
      ) : (
        <span className={styles.value} data-missing={missing ? "" : undefined}>
          {missing ? t("common.noValue") : value}
        </span>
      )}
      {missing ? (
        <>
          {" "}
          <span className={styles.caption}>{unavailable}</span>
        </>
      ) : null}
      {!loading && !missing && delta !== undefined ? (
        <>
          {" "}
          <span data-part="delta" data-direction={delta.direction} className={styles.delta}>
            <Icon icon={arrows[delta.direction]} />
            <span>{delta.change}</span> <span className={styles.caption}>{delta.caption}</span>
          </span>
        </>
      ) : null}
    </>
  );
  if (pressable) {
    return (
      <RacButton onPress={onPress} data-pressable="" className={cx(styles.tile)}>
        {content}
      </RacButton>
    );
  }
  return (
    <div className={styles.tile} aria-busy={loading ? "true" : undefined}>
      {content}
    </div>
  );
}
