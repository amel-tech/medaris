import React from 'react';

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound((el && el.lang) || null);
  }, [ref]);
  return locale || found || 'tr-TR';
}

function formatCount(n, locale) {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return new Intl.NumberFormat('tr-TR').format(n);
  }
}

/* Wraps .mds-tabs. mode="tabs" is the APG tabs pattern: one tab stop, the arrow keys
   move and select (mirrored in RTL), Home and End jump. The caller renders the panels.
   mode="links" is navigation between pages: a named <nav> of links, no tab roles. */
export function Tabs({ tabs = [], value, onChange, label, idBase, mode = 'tabs', locale, className = '' }) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const cls = ['mds-tabs', className].filter(Boolean).join(' ');
  const count = (t) => t.count != null && <span className="mds-tab__count">{formatCount(t.count, lang)}</span>;

  if (mode === 'links') {
    return (
      <nav ref={ref} className={cls} aria-label={label}>
        {tabs.map((t) => (
          <a key={t.value} className="mds-tab" href={t.href} aria-current={t.value === value ? 'page' : undefined}>
            {t.label}
            {count(t)}
          </a>
        ))}
      </nav>
    );
  }

  // With no tab selected, the first one takes the tab stop.
  const stop = tabs.some((t) => t.value === value) ? value : tabs[0] && tabs[0].value;
  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const list = [...e.currentTarget.querySelectorAll('[role="tab"]')];
    const at = list.indexOf(e.target);
    if (at < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + step + list.length) % list.length;
    e.preventDefault();
    list[next].focus();
    if (onChange) onChange(tabs[next].value);
  };
  return (
    <div ref={ref} className={cls} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.value}`}
          aria-controls={`${idBase}-panel-${t.value}`}
          aria-selected={t.value === value}
          tabIndex={t.value === stop ? 0 : -1}
          className="mds-tab"
          onClick={() => onChange && onChange(t.value)}
        >
          {t.label}
          {count(t)}
        </button>
      ))}
    </div>
  );
}
