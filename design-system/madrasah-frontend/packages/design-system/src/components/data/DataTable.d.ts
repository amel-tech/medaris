import type { CSSProperties, ReactNode } from "react";

export interface DataTableColumn<Row = any> {
  /** Header label. */
  header: ReactNode;
  /** Field name, when no custom cell renderer is given. */
  key?: string;
  /** Custom cell renderer. */
  cell?: (row: Row, index: number) => ReactNode;
  /** Grid track, e.g. "2fr" | "90px". @default "1fr" */
  width?: string;
  /** @default "left" */
  align?: "left" | "right";
  /** Render the cell in --muted. */
  muted?: boolean;
  /** Render the cell at weight 600. */
  strong?: boolean;
}

/**
 * @startingPoint section="Data" subtitle="Dense hairline list table" viewport="700x230"
 */
export interface DataTableProps<Row = any> {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  /** Stable key per row. */
  rowKey?: (row: Row, index: number) => string | number;
  /** Empty-state copy. Plain, never cute. @default "Kayıt yok." */
  empty?: string;
  style?: CSSProperties;
}

/** CSS-grid table with a tinted header and hairline row dividers. Nizam list pattern. */
export declare function DataTable<Row = any>(props: DataTableProps<Row>): JSX.Element;
