import React from 'react';

/* Wraps .mds-nav-section: the label above a group of NavItems. Written in sentence
   case; CSS uppercases it, which needs lang="tr" on an ancestor for İ. */
export function NavSection({ children, className = '', ...rest }) {
  return (
    <div className={['mds-nav-section', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
