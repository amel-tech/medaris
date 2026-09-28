import React from 'react';

export function NavItem({ icon, children, active = false, className = '', ...rest }) {
  const cls = ['mds-nav-item', active && 'is-active', className].filter(Boolean).join(' ');
  return (
    <a className={cls} aria-current={active ? 'page' : undefined} {...rest}>
      {icon}{children}
    </a>
  );
}

export function NavSection({ children }) {
  return <div className="mds-nav-section">{children}</div>;
}
