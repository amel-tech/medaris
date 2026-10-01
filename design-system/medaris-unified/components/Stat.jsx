import React from 'react';

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound((el && el.lang) || null);
  }, []);
  return locale || found || 'tr-TR';
}

function formatNumber(n, locale) {
  try { return new Intl.NumberFormat(locale).format(n); } catch (e) { return new Intl.NumberFormat('tr-TR').format(n); }
}

/* A number on a card. A tone colours the number only beside its cue, an icon or a delta label
   printed first: colour alone never says good or bad (MDS-COL-03), so without a cue it is neutral. */
export function Stat({ label, value, tone = 'neutral', cue, locale, children, className = '' }) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const shown = cue ? tone : 'neutral';
  const cls = ['mds-card', 'mds-stat', shown !== 'neutral' && `mds-stat--${shown}`, className]
    .filter(Boolean).join(' ');
  return (
    <div ref={ref} className={cls}>
      <span className="mds-caption">{label}</span>
      <span className="mds-stat__value">
        {cue && <span className="mds-stat__cue">{cue}</span>}
        {typeof value === 'number' ? formatNumber(value, lang) : value}
      </span>
      {children}
    </div>
  );
}
