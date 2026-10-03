import React from 'react';

/* Wraps .mds-btn from components.css. Every size and fill lives in CSS so a
   prototype and production code cannot drift apart. */
export function Button({
  children, variant = 'primary', size = 'regular',
  iconLeft, iconRight, href, fullWidth = false, loading, loadingLabel = 'Yükleniyor',
  disabled, className = '', onClick, onKeyDown, ...rest
}) {
  const busy = Boolean(loading);
  const cls = ['mds-btn', `mds-btn--${size}`, `mds-btn--${variant}`, fullWidth && 'mds-btn--full', className]
    .filter(Boolean).join(' ');

  // A disabled link loses its href, so role="link" keeps it a link; a busy one keeps href and focus.
  const off = href !== undefined && Boolean(disabled) && !busy;
  // Busy, or a disabled link: a click or Enter/Space does nothing (MDS-A11Y-11).
  // pointer-events alone would not stop the keyboard, so a busy submit could fire twice.
  const click = (e) => {
    if (busy || off) { e.preventDefault(); e.stopPropagation(); return; }
    if (onClick) onClick(e);
  };
  const keyDown = (e) => {
    if ((busy || off) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); return; }
    if (onKeyDown) onKeyDown(e);
  };
  const content = (
    <>
      {busy ? <span className="mds-btn__spinner" aria-hidden="true" /> : iconLeft}
      {children}
      {iconRight}
    </>
  );
  // aria-busy is not announced on a button, so a status region beside it speaks instead. It is
  // rendered whenever the caller drives `loading`, so it is in the page before it has to speak.
  const status = loading !== undefined && (
    <span className="mds-visually-hidden" role="status">{busy ? loadingLabel : ''}</span>
  );

  if (href !== undefined) {
    return (
      <>
        <a
          className={cls}
          href={off ? undefined : href}
          role={off ? 'link' : undefined}
          aria-disabled={off || busy ? 'true' : undefined}
          aria-busy={busy ? 'true' : undefined}
          onClick={click}
          onKeyDown={keyDown}
          {...rest}
        >
          {content}
        </a>
        {status}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className={cls}
        disabled={disabled}
        aria-disabled={busy ? 'true' : undefined}
        aria-busy={busy ? 'true' : undefined}
        onClick={click}
        onKeyDown={keyDown}
        {...rest}
      >
        {content}
      </button>
      {status}
    </>
  );
}
