import React from 'react';

// The label id must be unique per instance. React.useId where it exists; a
// module counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `p${++seq}`)[0]);

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound((el && el.lang) || null);
  }, []);
  return locale || found || 'tr-TR';
}

function formatPercent(n, locale) {
  const options = { style: 'percent', maximumFractionDigits: 0 };
  try { return new Intl.NumberFormat(locale, options).format(n); } catch (e) { return new Intl.NumberFormat('tr-TR', options).format(n); }
}

/* A determinate .mds-progress bar with its visible name. The value is a data variable the class
   layer reads (--mds-progress); the percent is Intl in the page's locale: %72 in Turkish. */
export function Progress({ value = 0, label, showValue = false, completeLabel = 'tamamlandı', locale, className = '', ...rest }) {
  const ref = React.useRef(null);
  const id = `mds-progress-${useUid()}`;
  const lang = usePageLocale(ref, locale);
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const done = pct === 100;
  const text = done ? `${formatPercent(1, lang)} ${completeLabel}` : formatPercent(pct / 100, lang);
  return (
    <div ref={ref} className={className || undefined} {...rest}>
      <div className="mds-progress__label">
        <span id={id}>{label}</span>
        {showValue && (
          <span className="mds-progress__value" aria-hidden="true">
            {done && <span className="mds-progress__check" />}
            {text}
          </span>
        )}
      </div>
      <div className="mds-progress" role="progressbar" aria-labelledby={id} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={text}>
        <div className="mds-progress__bar" style={{ '--mds-progress': `${pct}%` }} />
      </div>
    </div>
  );
}
