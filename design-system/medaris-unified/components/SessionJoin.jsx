import React from 'react';

// The ids must be unique per instance. React.useId where it exists; a module
// counter only for a React without it.
let seq = 0;
const useUid = React.useId || (() => React.useState(() => `j${++seq}`)[0]);

// Defaults copied from content/meeting-platforms.json (labels) and content/time-zones.json
// (cities); a zone missing here prints its IANA city. Change them there first.
const platformLabels = { 'google-meet': 'Google Meet', zoom: 'Zoom', jitsi: 'Jitsi Meet', unknown: 'Bilinmeyen platform' };
const cities = {
  'Europe/Istanbul': 'İstanbul', 'Europe/Berlin': 'Berlin', 'Europe/Amsterdam': 'Amsterdam', 'Europe/Brussels': 'Brüksel',
  'Europe/Paris': 'Paris', 'Europe/Vienna': 'Viyana', 'Europe/London': 'Londra', 'America/New_York': 'New York',
};
const MINUTE = 60000;
const HOUR = 60 * MINUTE;

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

function format(locale, at, timeZone, options) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(at);
  }
}

// The calendar day of an instant in a zone, as a day count, so "dün" and "yarın" follow the
// viewer's calendar rather than 24-hour spans.
function dayNumber(at, timeZone) {
  const [y, m, d] = format('en-CA', at, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / (24 * HOUR);
}

// "14 dakika sonra", "2 saat sonra", "Yarın", "3 gün sonra": a badge label, so its first letter is
// upper-cased in the page's locale (MDS-VOICE-02); Intl writes "yarın" and "şimdi".
function countdown(locale, at, now, timeZone) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const ms = at - now;
  let s;
  if (Math.abs(ms) < HOUR) s = rtf.format(Math.round(ms / MINUTE), 'minute');
  else if (Math.abs(ms) < 24 * HOUR) s = rtf.format(Math.round(ms / HOUR), 'hour');
  else s = rtf.format(dayNumber(at, timeZone) - dayNumber(now, timeZone), 'day');
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

export function SessionJoin({
  startsAt,
  durationMinutes,
  timeZone,
  courseTimeZone,
  courseZoneName,
  state = 'upcoming',
  title,
  headingLevel = 2,
  platform,
  platformLabel,
  host,
  href,
  linkUpdatedAt,
  recordingsHref,
  actions,
  access = 'enrolled',
  lockedReason = 'Bu oturumun bağlantısı kayıtlı talebelere açıktır.',
  action,
  now,
  joinWindowMinutes = 10,
  label = 'Canlı ders',
  liveLabel = 'Şu an canlı',
  endedLabel = 'Sona erdi',
  cancelledLabel = 'İptal edildi',
  cancelledText = 'Bu oturum iptal edildi.',
  noLinkText = 'Bağlantı henüz eklenmedi.',
  joinOpensText = 'Katılım, ders başlamadan {minutes} dakika önce açılır.',
  joinLabel = 'Derse katıl',
  newTabLabel = ' (yeni sekmede açılır)',
  revealLabel = 'Bağlantıyı göster',
  linkUpdatedText = 'Bağlantı {when} güncellendi.',
  recordingsLabel = 'Ders kayıtlarına git',
  localTimeLabel = 'senin saatinle',
  minuteUnit = 'dk',
  locale: localeProp,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  const locale = usePageLocale(ref, localeProp);
  const eyebrowId = `mds-join-${useUid().replace(/[^\w-]/g, '')}`;
  const headingId = `${eyebrowId}-h`;
  const atId = `${eyebrowId}-at`;
  const Heading = `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 2}`;
  // Without a fixed `now`, re-render every 30 s: the countdown and the join window move.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (now) return undefined;
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, [now]);

  const at = new Date(startsAt);
  const valid = !Number.isNaN(at.getTime());
  // Named by the title, or else the eyebrow, and the start: two cards on one page are two distinct regions.
  const labelledBy = [title ? headingId : eyebrowId, valid && atId].filter(Boolean).join(' ');
  const nowAt = now ? new Date(now) : new Date();
  const locked = access === 'locked';

  // ------------------------------------------------ time, in both zones when they differ
  const day = { weekday: 'long', day: 'numeric', month: 'long' };
  const clock = { hour: '2-digit', minute: '2-digit' };
  const course = courseTimeZone || timeZone;
  const times = [];
  if (valid) {
    const first = format(locale, at, course, { ...day, ...clock });
    if (!courseTimeZone || format(locale, at, timeZone, { ...day, ...clock }) === first) {
      times.push(<time key="at" id={atId} dateTime={startsAt}>{first}</time>);
    } else {
      const sameDay = format(locale, at, timeZone, day) === format(locale, at, course, day);
      const city = courseZoneName || cities[course] || course.split('/').pop().replace(/_/g, ' ');
      times.push(<time key="at" id={atId} dateTime={startsAt}>{first} {city}</time>);
      times.push(<span key="local" className="mds-join__zone">{format(locale, at, timeZone, sameDay ? clock : { weekday: 'short', ...clock })} {localTimeLabel}</span>);
    }
  }
  if (durationMinutes != null) {
    times.push(
      <time key="dur" className="mds-join__zone" dateTime={`PT${durationMinutes}M`}>
        {new Intl.NumberFormat(locale).format(durationMinutes)}{' '}{minuteUnit}
      </time>
    );
  }

  // ------------------------------------------------ the state badge (content/status-map.json session)
  let badge;
  if (state === 'live') badge = <span className="mds-badge mds-badge--live"><span className="mds-badge__dot" aria-hidden="true" />{liveLabel}</span>;
  else if (state === 'ended') badge = <span className="mds-badge mds-badge--ghost">{endedLabel}</span>;
  else if (state === 'cancelled') badge = <span className="mds-badge mds-badge--outline">{cancelledLabel}</span>;
  else if (valid) badge = <span className="mds-badge mds-badge--secondary"><time dateTime={startsAt}>{countdown(locale, at, nowAt, timeZone)}</time></span>;

  // ------------------------------------------------ what stands where the join button goes
  const status = (text, extra) => <p className={['mds-join__status', extra].filter(Boolean).join(' ')}>{text}</p>;
  const open = state === 'upcoming' || state === 'live';
  const windowOpen = state === 'live' || !valid || at - nowAt <= joinWindowMinutes * MINUTE;
  // An unknown host prints "Bilinmeyen platform" and the host (MDS-DOM-03).
  const known = platform === 'unknown' ? undefined : platformLabels[platform];
  const chip = !locked && open && platform && (
    <span className={`mds-platform-chip mds-platform-chip--${platform}`}>
      <span className="mds-platform-chip__dot" aria-hidden="true" />
      {platformLabel ?? known ?? platformLabels.unknown}
      {!known && host && <span className="mds-platform-chip__host" dir="ltr">{host}</span>}
    </span>
  );
  let body = null;
  if (state === 'cancelled') body = status(cancelledText);
  else if (locked) body = <div className="mds-join__action">{status(lockedReason, 'mds-join__status--locked')}{action}</div>;
  else if (state === 'ended') {
    body = recordingsHref ? <a className="mds-btn mds-btn--secondary mds-btn--large mds-btn--full" href={recordingsHref}>{recordingsLabel}</a> : null;
  } else if (!href) body = status(noLinkText);
  else if (!windowOpen) body = status(joinOpensText.replace('{minutes}', new Intl.NumberFormat(locale).format(joinWindowMinutes)));
  else {
    body = (
      <div className="mds-join__action">
        <a className="mds-btn mds-btn--primary mds-btn--large mds-btn--full mds-join__link" href={href} target="_blank" rel="noopener noreferrer">
          {joinLabel}<span className="mds-visually-hidden">{newTabLabel}</span>
        </a>
        <details className="mds-join__reveal">
          <summary>{revealLabel}</summary>
          <p className="mds-join__url" dir="ltr">{href}</p>
        </details>
      </div>
    );
  }

  // ------------------------------------------------ a link changed within the last 24 hours
  let notice = null;
  const updated = linkUpdatedAt ? new Date(linkUpdatedAt) : null;
  if (!locked && open && href && updated && nowAt - updated >= 0 && nowAt - updated < 24 * HOUR) {
    const when = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dayNumber(updated, timeZone) - dayNumber(nowAt, timeZone), 'day');
    notice = <p className="mds-join__notice">{linkUpdatedText.replace('{when}', when)}</p>;
  }

  const cls = ['mds-join', className].filter(Boolean).join(' ');
  return (
    <section ref={ref} className={cls} aria-labelledby={labelledBy} {...rest}>
      <header className="mds-join__header">
        <p className="mds-eyebrow" id={eyebrowId}>{label}</p>
        {badge}
        {actions && <div className="mds-join__actions">{actions}</div>}
      </header>
      {title && <Heading className="mds-join__title" id={headingId} dir="auto">{title}</Heading>}
      {times.length > 0 && (
        <p className="mds-join__time">
          {valid ? <>{times[0]}{joinRun(times.slice(1))}</> : joinRun(times)}
        </p>
      )}
      {chip}
      {body}
      {notice}
    </section>
  );
}
