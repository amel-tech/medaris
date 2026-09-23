import React from 'react';

export function Badge({ children, variant = 'secondary', icon, className = '', ...rest }) {
  const cls = ['mds-badge', `mds-badge--${variant}`, className].filter(Boolean).join(' ');
  return <span className={cls} {...rest}>{icon}{children}</span>;
}
