import { Button, EmptyState } from "../../components";
import { t } from "../../text/i18n";
import type { LinesMode } from "./address";
import { PRESETS, type PresetId } from "./presets";

export interface LinesEmptyStateProps {
  /** The mode of the table without rows. */
  mode: LinesMode;
  /** The preset whose condition keeps lines out, when there is one. */
  narrowing: PresetId | null;
  /** Whether the filters keep what the default keeps: the open holds. */
  isDefault: boolean;
  /** Chooses the All preset. */
  onAllLines: () => void;
  /** Clears the filters. */
  onClear: () => void;
  /** Shows the holds of every status. */
  onAllHolds: () => void;
}

/**
 * Why the table of Lines has no row, and the way back: the preset that keeps every line out
 * (All), the filters that keep nothing (Clear all), or a snapshot without an open hold (all holds).
 */
export function LinesEmptyState({
  mode,
  narrowing,
  isDefault,
  onAllLines,
  onClear,
  onAllHolds,
}: LinesEmptyStateProps) {
  const preset = PRESETS.find((candidate) => candidate.id === narrowing);
  if (preset !== undefined) {
    const name = t(preset.label);
    return (
      <EmptyState
        placement="table"
        title={t("lines.presetNoneTitle", { preset: name })}
        action={<Button onPress={onAllLines}>{t("lines.presetNoneAction")}</Button>}
      >
        {t("lines.presetNoneText", { preset: name })}
      </EmptyState>
    );
  }
  if (isDefault) {
    return (
      <EmptyState
        placement="table"
        title={t("lines.noOpenTitle")}
        action={<Button onPress={onAllHolds}>{t("lines.noOpenAction")}</Button>}
      >
        {t("lines.noOpenText")}
      </EmptyState>
    );
  }
  return (
    <EmptyState
      placement="table"
      title={t(mode === "holds" ? "lines.noneTitleHolds" : "lines.noneTitleLines")}
      action={<Button onPress={onClear}>{t("lines.noneAction")}</Button>}
    >
      {t("lines.noneText")}
    </EmptyState>
  );
}
