import React from 'react';

// The sheet id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `a${++seq}`)[0]);

/* Wraps .mds-appbar and its nav sheet: the compact chrome below 768. The caller passes
   the Logo and the NavItems; the sheet is a native modal <dialog>, so Esc, focus
   containment and the backdrop come from the browser. */
export function AppBar({
  title, logo, menuLabel = 'Menü', navLabel = 'Ana menü', closeLabel = 'Kapat',
  actions, footer, children, className = '',
}) {
  const sheetId = `mds-sheet-${useUid().replace(/[^\w-]/g, '')}`;
  const menu = React.useRef(null);
  const sheet = React.useRef(null);
  const [open, setOpen] = React.useState(false);

  const show = () => {
    if (!sheet.current || !sheet.current.showModal) return;
    sheet.current.showModal();
    setOpen(true);
  };
  const hide = () => sheet.current && sheet.current.open && sheet.current.close();

  // Once the bar is not drawn (768 and up), an open sheet closes with it.
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      if (menu.current && menu.current.getClientRects().length === 0) hide();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A click on the backdrop lands on the <dialog> itself; a followed link closes it too.
  const onSheetClick = (e) => {
    if (e.target === sheet.current || (e.target.closest && e.target.closest('a[href]'))) hide();
  };
  // Every way out (Esc, the close button, the backdrop, a link) ends here.
  const onClose = () => {
    setOpen(false);
    if (menu.current) menu.current.focus();
  };

  return (
    <>
      <header className={['mds-appbar', className].filter(Boolean).join(' ')}>
        <button
          ref={menu}
          type="button"
          className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost mds-appbar__menu"
          aria-label={menuLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={show}
        >
          <span className="mds-appbar__menu-icon" aria-hidden="true" />
        </button>
        {logo}
        <p className="mds-appbar__title" dir="auto">{title}</p>
        {actions && <div className="mds-appbar__actions">{actions}</div>}
      </header>
      <dialog ref={sheet} id={sheetId} className="mds-sheet" aria-label={navLabel} onClose={onClose} onClick={onSheetClick}>
        <div className="mds-sheet__body">
          <div className="mds-sheet__head">
            {logo}
            <button type="button" className="mds-btn mds-icon-btn mds-btn--regular mds-btn--ghost mds-sheet__close" aria-label={closeLabel} onClick={hide}>
              <span className="mds-sheet__close-icon" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label={navLabel}>{children}</nav>
          {footer && <div className="mds-sheet__foot">{footer}</div>}
        </div>
      </dialog>
    </>
  );
}
