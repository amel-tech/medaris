import * as React from 'react';

export interface TableProps<Row = any> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** required: the table's name; visually hidden unless captionVisible */
  caption: string;
  captionVisible?: boolean;
  /** one sentence about what is missing, in the surface's register, shown when rows is empty */
  empty?: React.ReactNode;
  rowKey?: TableRowKey<Row>;
  /** the sorted column; the caller sorts the rows */
  sort?: TableSort;
  onSortChange?: TableSortHandler;
  /** below 768: scroll inside the frame (the default) or stack each row as a card */
  responsive?: 'scroll' | 'stack';
  className?: string;
}
export interface TableColumn<Row = any> {
  key: string;
  header: React.ReactNode;
  /** rendered as text-align start / end */
  align?: 'left' | 'right';
  render?: TableCellRenderer<Row>;
  /** a CSS length or % for the column; no fr */
  width?: string;
  emphasis?: 'muted' | 'strong';
  /** the column that names the row (the talebe, the course): <th scope="row"> */
  rowHeader?: boolean;
  /** the header becomes a button; aria-sort on the sorted column */
  sortable?: boolean;
  /** the row's primary action: full width when stacked */
  primaryAction?: boolean;
}
export interface TableSort {
  key: string;
  direction: 'ascending' | 'descending';
}
export type TableCellRenderer<Row = any> = (row: Row, index: number) => React.ReactNode;
export type TableRowKey<Row = any> = (row: Row, index: number) => React.Key;
export type TableSortHandler = (sort: TableSort) => void;
export declare function Table<Row = any>(props: TableProps<Row>): JSX.Element;
