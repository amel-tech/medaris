import React from 'react';

const icons = {
  info:    <path d="M12 11v5M12 8h.01" />,
  success: <path d="M8 12.5l2.5 2.5L16 9.5" />,
  warning: <path d="M12 9v4M12 16h.01" />,
  error:   <path d="M15 9l-6 6M9 9l6 6" />,
};

export function Alert({ tone = 'info', title, children, className = '', ...rest }) {
  return (
    <div className={['mds-alert', `mds-alert--${tone}`, className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }} aria-hidden="true">
        {tone === 'warning' ? <path d="M12 3l9 16H3z" /> : <circle cx="12" cy="12" r="9" />}
        {icons[tone]}
      </svg>
      <div>
        {title && <p className="mds-alert__title">{title}</p>}
        {children}
      </div>
    </div>
  );
}
