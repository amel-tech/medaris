import React from 'react';

// Defaults copied from content/status-map.json (lessonType labels) and content/time-zones.json
// (cities); a zone missing here prints its IANA city. Change them there first.
const typeLabels = { video: 'Video ders', document: 'Doküman', live: 'Canlı ders', quiz: 'Sınav' };
const cities = {
  'Europe/Istanbul': 'İstanbul', 'Europe/Berlin': 'Berlin', 'Europe/Amsterdam': 'Amsterdam', 'Europe/Brussels': 'Brüksel',
  'Europe/Paris': 'Paris', 'Europe/Vienna': 'Viyana', 'Europe/London': 'Londra', 'America/New_York': 'New York',
};

function format(locale, at, timeZone, options) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(at);
  }
}

// "3 Eki Cmt 21:00", and when the course's zone differs from the viewer's
// "3 Eki Cmt 21:00 İstanbul" + "20:00 senin saatinle" (MDS-NUM-01).
function sessionTimes(startsAt, { timeZone, courseTimeZone, courseZoneName, localTimeLabel, locale }) {
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return [];
  const day = { weekday: 'short', day: 'numeric', month: 'short' };
  const clock = { hour: '2-digit', minute: '2-digit' };
  const course = courseTimeZone || timeZone;
  const first = format(locale, at, course, { ...day, ...clock });
  if (!courseTimeZone || format(locale, at, timeZone, { ...day, ...clock }) === first) {
    return [<time key="at" dateTime={startsAt}>{first}</time>];
  }
  const sameDay = format(locale, at, timeZone, day) === format(locale, at, course, day);
  const local = format(locale, at, timeZone, sameDay ? clock : { weekday: 'short', ...clock });
  const city = courseZoneName || cities[course] || course.split('/').pop().replace(/_/g, ' ');
  return [
    <time key="at" dateTime={startsAt}>{first} {city}</time>,
    <span key="local">{local} {localTimeLabel}</span>,
  ];
}

export function LessonRow({
  title,
  type,
  state = 'default',
  access = 'open',
  href,
  typeLabel,
  source,
  durationMinutes,
  startsAt,
  timeZone,
  courseTimeZone,
  courseZoneName,
  currentLabel = 'Sıradaki',
  doneLabel = ', tamamlandı',
  lockedLabel = 'Kilitli',
  localTimeLabel = 'senin saatinle',
  minuteUnit = 'dk',
  locale = 'tr-TR',
  trailing,
  className = '',
  ...rest
}) {
  const locked = access === 'locked';
  const cls = ['mds-lesson-row', `mds-lesson-row--${type}`, state === 'done' && 'is-done', locked && 'is-locked', className].filter(Boolean).join(' ');

  const titleProps = { className: 'mds-lesson-row__title', dir: 'auto', 'aria-current': state === 'current' ? 'step' : undefined };
  const name = <>{title}{state === 'done' && <span className="mds-visually-hidden">{doneLabel}</span>}</>;

  const meta = [];
  if (state === 'current') meta.push(<span key="marker" className="mds-lesson-row__marker">{currentLabel}</span>);
  meta.push(<span key="type">{typeLabel ?? typeLabels[type]}</span>);
  if (source) meta.push(<bdi key="source" className="mds-lesson-row__source">{source}</bdi>);
  if (startsAt) meta.push(...sessionTimes(startsAt, { timeZone, courseTimeZone, courseZoneName, localTimeLabel, locale }));

  return (
    <li className={cls} {...rest}>
      <span className="mds-lesson-row__medallion" aria-hidden="true" />
      <div className="mds-lesson-row__main">
        {href && !locked ? <a href={href} {...titleProps}>{name}</a> : <span {...titleProps}>{name}</span>}
        <p className="mds-lesson-row__meta">
          {meta.map((m, i) => (i ? <span key={`run${i}`}><span className="mds-sep" aria-hidden="true">·</span>{m}</span> : m))}
        </p>
      </div>
      {trailing && <span className="mds-lesson-row__trailing">{trailing}</span>}
      {locked && <span className="mds-lesson-row__lock" role="img" aria-label={lockedLabel} />}
      {durationMinutes != null && (
        <time className="mds-lesson-row__duration" dateTime={`PT${durationMinutes}M`}>
          {new Intl.NumberFormat(locale).format(durationMinutes)}{' '}{minuteUnit}
        </time>
      )}
    </li>
  );
}
