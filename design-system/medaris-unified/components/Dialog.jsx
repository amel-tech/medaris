import React from 'react';

// Ids must be unique per instance. React.useId where it exists; a module counter
// only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `d${++seq}`)[0]);

// What takes focus when the dialog opens: the first footer button ("Vazgeç") in a
// confirmation, the first field in a form, the reading body of a non-form lg.
// Otherwise the browser's choice stands: the first header action, else the close button.
function initialFocus(dialog, kind, form, reading) {
  if (kind === 'alert') {
    return [...dialog.querySelectorAll('.mds-dialog__footer button')].find((b) => !b.closest('.mds-dialog__meta'));
  }
  if (form) return dialog.querySelector('.mds-dialog__body :is(input:not([type="hidden"]), select, textarea)');
  if (reading) return dialog.querySelector('.mds-dialog__body');
  return null;
}

/* Wraps a native <dialog> opened with showModal(). Every close — a footer button in
   a form, Esc, the close button, the backdrop, or `open` turning false — goes through
   the element's own close event; onClose hears all but the last. */
export function Dialog({
  open, onClose, title, eyebrow, kind = 'dialog', size = 'sm',
  headerActions, footer, footerMeta, form = false, dismissible, onCancel,
  closeLabel = 'Kapat', children, className = '', ...rest
}) {
  const ref = React.useRef(null);
  const opener = React.useRef(null);
  const quiet = React.useRef(false);
  const escaped = React.useRef(false);
  const pressedBackdrop = React.useRef(false);
  const uid = useUid().replace(/[^\w-]/g, '');
  const titleId = `mds-dialog-${uid}-t`;
  const bodyId = `mds-dialog-${uid}-b`;
  const reading = size === 'lg' && !form;
  const backdropCloses = dismissible ?? (kind === 'dialog' && !form);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      escaped.current = false;
      dialog.returnValue = '';
      dialog.showModal();
      initialFocus(dialog, kind, form, reading)?.focus();
    } else if (!open && dialog.open) {
      quiet.current = true;
      dialog.close();
    }
  }, [open]);

  // Unmounted while open: focus still goes back to the opener.
  React.useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) opener.current?.focus?.();
    };
  }, []);

  const handleClose = () => {
    const back = opener.current;
    if (back?.isConnected && typeof back.focus === 'function') back.focus();
    if (quiet.current) {
      quiet.current = false;
      return;
    }
    onClose?.(ref.current.returnValue || (escaped.current ? 'cancel' : undefined));
  };
  // Esc: the engine empties returnValue as it closes, so the cancel is remembered here.
  const handleCancel = (event) => {
    onCancel?.(event);
    escaped.current = !event.nativeEvent.defaultPrevented;
  };
  // A click on the <dialog> itself is a click on the backdrop; pressing inside the
  // panel and releasing outside it is not.
  const handlePointerDown = (event) => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };
  // A footer button with value="cancel" ("Vazgeç") is type="button", so it never
  // submits: Enter in a field submits the one action, never the cancel.
  const handleClick = (event) => {
    if (event.target.closest?.('.mds-dialog__footer button[value="cancel"]:not(:disabled)')) {
      ref.current.close('cancel');
      return;
    }
    if (backdropCloses && pressedBackdrop.current && event.target === event.currentTarget) ref.current.close('cancel');
  };

  const Panel = form ? 'form' : 'div';
  const cls = ['mds-dialog', size !== 'sm' && `mds-dialog--${size}`, className].filter(Boolean).join(' ');
  return (
    <dialog
      {...rest}
      ref={ref}
      className={cls}
      role={kind === 'alert' ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={reading || (form && kind !== 'alert') ? undefined : bodyId}
      onCancel={handleCancel}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <Panel className="mds-dialog__panel" method={form ? 'dialog' : undefined}>
        <div className="mds-dialog__header">
          <div className="mds-dialog__heading">
            {eyebrow && <p className="mds-eyebrow" dir="auto">{eyebrow}</p>}
            <h2 className="mds-dialog__title" id={titleId} dir="auto">{title}</h2>
          </div>
          <div className="mds-dialog__actions">
            {headerActions}
            <button
              type="button"
              className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost mds-dialog__close"
              aria-label={closeLabel}
              onClick={() => ref.current?.close('cancel')}
            />
          </div>
        </div>
        <div
          className="mds-dialog__body"
          id={bodyId}
          role={reading ? 'region' : undefined}
          aria-labelledby={reading ? titleId : undefined}
          tabIndex={reading ? 0 : undefined}
        >
          {children}
        </div>
        {(footer || footerMeta) && (
          <div className="mds-dialog__footer">
            {footerMeta && <p className="mds-dialog__meta">{footerMeta}</p>}
            {footer}
          </div>
        )}
      </Panel>
    </dialog>
  );
}
