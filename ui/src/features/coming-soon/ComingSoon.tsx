import { useNavigate } from "react-router";
import { OVERVIEW_PATH, type DestinationId } from "../../app/destinations";
import { t } from "../../app/i18n";
import { Button, EmptyState } from "../../components";
import { Page } from "../shell/Page";

/**
 * The screen of a destination that is not built yet: the page header with the destination's name,
 * and the empty state, both unchanged, inside the normal shell. The title of the empty state says
 * that the destination is not available in this version; its text says what the destination will
 * show; its one action leads to Overview. One component serves every such destination, driven by
 * the destination's id. It is a complete page, not a placeholder.
 */
export function ComingSoon({ destination }: { destination: DestinationId }) {
  const navigate = useNavigate();
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
        {t(`comingSoon.description.${destination}`)}
      </EmptyState>
    </Page>
  );
}
