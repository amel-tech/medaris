import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends Record<string, any>> {
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
    onRowClick?: (row: TData) => void;
    onRowDelete?: (id: string) => Promise<boolean> | void;
    loadingCells?: Set<string>;
  }
  interface ColumnMeta<TData, TValue> {
    inputType?: "input" | "select" | "textarea";
    options?: Array<{ value: string; label: string }>;
    optionsProvider?: (
      data: TData[],
      rowIndex: number
    ) => Array<{ value: string; label: string }>;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
  }
}
