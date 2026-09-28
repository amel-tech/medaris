import React from 'react';

/* .mds-alert. The tone's glyph is a mask the class layer draws from the sprite (.mds-alert__icon),
   so this file draws no icon of its own. */
export function Alert({ tone = 'neutral', title, children, className = '', ...rest }) {
  return (
    <div className={['mds-alert', `mds-alert--${tone}`, className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      <span className="mds-alert__icon" aria-hidden="true" />
      <div>
        {title && <p className="mds-alert__title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
