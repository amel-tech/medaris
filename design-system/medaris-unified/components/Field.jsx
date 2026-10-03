import React from 'react';

// Ids must match on the server and the client: React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `f${++seq}`)[0]);

/* Label, one control, and a help or error line. The control keeps an id of its
   own if it has one; Field adds only what it knows, so a control's own
   aria-invalid or aria-describedby is never erased. */
export function Field({ label, help, error, required = false, children, className = '' }) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const control = React.isValidElement(children) ? children : null;
  const id = (control && control.props.id) || `mds-field-${uid}`;
  const noteId = `${id}-${error ? 'e' : 'h'}`;
  const note = error || help;
  const wired = { id };
  if (control) {
    const describedBy = [control.props['aria-describedby'], note && noteId].filter(Boolean).join(' ');
    if (describedBy) wired['aria-describedby'] = describedBy;
    if (error) wired['aria-invalid'] = true;
    if (required) {
      wired.required = true;
      wired['aria-required'] = true;
    }
  }
  return (
    <div className={['mds-field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="mds-label" htmlFor={control ? id : undefined}>
          {label}
          {required && <span className="mds-required" aria-hidden="true">*</span>}
        </label>
      )}
      {control ? React.cloneElement(control, wired) : children}
      {error
        ? <span className="mds-error" id={noteId}>{error}</span>
        : help ? <span className="mds-help" id={noteId}>{help}</span> : null}
    </div>
  );
}
