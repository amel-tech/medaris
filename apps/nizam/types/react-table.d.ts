import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends Record<string, any>> {
    updateData: (rowIndex: number, columnId: string, value: unknown) => void;
    onRowClick?: (row: TData) => void;
    onRowDelete?: (id: string) => Promise<boolean> | void;
    loadingCells?: Set<string>;
  }
  interface ColumnMeta<TData, TValue> {
    inputType?: "input" | "select" | "textarea" | "switch";
    options?: Array<{ value: any | boolean; label: string }>;
    optionsProvider?: (
      data: TData[],
      rowIndex: number
    ) => Array<{ value: any; label: string }>;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
  }
}
