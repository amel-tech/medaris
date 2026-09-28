import React from 'react';

export function Progress({ value = 0, label, className = '', ...rest }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className} {...rest}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-caption)', color: 'var(--text-neutral-tertiary)', marginBottom: 6 }}>
          <span>{label}</span><span>{pct}%</span>
        </div>
      )}
      <div className="mds-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={typeof label === 'string' ? label : undefined}>
        <div className="mds-progress__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 12, className = '', style }) {
  return <div className={['mds-skeleton', className].filter(Boolean).join(' ')} style={{ width, height, ...style }} aria-hidden="true" />;
}
