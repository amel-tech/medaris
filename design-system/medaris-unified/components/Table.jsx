import React from 'react';

// The caption id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `t${++seq}`)[0]);

/* Wraps .mds-table in its frame. Sorting is the caller's: Table draws the state and
   reports the click. responsive="stack" draws each row as a card below 768, and so adds
   the explicit table roles that display: block can drop. */
export function Table({
  columns = [], rows = [], caption, captionVisible = false, empty = 'Bu listede henüz bir şey yok.',
  rowKey = (_, i) => i, sort, onSortChange, responsive = 'scroll', className = '',
}) {
  const captionId = `mds-table-${useUid().replace(/[^\w-]/g, '')}`;
  const wrap = React.useRef(null);
  const [scrolls, setScrolls] = React.useState(false);

  // The frame is a focusable region, named by the caption, only while the table itself is
  // wider than it: the frame's scrollWidth would also count a positioned descendant's overflow.
  React.useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const check = () => setScrolls(Boolean(el.firstElementChild) && el.firstElementChild.offsetWidth > el.clientWidth);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    check();
    return () => ro.disconnect();
  }, []);

  const stack = responsive === 'stack';
  const role = (r) => (stack ? r : undefined);
  const next = (c) => ({
    key: c.key,
    direction: sort && sort.key === c.key && sort.direction === 'ascending' ? 'descending' : 'ascending',
  });
  const region = scrolls ? { tabIndex: 0, role: 'region', 'aria-labelledby': captionId } : {};

  return (
    <div ref={wrap} className={['mds-table-wrap', className].filter(Boolean).join(' ')} {...region}>
      <table className={['mds-table', stack && 'mds-table--stack'].filter(Boolean).join(' ')} role={role('table')} aria-labelledby={stack ? captionId : undefined}>
        <caption id={captionId} className={['mds-table__caption', !captionVisible && 'mds-visually-hidden'].filter(Boolean).join(' ')}>{caption}</caption>
        {columns.some((c) => c.width) && (
          <colgroup>
            {columns.map((c) => <col key={c.key} style={c.width ? { '--mds-col-w': c.width } : undefined} />)}
          </colgroup>
        )}
        <thead role={role('rowgroup')}>
          <tr role={role('row')}>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                role={role('columnheader')}
                className={c.align === 'right' ? 'is-end' : undefined}
                aria-sort={sort && sort.key === c.key ? sort.direction : undefined}
              >
                {c.sortable ? (
                  <button type="button" className="mds-table__sort" onClick={() => onSortChange && onSortChange(next(c))}>
                    {c.header}
                    <span className="mds-table__sort-icon" aria-hidden="true" />
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role={role('rowgroup')}>
          {rows.length === 0 ? (
            <tr role={role('row')}>
              <td role={role('cell')} className="mds-table__empty" colSpan={columns.length}>{empty}</td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={rowKey(row, i)} role={role('row')}>
              {columns.map((c) => {
                const cls = [
                  c.align === 'right' && 'is-end',
                  c.emphasis && `mds-table__cell--${c.emphasis}`,
                  c.primaryAction && 'mds-table__primary-action',
                ].filter(Boolean).join(' ') || undefined;
                const content = c.render ? c.render(row, i) : row[c.key];
                return c.rowHeader ? (
                  <th key={c.key} scope="row" role={role('rowheader')} className={cls}>{content}</th>
                ) : (
                  <td key={c.key} role={role('cell')} className={cls} data-label={stack && typeof c.header === 'string' && c.header ? c.header : undefined}>{content}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
