import { Upload } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { OPTIONAL_FIELDS } from "../../api/plantim";
import { dimId, dimName } from "../../app/filters/dims";
import { useFilterOptions } from "../../app/filters/options";
import { useFilters } from "../../app/filters/state";
import { searchWithSelection } from "../../app/selection";
import { useShell } from "../../app/shell/context";
import { Page } from "../../app/shell/Page";
import { useSnapshotQuery } from "../../app/view";
import type { Dim } from "../../bindings/Dim";
import type { FilterSpec } from "../../bindings/FilterSpec";
import type { Group } from "../../bindings/Group";
import type { ViewRef } from "../../bindings/ViewRef";
import { Button, EmptyState, ErrorState, Select, ViewSwitch } from "../../components";
import { t } from "../../text/i18n";
import { FilterBar } from "../filters/FilterBar";
import { startImport } from "../import/start";
import { breakdownAddress, parseBreakdownAddress, type BreakdownMode } from "./address";
import styles from "./BreakdownPage.module.css";
import { breakdownDims } from "./dims";
import { ListMode } from "./ListMode";
import { MatrixMode } from "./MatrixMode";
import { NoHolds } from "./NoHolds";

const NO_GROUPS: readonly Group[] = [];

function readGroups(view: ViewRef, spec: FilterSpec, dim: Dim) {
  return api.breakdown(spec, dim, view);
}

/** The groups on screen, and the dimension and the request they were read for. */
interface Shown {
  groups: readonly Group[];
  dim: Dim;
  key: string;
}

/**
 * Breakdown: the holds the filters keep, grouped by one dimension, as a list of groups with a bar
 * of their holds, or counted by two dimensions as a matrix (see MatrixMode). A view switch under
 * the header chooses between the two. The page holds its state in its address (see address.ts):
 * the mode, the dimension and the groups that are expanded, and the two dimensions of the
 * matrix, so that each mode is as it was when the page switches back to it. Another dimension or
 * another filter is read anew; the groups of before stay on screen, dimmed, until the new ones
 * are there, and the table then returns to its top. Another dimension closes the groups that were
 * open, and drops the sort of the groups.
 *
 * A workspace without snapshots gets an empty state that starts an import. A result without
 * groups says why: the filters, or a snapshot without open holds, and offers the way back.
 */
export function BreakdownPage() {
  const { start } = useShell();
  const hasSnapshot = start.open !== null && start.open.selected !== null;
  const location = useLocation();
  const navigate = useNavigate();
  const state = parseBreakdownAddress(location.search);
  const { spec } = useFilters();
  const isList = state.mode === "list";

  const options = useFilterOptions({ enabled: hasSnapshot });
  // Until the options are read, and when they cannot be, the select offers what every import has.
  const dims = breakdownDims(
    options.data?.absent ?? OPTIONAL_FIELDS,
    options.data?.custom_dims ?? [],
  );
  // The dimension of the address stays chosen while the options are read, also when the
  // snapshot turns out to lack it: the command then answers what it has.
  const choices = dims.some((dim) => dimId(dim) === dimId(state.by)) ? dims : [...dims, state.by];

  const query = useSnapshotQuery({
    name: "breakdown",
    params: [spec, state.by],
    read: readGroups,
    enabled: hasSnapshot && isList,
  });
  // What was read for the request on screen, kept while the next request is read, under the
  // result it is.
  const asked = query.resultKey;
  const [kept, setKept] = useState<Shown | null>(null);
  const own = query.data !== undefined && !query.isPlaceholderData;
  if (own && (kept?.key !== asked || kept.groups !== query.data)) {
    setKept({ groups: query.data, dim: state.by, key: asked });
  }
  const shown: Shown | null = own ? { groups: query.data, dim: state.by, key: asked } : kept;

  if (!hasSnapshot) {
    return (
      <Page title={t("destinations.name.breakdown")}>
        <EmptyState
          title={t("breakdown.emptyTitle")}
          action={
            <Button
              variant="primary"
              icon={Upload}
              onPress={() => {
                void startImport();
              }}
            >
              {t("breakdown.emptyAction")}
            </Button>
          }
        >
          {t("breakdown.emptyText")}
        </EmptyState>
      </Page>
    );
  }

  const isLoading = shown === null && !query.isError;
  const hasTable = shown !== null || !query.isError;
  const isStale = shown !== null && (!own || query.isRefetching);
  const emptyState = shown === null || shown.groups.length > 0 ? undefined : <NoHolds />;
  // A line is opened from the list, and the matrix has none: another mode closes its panel, so
  // the focus is not left to give back to a row that is gone.
  const choose = (mode: string) => {
    const next: BreakdownMode = mode === "matrix" ? "matrix" : "list";
    if (next === state.mode) return;
    void navigate(
      breakdownAddress({ ...state, mode: next }, searchWithSelection(location.search, null)),
      { replace: true },
    );
  };

  return (
    <Page
      title={t("destinations.name.breakdown")}
      fill
      views={
        <ViewSwitch
          aria-label={t("breakdown.modes")}
          views={[
            { id: "list", label: t("breakdown.modeList") },
            { id: "matrix", label: t("breakdown.modeMatrix") },
          ]}
          value={state.mode}
          onChange={choose}
        />
      }
      bar={<FilterBar />}
    >
      <div data-part="breakdown" className={styles.content}>
        {isList ? (
          <>
            <div className={styles.controls}>
              <Select
                label={t("breakdown.groupBy")}
                options={choices.map((dim) => ({ id: dimId(dim), label: dimName(dim) }))}
                selectedKey={dimId(state.by)}
                onSelectionChange={(id) => {
                  const by = choices.find((dim) => dimId(dim) === id);
                  if (by === undefined || id === dimId(state.by)) return;
                  // The groups of another dimension are other groups: none of them is open, and
                  // they are in the command's order.
                  void navigate(
                    breakdownAddress({ ...state, by, open: [], sort: undefined }, location.search),
                    { replace: true },
                  );
                }}
                className={styles.groupBy}
              />
            </div>
            {query.isError ? (
              <ErrorState
                error={asCommandError(query.error)}
                title={t("breakdown.error")}
                onRetry={() => {
                  void query.refetch();
                }}
              />
            ) : null}
            {hasTable ? (
              <ListMode
                state={state}
                spec={spec}
                groups={shown?.groups ?? NO_GROUPS}
                shownDim={shown?.dim ?? state.by}
                isLoading={isLoading}
                isStale={isStale}
                resultKey={shown?.key ?? ""}
                {...(emptyState === undefined ? {} : { emptyState })}
              />
            ) : null}
          </>
        ) : (
          <MatrixMode state={state} spec={spec} dims={dims} />
        )}
      </div>
    </Page>
  );
}
