import React from 'react';

// The tooltip id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `t${++seq}`)[0]);

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

/* Wraps one focusable element in .mds-tooltip-anchor. The tooltip shows on hover and keyboard focus,
   stays while the pointer is on it, and Esc hides it until the pointer leaves or focus moves
   (WCAG 1.4.13, MDS-A11Y-10). It describes its child unless `describes` is off. */
export function Tooltip({ label, children, describes = true, placement = 'top', className = '' }) {
  const id = `mds-tooltip-${useUid()}`;
  const anchor = React.useRef(null);
  const [dismissed, setDismissed] = React.useState(false);
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
  const child = React.Children.only(children);
  const own = child.props['aria-describedby'];
  const trigger = describes
    ? React.cloneElement(child, { 'aria-describedby': own ? `${own} ${id}` : id })
    : child;
  const cls = ['mds-tooltip-anchor', placement === 'bottom' && 'mds-tooltip-anchor--bottom', className]
    .filter(Boolean).join(' ');
  return (
    <span ref={anchor} className={cls} data-dismissed={dismissed ? '' : undefined} onMouseEnter={show} onFocus={show} onMouseLeave={reset} onBlur={reset}>
      {trigger}
      <span className="mds-tooltip" role="tooltip" id={id} aria-hidden={describes ? undefined : 'true'}>{label}</span>
    </span>
  );
}
