import React from 'react';

// The ids must be unique per instance. React.useId where it exists; a module
// counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `w${++seq}`)[0]);

// The page's locale (MDS-NUM-01): the locale prop, else the nearest lang once mounted, else tr-TR.
function usePageLocale(ref, locale) {
  const [found, setFound] = React.useState(null);
  React.useEffect(() => {
    const el = ref.current && ref.current.closest('[lang]');
    setFound((el && el.lang) || null);
  }, []);
  return locale || found || 'tr-TR';
}

// A meta run: each part but the last ends on its separator, so a wrapped line ends on the dot and
// never starts with it.
function joinRun(parts) {
  return parts.map((p, i) => (i < parts.length - 1 ? <span key={`run${i}`}>{p}<span className="mds-sep" aria-hidden="true">·</span></span> : p));
}

// A date-only value ("2026-10-17") is that calendar day wherever the viewer is.
function openDate(iso, locale) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', ...(dateOnly && { timeZone: 'UTC' }) }).format(at);
}

export function WeekAccordion({
  week,
  title,
  state = 'default',
  access = 'open',
  opensOn,
  summary,
  meta,
  open,
  defaultOpen = state === 'active',
  onToggle,
  headingLevel = 3,
  region = false,
  weekLabel = 'Hafta {week}',
  activeLabel = 'Devam ediyor',
  doneLabel = 'Tamamlandı',
  lockedLabel = ', kilitli',
  opensOnLabel = '{date} tarihinde açılır',
  emptyLabel = 'Bu hafta için henüz ders eklenmedi.',
  locale: localeProp,
  children,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const locale = usePageLocale(ref, localeProp);
  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const uid = useUid().replace(/[^\w-]/g, '');
  const buttonId = `mds-week-${uid}-b`;
  const panelId = `mds-week-${uid}-p`;
  const locked = access === 'locked';
  // locked wins: a viewer who may not open the lessons has no progress in them
  const shown = locked ? 'locked' : state;
  const cls = ['mds-week', shown !== 'default' && `is-${shown}`, className].filter(Boolean).join(' ');
  const Heading = `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 3}`;
  const n = new Intl.NumberFormat(locale).format(week);

  const toggle = () => {
    if (open === undefined) setOwn(!isOpen);
    if (onToggle) onToggle(!isOpen);
  };

  const metaItems = [];
  if (opensOn) {
    const [before, after = ''] = opensOnLabel.split('{date}');
    metaItems.push(<span key="opens">{before}<time dateTime={opensOn}>{openDate(opensOn, locale)}</time>{after}</span>);
  }
  if (meta) metaItems.push(<span key="meta">{meta}</span>);
  const rows = React.Children.toArray(children);

  return (
    <div ref={ref} className={cls} {...rest}>
      <Heading className="mds-week__heading">
        <button type="button" className="mds-week__trigger" id={buttonId} aria-expanded={isOpen} aria-controls={panelId} onClick={toggle}>
          <span className="mds-week__medallion" aria-hidden="true">{shown === 'done' || shown === 'locked' ? null : n}</span>
          <span className="mds-week__titles">
            <span className="mds-week__eyebrow">
              <span className="mds-eyebrow">{weekLabel.replace('{week}', n)}</span>
              {shown === 'active' && <span className="mds-badge mds-badge--brand">{activeLabel}</span>}
              {shown === 'done' && <span className="mds-badge mds-badge--success">{doneLabel}</span>}
            </span>
            <span className="mds-week__title" dir="auto">{title}</span>
            {locked && <span className="mds-visually-hidden">{lockedLabel}</span>}
          </span>
          {metaItems.length > 0 && (
            <span className="mds-week__meta">
              {joinRun(metaItems)}
            </span>
          )}
          <span className="mds-week__chevron" aria-hidden="true" />
        </button>
      </Heading>
      <div className="mds-week__panel" id={panelId} role={region ? 'region' : undefined} aria-labelledby={region ? buttonId : undefined} hidden={!isOpen}>
        {summary && <p className="mds-week__summary" dir="auto">{summary}</p>}
        {rows.length ? <ol className="mds-lesson-list">{rows}</ol> : <p className="mds-week__empty">{emptyLabel}</p>}
      </div>
    </div>
  );
}
