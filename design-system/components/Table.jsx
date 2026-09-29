import React from 'react';

export function Table({ columns = [], rows = [], empty = 'Kayıt yok', rowKey = (_, i) => i }) {
  return (
    <div style={{ border: '1px solid var(--border-neutral-primary)', borderRadius: 'var(--radius-m)', overflow: 'hidden', background: 'var(--background-white)' }}>
      <table className="mds-table">
        <thead>
          <tr>{columns.map(c => <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ color: 'var(--text-neutral-tertiary)', textAlign: 'center', padding: 'var(--space-xl)' }}>{empty}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {columns.map(c => (
                <td key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
