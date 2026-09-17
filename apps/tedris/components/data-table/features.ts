import {
  type CellContext,
  type ColumnDef,
  columnSizingFeature,
  type RowData,
  type TableOptions,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * The table features `DataTable` registers — MDRS-80.
 *
 * react-table v9 bundles only the features a table registers. The MDRS-21 port
 * used `useLegacyTable`, which registers every stock feature, so sorting,
 * filtering, grouping, pagination, pinning, selection and the rest shipped to
 * the browser unused. The core row model is always present; column sizing is
 * the one feature these tables call (`header.getSize()`,
 * `cell.column.getSize()`).
 *
 * Registering a feature here is what makes its APIs exist on the table. A
 * column or caller that needs sorting, selection or visibility has to add that
 * feature first — calling an API whose feature is missing fails at runtime,
 * not at the type level for untyped callers.
 *
 * Kept identical in apps/tedris and apps/nizam.
 */
export const dataTableFeatures = tableFeatures({ columnSizingFeature });

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumnDef<
  TData extends RowData,
  TValue = unknown,
> = ColumnDef<DataTableFeatures, TData, TValue>;

export type DataTableCellContext<
  TData extends RowData,
  TValue = unknown,
> = CellContext<DataTableFeatures, TData, TValue>;

export type DataTableOptions<TData extends RowData> = Omit<
  TableOptions<DataTableFeatures, TData>,
  "features"
>;
