import React from 'react';

let seq = 0;
const useUid = React.useId || (() => React.useState(() => `s${++seq}`)[0]);

/* A native checkbox with role="switch", inside its own <label class="mds-choice">.
   The checked state is announced as on/off by the platform, so the component
   writes no words of its own. Native attributes go to the <input>; className goes
   to the label. */
export function Switch({ label, description, className = '', ...rest }) {
  const uid = useUid().replace(/[^\w-]/g, '');
  const labelId = `mds-choice-${uid}-l`;
  const descId = `mds-choice-${uid}-d`;
  const labelledBy = [rest['aria-labelledby'], labelId].filter(Boolean).join(' ');
  const describedBy = [rest['aria-describedby'], description && descId].filter(Boolean).join(' ') || undefined;
  return (
    <label className={['mds-choice', className].filter(Boolean).join(' ')}>
      <input {...rest} type="checkbox" role="switch" className="mds-switch" aria-labelledby={labelledBy} aria-describedby={describedBy} />
      <span className="mds-choice__text">
        <span className="mds-choice__label" id={labelId}>{label}</span>
        {description && <span className="mds-choice__desc" id={descId}>{description}</span>}
      </span>
    </label>
  );
}
