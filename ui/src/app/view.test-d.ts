// Typecheck only (never run): what the hooks of view.ts hand to a reading, and what they refuse.
import { api } from "../api/commands";
import type { Dim } from "../bindings/Dim";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { HoldQuery } from "../bindings/HoldQuery";
import type { HoldRef } from "../bindings/HoldRef";
import type { HoldsView } from "../bindings/HoldsView";
import type { LinePage } from "../bindings/LinePage";
import type { LineQuery } from "../bindings/LineQuery";
import type { LineRow } from "../bindings/LineRow";
import type { ValuePage } from "../bindings/ValuePage";
import { useSnapshotPages, useSnapshotQuery } from "./view";

export function useReadings(spec: FilterSpec, dim: Dim, query: LineQuery, order: HoldQuery) {
  // The reading is handed the params in their order, each with the type it has in `params`.
  const values = useSnapshotQuery({
    name: "filterValues",
    params: [spec, dim, "57"],
    read: (view, filter, of, search) => api.filterValues(filter, of, search, view),
  });
  const data: ValuePage | undefined = values.data;

  // A paged reading names no type: its row is the row of the page the command answers, and the
  // offset comes before the params.
  const lines = useSnapshotPages({
    name: "lines",
    params: [spec, query],
    read: (view, offset, filter, order) => api.lines(filter, order, offset, view),
  });
  const rows: readonly LineRow[] = lines.rows;
  const first: LinePage | undefined = lines.first;
  // The rows are not anything else: a hold is not a line.
  // @ts-expect-error the rows of `api.lines` are lines
  const notHolds: readonly HoldRef[] = lines.rows;

  // The holds take their offset inside the query.
  const holds = useSnapshotPages({
    name: "holds",
    params: [spec, order],
    read: (view, offset, filter, sorted) => api.holds(filter, { ...sorted, offset }, view),
  });
  const held: readonly HoldRef[] = holds.rows;
  const firstHolds: HoldsView | undefined = holds.first;
  // @ts-expect-error the rows of `api.holds` are holds
  const notLines: readonly LineRow[] = holds.rows;

  // The name of a reading is one of `ReadingName`; a new reading adds its name there.
  const unnamed = useSnapshotQuery({
    // @ts-expect-error "blockers" is not among the readings
    name: "blockers",
    params: [],
    read: () => Promise.resolve(null),
  });

  // A reading that takes more than `params` gives it is a type error.
  const short = useSnapshotQuery({
    name: "filterValues",
    // @ts-expect-error the search text the reading takes is not among the params
    params: [spec, dim],
    read: (view, filter, of, search: string) => api.filterValues(filter, of, search, view),
  });

  return [data, rows, first, notHolds, held, firstHolds, notLines, unnamed, short];
}
