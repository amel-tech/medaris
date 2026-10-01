import React from 'react';

// Success and info close themselves after 6 s, or 10 s when they offer an action; the
// timer pauses while the pointer or the focus is on the toast. Warning and error stay
// until someone closes them.
const dwell = 6000;
const dwellWithAction = 10000;

/* One toast. It renders inside the app's single <Toaster>, whose live regions
   announce it; on its own it is announced by nothing. */
export function Toast({ tone = 'success', title, description, action, onClose, closeLabel = 'Kapat', className = '', ...rest }) {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const left = React.useRef(action ? dwellWithAction : dwell);
  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  });
  const timed = Boolean(onClose) && tone !== 'warning' && tone !== 'error';

  React.useEffect(() => {
    if (!timed || hovered || focused) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => close.current?.(), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [timed, hovered, focused]);

  const cls = ['mds-toast', `mds-toast--${tone}`, className].filter(Boolean).join(' ');
  return (
    <div
      {...rest}
      className={cls}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <span className="mds-toast__icon" aria-hidden="true" />
      <div className="mds-toast__body">
        <p className="mds-toast__title">{title}</p>
        {description && <p className="mds-toast__desc">{description}</p>}
        {action && <div className="mds-toast__action">{action}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          className="mds-btn mds-icon-btn mds-btn--mini mds-btn--ghost mds-toast__close"
          aria-label={closeLabel}
          onClick={onClose}
        />
      )}
    </div>
  );
}
