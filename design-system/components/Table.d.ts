import * as React from 'react';

export interface Column<Row = any> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right';
  render?: (row: Row) => React.ReactNode;
}

export interface TableProps<Row = any> {
  columns: Column<Row>[];
  rows: Row[];
  /** Shown in place of the body when `rows` is empty. */
  empty?: React.ReactNode;
  rowKey?: (row: Row, index: number) => React.Key;
}
export declare function Table<Row = any>(props: TableProps<Row>): JSX.Element;
