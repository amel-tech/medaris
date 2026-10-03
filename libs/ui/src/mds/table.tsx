import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";

export type SortDirection = "ascending" | "descending";
export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  align?: "start" | "right";
  /** a CSS length, read by the class layer as `--mds-col-w` */
  width?: string;
  sortable?: boolean;
  /** the row's `<th scope="row">` */
  rowHeader?: boolean;
  emphasis?: string;
  /** the cell whose link covers the row */
  primaryAction?: boolean;
  render?: (row: Row, index: number) => ReactNode;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: Row[];
  /** names the table; hidden unless `captionVisible` */
  caption: ReactNode;
  captionVisible?: boolean;
  empty?: ReactNode;
  rowKey?: (row: Row, index: number) => string | number;
  sort?: TableSort;
  /** sorting is the caller's (TanStack Table): Table draws the state and reports the click */
  onSortChange?: (next: TableSort) => void;
  /** `stack` draws each row as a card below 768 and adds the explicit table roles `display: block` can drop */
  responsive?: "scroll" | "stack";
  className?: string;
}

/** `.mds-table` in its frame. */
export function Table<Row extends object>({
  columns = [],
  rows = [],
  caption,
  captionVisible = false,
  empty = "Bu listede henüz bir şey yok.",
  rowKey = (_row, i) => i,
  sort,
  onSortChange,
  responsive = "scroll",
  className,
}: TableProps<Row>) {
  const captionId = `mds-table-${useId().replace(/[^\w-]/g, "")}`;
  const wrap = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);

  // The frame is a focusable region, named by the caption, only while the table
  // itself is wider than it.
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const check = () => {
      const inner = el.firstElementChild as HTMLElement | null;
      setScrolls(Boolean(inner) && (inner?.offsetWidth ?? 0) > el.clientWidth);
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);

  const stack = responsive === "stack";
  const role = (r: string) => (stack ? r : undefined);
  const next = (c: TableColumn<Row>): TableSort => ({
    key: c.key,
    direction:
      sort && sort.key === c.key && sort.direction === "ascending"
        ? "descending"
        : "ascending",
  });
  const region = scrolls
    ? { tabIndex: 0, role: "region", "aria-labelledby": captionId }
    : {};

  return (
    <div ref={wrap} className={cx("mds-table-wrap", className)} {...region}>
      <table
        className={cx("mds-table", stack && "mds-table--stack")}
        role={role("table")}
        aria-labelledby={stack ? captionId : undefined}
      >
        <caption
          id={captionId}
          className={cx(
            "mds-table__caption",
            !captionVisible && "mds-visually-hidden"
          )}
        >
          {caption}
        </caption>
        {columns.some((c) => c.width) ? (
          <colgroup>
            {columns.map((c) => (
              <col
                key={c.key}
                style={
                  c.width
                    ? ({ "--mds-col-w": c.width } as CSSProperties)
                    : undefined
                }
              />
            ))}
          </colgroup>
        ) : null}
        <thead role={role("rowgroup")}>
          <tr role={role("row")}>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                role={role("columnheader")}
                className={c.align === "right" ? "is-end" : undefined}
                aria-sort={
                  sort && sort.key === c.key ? sort.direction : undefined
                }
              >
                {c.sortable ? (
                  <button
                    type="button"
                    className="mds-table__sort"
                    onClick={() => onSortChange?.(next(c))}
                  >
                    {c.header}
                    <span className="mds-table__sort-icon" aria-hidden="true" />
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role={role("rowgroup")}>
          {rows.length === 0 ? (
            <tr role={role("row")}>
              <td
                role={role("cell")}
                className="mds-table__empty"
                colSpan={columns.length}
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} role={role("row")}>
                {columns.map((c) => {
                  const cls =
                    cx(
                      c.align === "right" && "is-end",
                      c.emphasis && `mds-table__cell--${c.emphasis}`,
                      c.primaryAction && "mds-table__primary-action"
                    ) || undefined;
                  const content = c.render
                    ? c.render(row, i)
                    : (row as Record<string, ReactNode>)[c.key];
                  return c.rowHeader ? (
                    <th
                      key={c.key}
                      scope="row"
                      role={role("rowheader")}
                      className={cls}
                    >
                      {content}
                    </th>
                  ) : (
                    <td
                      key={c.key}
                      role={role("cell")}
                      className={cls}
                      data-label={
                        stack && typeof c.header === "string" && c.header
                          ? c.header
                          : undefined
                      }
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
