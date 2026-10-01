import React from 'react';

/* A native <select> in the .mds-input box; .mds-select draws the chevron. Native
   attributes, aria-* included, go to the <select>; className goes to the wrapper.
   Until something is chosen it shows `placeholder` as a hidden, disabled first
   option, so an unanswered select never looks answered. */
export function Select({
  options = [], placeholder = 'Seçin', size = 'regular', error = false,
  value, defaultValue, className = '', ...rest
}) {
  const cls = ['mds-input', size !== 'regular' && `mds-input--${size}`].filter(Boolean).join(' ');
  const start = placeholder && value === undefined && defaultValue === undefined ? '' : defaultValue;
  return (
    <span className={['mds-select', className].filter(Boolean).join(' ')}>
      <select className={cls} value={value} defaultValue={start} aria-invalid={error || undefined} {...rest}>
        {placeholder && <option value="" disabled hidden>{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
        })}
      </select>
    </span>
  );
}
