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

/* Wraps .mds-nav-item. A link, never a button: routing is by URL, and aria-current
   marks the viewer's page. Inverse surface by default; inside .mds-nav--light on white. */
export function NavItem({ href, icon, active = false, count, countLabel, trailing, locale, children, className = '', ...rest }) {
  const ref = React.useRef(null);
  const lang = usePageLocale(ref, locale);
  const cls = ['mds-nav-item', className].filter(Boolean).join(' ');
  return (
    <a ref={ref} className={cls} href={href} aria-current={active ? 'page' : undefined} {...rest}>
      {icon}
      {children}
      {count > 0 && (
        <span className="mds-nav-item__count">
          {formatCount(count, lang)}
          {countLabel && <span className="mds-visually-hidden"> {countLabel}</span>}
        </span>
      )}
      {trailing && <span className="mds-nav-item__trailing">{trailing}</span>}
    </a>
  );
}
