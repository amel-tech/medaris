import React from 'react';

/* Wraps .mds-btn from components.css. Every size and fill lives in CSS so a
   prototype and production code cannot drift apart. */
export function Button({
  children, variant = 'primary', size = 'regular',
  iconLeft, iconRight, disabled, className = '', ...rest
}) {
  const cls = ['mds-btn', `mds-btn--${size}`, `mds-btn--${variant}`, className]
    .filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

export function IconButton({ icon, label, variant = 'ghost', size = 'regular', className = '', ...rest }) {
  const cls = ['mds-btn', 'mds-icon-btn', `mds-btn--${size}`, `mds-btn--${variant}`, className]
    .filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      {icon}
    </button>
  );
}
