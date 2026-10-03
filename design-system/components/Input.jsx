import React from 'react';

export function Input({ size = 'regular', error = false, className = '', ...rest }) {
  const cls = [
    'mds-input',
    size !== 'regular' && `mds-input--${size}`,
    error && 'is-error',
    className,
  ].filter(Boolean).join(' ');
  return <input className={cls} aria-invalid={error || undefined} {...rest} />;
}

export function Textarea({ error = false, className = '', ...rest }) {
  const cls = ['mds-input', 'mds-textarea', error && 'is-error', className]
    .filter(Boolean).join(' ');
  return <textarea className={cls} aria-invalid={error || undefined} {...rest} />;
}

let uid = 0;
export function Field({ label, help, error, children, className = '' }) {
  const id = React.useMemo(() => `mds-f${++uid}`, []);
  const describedBy = error ? `${id}-e` : help ? `${id}-h` : undefined;
  return (
    <div className={['mds-field', className].filter(Boolean).join(' ')}>
      {label && <label className="mds-label" htmlFor={id}>{label}</label>}
      {React.isValidElement(children)
        ? React.cloneElement(children, { id, error: Boolean(error), 'aria-describedby': describedBy })
        : children}
      {error
        ? <span className="mds-error" id={`${id}-e`}>{error}</span>
        : help ? <span className="mds-help" id={`${id}-h`}>{help}</span> : null}
    </div>
  );
}
