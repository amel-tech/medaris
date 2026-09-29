import React from 'react';

// Ids must be unique per instance. React.useId where it exists; a module counter
// only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `s${++seq}`)[0]);

/* A page that is only a state. Without the app shell it is the page's <main>;
   inside the shell, which owns <main>, it is a <section>. */
export function SystemState({ kind, title, children, action, logo, shell = false, headingLevel = 1, className = '', ...rest }) {
  const id = `mds-system-state-${useUid().replace(/[^\w-]/g, '')}`;
  // restricted (B15) replaces the whole app: never inside the shell, and no way out of it.
  const restricted = kind === 'restricted';
  const Region = shell && !restricted ? 'section' : 'main';
  const Heading = `h${headingLevel}`;
  const cls = ['mds-system-state', Region === 'main' && 'mds-system-state--page', className].filter(Boolean).join(' ');
  return (
    <Region {...rest} className={cls} aria-labelledby={id}>
      {logo}
      <Heading className={headingLevel === 1 ? 'mds-h1' : 'mds-h2'} id={id}>{title}</Heading>
      <p className="mds-system-state__text">{children}</p>
      {!restricted && action}
    </Region>
  );
}
