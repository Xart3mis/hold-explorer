import { useLocation, useNavigate } from "react-router";
import { OVERVIEW_PATH, WELCOME_PATH } from "../../app/destinations";
import { t } from "../../text/i18n";
import { Button, EmptyState } from "../../components";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";

/**
 * What an address shows that no page has. It says so, names the address, and leads back: to
 * Overview, or to the workspaces while no workspace is open.
 */
export function NotFoundPage() {
  const { start } = useShell();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const hasWorkspace = start.open !== null;
  return (
    <Page title={t("notFound.title")} width="form">
      <EmptyState
        title={t("notFound.heading")}
        action={
          <Button
            onPress={() => {
              void navigate(hasWorkspace ? OVERVIEW_PATH : WELCOME_PATH);
            }}
          >
            {hasWorkspace ? t("notFound.toOverview") : t("notFound.toWorkspaces")}
          </Button>
        }
      >
        {t("notFound.text", { path: pathname })}
      </EmptyState>
    </Page>
  );
}
