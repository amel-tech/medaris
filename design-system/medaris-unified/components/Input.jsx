import React from 'react';

/* Wraps .mds-input. Native attributes, aria-* included, go to the <input>. With
   `leading` or `trailing` the input sits in .mds-input-group; both adornments
   are decorative, so a unit is also written into the label ("Süre (dk)"). */
export function Input({
  size = 'regular', error = false, mono = false, leading, trailing, className = '', ...rest
}) {
  const cls = [
    'mds-input',
    size !== 'regular' && `mds-input--${size}`,
    mono && 'mds-input--mono',
    className,
  ].filter(Boolean).join(' ');
  const input = (
    <input className={cls} dir={mono ? 'ltr' : undefined} aria-invalid={error || undefined} {...rest} />
  );
  if (!leading && !trailing) return input;
  return (
    <span className="mds-input-group">
      {leading && <span className="mds-input-group__leading" aria-hidden="true">{leading}</span>}
      {input}
      {trailing && <span className="mds-input-group__trailing" aria-hidden="true">{trailing}</span>}
    </span>
  );
}
