import React from 'react';

/* A <fieldset> of chips: native radios (one choice) or, with `multiple`, native
   checkboxes (any number). Arrow keys, exclusivity, form submission and the
   checked state come from the inputs. Controlled with `value`, uncontrolled with
   `defaultValue`; with `multiple`, onChange receives every checked value in
   option order. */
export function ChoiceChips({
  legend, name, legendVisible = false, options = [], multiple = false,
  value, defaultValue, onChange, className = '',
}) {
  const has = (v, x) => (Array.isArray(v) ? v.includes(x) : v === x);
  const change = (e) => {
    if (!onChange) return;
    if (!multiple) return onChange(e.target.value, e);
    const inputs = e.currentTarget.closest('fieldset').querySelectorAll('input:checked');
    onChange(Array.from(inputs, (i) => i.value), e);
  };
  return (
    <fieldset className={['mds-chips', className].filter(Boolean).join(' ')}>
      <legend className={legendVisible ? 'mds-label' : 'mds-visually-hidden'}>{legend}</legend>
      {options.map((o) => {
        const state = value !== undefined
          ? { checked: has(value, o.value) }
          : { defaultChecked: has(defaultValue, o.value) };
        return (
          <label key={o.value} className="mds-chip">
            <input
              type={multiple ? 'checkbox' : 'radio'} name={name} value={o.value}
              disabled={o.disabled} onChange={change} {...state}
            />
            {o.icon}
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}
