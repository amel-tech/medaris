import React from 'react';

export function Card({ title, action, children, className = '', ...rest }) {
  return (
    <div className={['mds-card', className].filter(Boolean).join(' ')} {...rest}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
          {title && <h3 className="mds-card__title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({ label, value, tone = 'neutral', children }) {
  const color = tone === 'error' ? 'var(--text-error-primary)'
    : tone === 'success' ? 'var(--text-success-primary)'
    : 'var(--text-neutral-primary)';
  return (
    <div className="mds-card">
      <span className="mds-caption">{label}</span>
      <span style={{ display: 'block', marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-h4)', fontWeight: 'var(--weight-bold)', lineHeight: 1, color }}>{value}</span>
      {children}
    </div>
  );
}
