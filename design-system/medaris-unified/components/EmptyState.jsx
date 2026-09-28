import React from 'react';

/* A list or region with nothing in it: one sentence, an optional icon the caller
   passes, and at most one action. A page with nothing to show is a SystemState. */
export function EmptyState({ children, icon, action, className = '', ...rest }) {
  return (
    <div className={['mds-empty', className].filter(Boolean).join(' ')} {...rest}>
      {icon && <span className="mds-empty__icon">{icon}</span>}
      <p className="mds-empty__text">{children}</p>
      {action}
    </div>
  );
}
