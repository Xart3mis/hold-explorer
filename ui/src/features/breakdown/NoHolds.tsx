import { useFilters } from "../../app/filters/state";
import { Button, EmptyState } from "../../components";
import { t } from "../../text/i18n";

/**
 * What Breakdown shows in the place of its groups when there are none: in a snapshot without open
 * holds, a way to all holds; otherwise a way to clear the filters that keep none.
 */
export function NoHolds() {
  const { isDefault, clear, update } = useFilters();
  return isDefault ? (
    <EmptyState
      placement="table"
      title={t("breakdown.noOpenTitle")}
      action={
        <Button
          onPress={() => {
            update((current) => ({ ...current, status: "All" }));
          }}
        >
          {t("breakdown.noOpenAction")}
        </Button>
      }
    >
      {t("breakdown.noOpenText")}
    </EmptyState>
  ) : (
    <EmptyState
      placement="table"
      title={t("breakdown.noneTitle")}
      action={<Button onPress={clear}>{t("breakdown.noneAction")}</Button>}
    >
      {t("breakdown.noneText")}
    </EmptyState>
  );
}
