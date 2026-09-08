import "@tanstack/react-table";
import type { CellData, RowData, TableFeatures } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
  > {
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
    onRowClick?: (row: TData) => void;
    onRowDelete?: (id: string) => Promise<boolean> | void;
    loadingCells?: Set<string>;
  }
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    inputType?: "input" | "select" | "textarea" | "switch";
    options?: Array<{ value: any | boolean; label: string }>;
    optionsProvider?: (
      data: readonly TData[],
      rowIndex: number
    ) => Array<{ value: any; label: string }>;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
  }
}
