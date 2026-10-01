import React from 'react';

const urgent = (toast) => toast.props.tone === 'warning' || toast.props.tone === 'error';

/* The live-region host, mounted once per app before any toast. Its children are the
   current toasts, oldest first: the newest three show, success and info in the polite
   region, warning and error in the assertive one. */
export function Toaster({ label = 'Bildirimler', children, className = '', ...rest }) {
  const ref = React.useRef(null);
  const toasts = React.Children.toArray(children).filter(React.isValidElement).slice(-3);
  const shown = toasts.length > 0;

  // While a toast shows, the height it covers reaches <html> as --mds-fixed-end, which
  // base.css turns into scroll padding, so a focused control never sits under it
  // (MDS-A11Y-09). The value another fixed layer set there comes back when it empties.
  React.useEffect(() => {
    const el = ref.current;
    if (!shown || !el || typeof ResizeObserver !== 'function') return undefined;
    const root = document.documentElement;
    const before = root.style.getPropertyValue('--mds-fixed-end');
    const report = () => {
      const covered = Math.ceil(window.innerHeight - el.getBoundingClientRect().top);
      root.style.setProperty('--mds-fixed-end', `${Math.max(covered, Number.parseFloat(before) || 0)}px`);
    };
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      if (before) root.style.setProperty('--mds-fixed-end', before);
      else root.style.removeProperty('--mds-fixed-end');
    };
  }, [shown]);

  return (
    <section {...rest} ref={ref} className={['mds-toaster', className].filter(Boolean).join(' ')} aria-label={label}>
      <div role="status" aria-atomic="false">{toasts.filter((toast) => !urgent(toast))}</div>
      <div role="alert" aria-atomic="false">{toasts.filter(urgent)}</div>
    </section>
  );
}
