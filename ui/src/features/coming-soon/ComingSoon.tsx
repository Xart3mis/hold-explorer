import { useNavigate } from "react-router";
import { OVERVIEW_PATH, type DestinationId } from "../../app/destinations";
import { Page } from "../../app/shell/Page";
import { Button, EmptyState } from "../../components";
import { t, type MessageKey } from "../../text/i18n";

/**
 * What each destination will show, for the ones that are not built. A destination that is built
 * has no entry: its screen is never shown, and a text nobody reads goes stale.
 */
const descriptions: Partial<Record<DestinationId, MessageKey>> = {
  blockers: "comingSoon.description.blockers",
  history: "comingSoon.description.history",
  people: "comingSoon.description.people",
  "follow-up": "comingSoon.description.follow-up",
  rules: "comingSoon.description.rules",
};

/**
 * The screen of a destination that is not built yet: the page header with the destination's name,
 * and the empty state, both unchanged, inside the normal shell. The title of the empty state says
 * that the destination is not available in this version; its text says what the destination will
 * show; its one action leads to Overview. One component serves every such destination, driven by
 * the destination's id. It is a complete page, not a placeholder.
 */
export function ComingSoon({ destination }: { destination: DestinationId }) {
  const navigate = useNavigate();
  const description = descriptions[destination];
  if (description === undefined) {
    throw new Error(
      `The destination ${destination} has no description of what it will show. ` +
        "Add comingSoon.description to ui/src/locales/en.json and to ComingSoon.tsx before " +
        "marking the destination as not available.",
    );
  }
  return (
    <Page title={t(`destinations.name.${destination}`)} width="form">
      <EmptyState
        title={t("comingSoon.title")}
        action={
          <Button
            onPress={() => {
              void navigate(OVERVIEW_PATH);
            }}
          >
            {t("comingSoon.action")}
          </Button>
        }
      >
        {t(description)}
      </EmptyState>
    </Page>
  );
}
