import React from 'react';

export function Badge({ children, variant = 'secondary', icon, dot = false, className = '', ...rest }) {
  const cls = ['mds-badge', `mds-badge--${variant}`, className].filter(Boolean).join(' ');
  // The live-now state always carries its dot beside the words (MDS-COL-03).
  const showDot = dot || variant === 'live';
  return (
    <span className={cls} {...rest}>
      {showDot && <span className="mds-badge__dot" aria-hidden="true" />}
      {icon}
      {children}
    </span>
  );
}
