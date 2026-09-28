import React from 'react';

let seq = 0;
const useUid = React.useId || (() => React.useState(() => `c${++seq}`)[0]);

/* A native checkbox inside its own <label class="mds-choice">, which is the 24px
   hit area. Native attributes, aria-* included, go to the <input>; className goes
   to the label. The input is named by the label span alone (aria-labelledby), since
   the wrapping <label> would add the description to its name; the description
   is wired with aria-describedby. */
export function Checkbox({ label, description, icon, bordered = false, className = '', ...rest }) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  const labelledBy = [rest['aria-labelledby'], labelId].filter(Boolean).join(' ');
  const describedBy = [rest['aria-describedby'], description && descId].filter(Boolean).join(' ') || undefined;
  const cls = ['mds-choice', bordered && 'mds-choice--bordered', className].filter(Boolean).join(' ');
  return (
    <label className={cls}>
      <input {...rest} type="checkbox" className="mds-check" aria-labelledby={labelledBy} aria-describedby={describedBy} />
      {icon && <span className="mds-choice__icon" aria-hidden="true">{icon}</span>}
      <span className="mds-choice__text">
        <span className="mds-choice__label" id={labelId}>{label}</span>
        {description && <span className="mds-choice__desc" id={descId}>{description}</span>}
      </span>
    </label>
  );
}
