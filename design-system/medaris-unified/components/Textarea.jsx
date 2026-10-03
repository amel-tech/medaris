import React from 'react';

/* Wraps .mds-input.mds-textarea: the input box, grown to rows and resizable in the
   block direction. Native attributes, aria-* included, go to the <textarea>. */
export function Textarea({ error = false, className = '', ...rest }) {
  const cls = ['mds-input', 'mds-textarea', className].filter(Boolean).join(' ');
  return <textarea className={cls} aria-invalid={error || undefined} {...rest} />;
}
