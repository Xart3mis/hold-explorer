import { DataTable, type DataTableColumn, type LeavingColumn } from "./DataTable";

// Typecheck only (never run): a column that may leave a narrow table is always named under it.
// A table whose columns have a priority is given the sentence that names those that left; one
// whose columns have none needs no sentence.
interface Row {
  id: string;
}

const fixed: DataTableColumn<Row>[] = [
  { id: "id", header: "Line ID", size: { chars: 21 }, isRowHeader: true, cell: (row) => row.id },
];
const leaving: LeavingColumn<Row>[] = [
  ...fixed,
  { id: "note", header: "Note", size: { chars: 8 }, priority: 1, cell: (row) => row.id },
];
const leftOutText = (headers: readonly string[]) => headers.join(", ");
const key = (row: Row) => row.id;

export const tables = [
  <DataTable key="fixed" aria-label="Rows" columns={fixed} rows={[]} rowKey={key} />,
  <DataTable
    key="leaving"
    aria-label="Rows"
    columns={leaving}
    rows={[]}
    rowKey={key}
    leftOutText={leftOutText}
  />,
  // @ts-expect-error columns that may leave are named when they do
  <DataTable key="silent" aria-label="Rows" columns={leaving} rows={[]} rowKey={key} />,
];

// A column of a table without the sentence cannot have a priority.
export const silentColumn: DataTableColumn<Row> = {
  id: "note",
  header: "Note",
  size: { chars: 8 },
  // @ts-expect-error a priority is a number only on a column that may leave
  priority: 1,
  cell: (row) => row.id,
};

// A table whose rows expand is not asked to bring its selected row into view.
export const expanding = [
  // @ts-expect-error revealSelected is for a table whose rows do not expand
  <DataTable
    key="tree"
    aria-label="Rows"
    columns={fixed}
    rows={[]}
    rowKey={key}
    childRows={() => undefined}
    childKey={key}
    childColumns={[]}
    expandedKeys={new Set<string>()}
    onExpandedChange={() => undefined}
    revealSelected
  />,
];
