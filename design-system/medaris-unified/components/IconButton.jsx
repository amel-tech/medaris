import React from 'react';

// Keeps a shown bubble inside the viewport and every clipping ancestor (a table frame, a
// sheet): measured once it shows, the shift is written as a data variable the class layer reads.
function place(anchor) {
  const tip = anchor && anchor.querySelector(':scope > .mds-tooltip');
  if (!tip) return;
  tip.style.removeProperty('--mds-tooltip-shift');
  const r = tip.getBoundingClientRect();
  if (!r.width) return;
  let lo = 8;
  let hi = document.documentElement.clientWidth - 8;
  for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).overflowX === 'visible') continue;
    const b = el.getBoundingClientRect();
    lo = Math.max(lo, b.left + el.clientLeft);
    hi = Math.min(hi, b.left + el.clientLeft + el.clientWidth);
  }
  const shift = r.left < lo ? lo - r.left : r.right > hi ? Math.max(hi - r.right, lo - r.left) : 0;
  if (shift) tip.style.setProperty('--mds-tooltip-shift', `${Math.round(shift)}px`);
}

/* An icon-only .mds-btn whose name also shows as a tooltip. It renders the Tooltip markup itself
   (a component file stands alone, MDS-COMP-06). The name is aria-label, so the tooltip, the same
   text, is hidden from assistive technology. */
export function IconButton({ icon, label, variant = 'ghost', size = 'regular', className = '', ...rest }) {
  const anchor = React.useRef(null);
  const [dismissed, setDismissed] = React.useState(false);
  // Esc hides the tooltip while it shows, wherever focus is; leaving or blurring resets it (MDS-A11Y-10).
  React.useEffect(() => {
    // Capture phase, and the key is consumed while the bubble shows: inside a modal Dialog the
    // same Esc would otherwise also close the dialog.
    const onKey = (e) => {
      const a = anchor.current;
      if (e.key !== 'Escape' || !a || a.hasAttribute('data-dismissed') || !a.matches(':hover, :has(:focus-visible)')) return;
      e.preventDefault();
      setDismissed(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  const reset = () => setDismissed(false);
  const show = () => requestAnimationFrame(() => place(anchor.current));
  const cls = ['mds-btn', 'mds-icon-btn', `mds-btn--${size}`, `mds-btn--${variant}`, className]
    .filter(Boolean).join(' ');
  return (
    <span ref={anchor} className="mds-tooltip-anchor" data-dismissed={dismissed ? '' : undefined} onMouseEnter={show} onFocus={show} onMouseLeave={reset} onBlur={reset}>
      <button type="button" className={cls} aria-label={label} {...rest}>
        {icon}
      </button>
      <span className="mds-tooltip" role="tooltip" aria-hidden="true">{label}</span>
    </span>
  );
}
