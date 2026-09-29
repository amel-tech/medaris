import React from 'react';

let seq = 0;
const useUid = React.useId || (() => React.useState(() => `g${++seq}`)[0]);

/* A <fieldset> of native radios under a visible <legend>. It draws the Radio
   markup itself (.mds-choice), since a component file never uses another one.
   Controlled with `value`, uncontrolled with `defaultValue`. */
export function RadioGroup({
  legend, name, options = [], value, defaultValue, onChange, bordered = false, className = '',
}) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const change = (e) => onChange && onChange(e.target.value, e);
  const choice = ['mds-choice', bordered && 'mds-choice--bordered'].filter(Boolean).join(' ');
  return (
    <fieldset className={['mds-choice-group', className].filter(Boolean).join(' ')}>
      <legend className="mds-label">{legend}</legend>
      {options.map((o, i) => {
        const labelId = `mds-choice-${uid}-${i}-l`;
        const descId = o.description ? `mds-choice-${uid}-${i}-d` : undefined;
        const state = value !== undefined
          ? { checked: value === o.value }
          : { defaultChecked: defaultValue === o.value };
        return (
          <label key={o.value} className={choice}>
            <input
              type="radio" className="mds-radio" name={name} value={o.value}
              disabled={o.disabled} aria-labelledby={labelId} aria-describedby={descId} onChange={change} {...state}
            />
            {o.icon && <span className="mds-choice__icon" aria-hidden="true">{o.icon}</span>}
            <span className="mds-choice__text">
              <span className="mds-choice__label" id={labelId}>{o.label}</span>
              {o.description && <span className="mds-choice__desc" id={descId}>{o.description}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
