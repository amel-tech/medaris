import React from 'react';

let seq = 0;
const useUid = React.useId || (() => React.useState(() => `r${++seq}`)[0]);

/* One native radio inside its own <label class="mds-choice">. A set of radios is a
   RadioGroup, which draws this markup itself. Native attributes go to the <input>;
   className goes to the label. */
export function Radio({ label, description, icon, bordered = false, className = '', ...rest }) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  const labelledBy = [rest['aria-labelledby'], labelId].filter(Boolean).join(' ');
  const describedBy = [rest['aria-describedby'], description && descId].filter(Boolean).join(' ') || undefined;
  const cls = ['mds-choice', bordered && 'mds-choice--bordered', className].filter(Boolean).join(' ');
  return (
    <label className={cls}>
      <input {...rest} type="radio" className="mds-radio" aria-labelledby={labelledBy} aria-describedby={describedBy} />
      {icon && <span className="mds-choice__icon" aria-hidden="true">{icon}</span>}
      <span className="mds-choice__text">
        <span className="mds-choice__label" id={labelId}>{label}</span>
        {description && <span className="mds-choice__desc" id={descId}>{description}</span>}
      </span>
    </label>
  );
}
