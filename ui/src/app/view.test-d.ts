// Typecheck only (never run): what the hooks of view.ts hand to a reading, and what they refuse.
import { api } from "../api/commands";
import type { Dim } from "../bindings/Dim";
import type { FilterSpec } from "../bindings/FilterSpec";
import type { LinePage } from "../bindings/LinePage";
import type { LineQuery } from "../bindings/LineQuery";
import type { LineRow } from "../bindings/LineRow";
import type { ValuePage } from "../bindings/ValuePage";
import { useSnapshotPages, useSnapshotQuery } from "./view";

export function useReadings(spec: FilterSpec, dim: Dim, query: LineQuery) {
  // The reading is handed the params in their order, each with the type it has in `params`.
  const values = useSnapshotQuery({
    name: "filterValues",
    params: [spec, dim, "57"],
    read: (view, filter, of, search) => api.filterValues(filter, of, search, view),
  });
  const data: ValuePage | undefined = values.data;

  // A paged reading names its row, its page, and its params; the offset comes before the params.
  const lines = useSnapshotPages<LineRow, LinePage, [FilterSpec, LineQuery]>({
    name: "lines",
    params: [spec, query],
    read: (view, offset, filter, order) => api.lines(filter, order, offset, view),
  });
  const rows: readonly LineRow[] = lines.rows;
  const first: LinePage | undefined = lines.first;

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

  return [data, rows, first, unnamed, short];
}
