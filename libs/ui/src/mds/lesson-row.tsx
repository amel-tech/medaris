import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import {
  formatDate,
  formatNumber,
  joinRun,
  usePageLocale,
  zoneName,
} from "./locale";

export type LessonType = "video" | "document" | "live" | "quiz";

// Labels from content/status-map.json (lessonType).
const typeLabels: Record<LessonType, string> = {
  video: "Video ders",
  document: "Doküman",
  live: "Canlı ders",
  quiz: "Sınav",
};

interface TimeOptions {
  timeZone?: string;
  courseTimeZone?: string;
  courseZoneName?: string;
  localTimeLabel: string;
  locale: string;
}

// "3 Eki Cmt 21:00", and when the course's zone differs from the viewer's
// "3 Eki Cmt 21:00 İstanbul" + "20:00 senin saatinle" (MDS-NUM-01).
function sessionTimes(startsAt: string, o: TimeOptions): ReactNode[] {
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return [];
  const day: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
  };
  const clock: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  const course = o.courseTimeZone ?? o.timeZone;
  const first = formatDate(o.locale, at, course, { ...day, ...clock });
  if (
    !o.courseTimeZone ||
    formatDate(o.locale, at, o.timeZone, { ...day, ...clock }) === first
  ) {
    return [
      <time key="at" dateTime={startsAt}>
        {first}
      </time>,
    ];
  }
  const sameDay =
    formatDate(o.locale, at, o.timeZone, day) ===
    formatDate(o.locale, at, course, day);
  const local = formatDate(
    o.locale,
    at,
    o.timeZone,
    sameDay ? clock : { weekday: "short", ...clock }
  );
  const city = zoneName(course ?? "", o.courseZoneName);
  return [
    <time key="at" dateTime={startsAt}>
      {first} {city}
    </time>,
    <span key="local">
      {local} {o.localTimeLabel}
    </span>,
  ];
}

export interface LessonRowProps
  extends Omit<HTMLAttributes<HTMLLIElement>, "title"> {
  title: ReactNode;
  type: LessonType;
  state?: "default" | "current" | "done";
  /** `locked` locks the body and the link, never the programme */
  access?: "open" | "locked";
  href?: string;
  typeLabel?: string;
  source?: string;
  durationMinutes?: number;
  /** ISO instant of a live session */
  startsAt?: string;
  timeZone?: string;
  courseTimeZone?: string;
  courseZoneName?: string;
  currentLabel?: string;
  doneLabel?: string;
  lockedLabel?: string;
  localTimeLabel?: string;
  minuteUnit?: string;
  locale?: string;
  trailing?: ReactNode;
}

/** One lesson of a week: an `<li>` for the `.mds-lesson-list` a WeekAccordion draws. */
export function LessonRow({
  title,
  type,
  state = "default",
  access = "open",
  href,
  typeLabel,
  source,
  durationMinutes,
  startsAt,
  timeZone,
  courseTimeZone,
  courseZoneName,
  currentLabel = "Sıradaki",
  doneLabel = ", tamamlandı",
  lockedLabel = "Kilitli",
  localTimeLabel = "senin saatinle",
  minuteUnit = "dk",
  locale: localeProp,
  trailing,
  className,
  ...rest
}: LessonRowProps) {
  const { ref, lang: locale } = usePageLocale<HTMLLIElement>(localeProp);
  const locked = access === "locked";
  const titleProps = {
    className: "mds-lesson-row__title",
    dir: "auto" as const,
    "aria-current": state === "current" ? ("step" as const) : undefined,
  };
  const name = (
    <>
      {title}
      {state === "done" ? (
        <span className="mds-visually-hidden">{doneLabel}</span>
      ) : null}
    </>
  );
  const meta: ReactNode[] = [];
  if (state === "current")
    meta.push(
      <span key="marker" className="mds-lesson-row__marker">
        {currentLabel}
      </span>
    );
  meta.push(<span key="type">{typeLabel ?? typeLabels[type]}</span>);
  if (source)
    meta.push(
      <bdi key="source" className="mds-lesson-row__source">
        {source}
      </bdi>
    );
  if (startsAt)
    meta.push(
      ...sessionTimes(startsAt, {
        timeZone,
        courseTimeZone,
        courseZoneName,
        localTimeLabel,
        locale,
      })
    );
  return (
    <li
      ref={ref}
      className={cx(
        "mds-lesson-row",
        `mds-lesson-row--${type}`,
        state === "done" && "is-done",
        locked && "is-locked",
        className
      )}
      {...rest}
    >
      <span className="mds-lesson-row__medallion" aria-hidden="true" />
      <div className="mds-lesson-row__main">
        {href && !locked ? (
          <a href={href} {...titleProps}>
            {name}
          </a>
        ) : (
          <span {...titleProps}>{name}</span>
        )}
        <p className="mds-lesson-row__meta">{joinRun(meta)}</p>
      </div>
      {trailing ? (
        <span className="mds-lesson-row__trailing">{trailing}</span>
      ) : null}
      {locked ? (
        <span
          className="mds-lesson-row__lock"
          role="img"
          aria-label={lockedLabel}
        />
      ) : null}
      {durationMinutes != null ? (
        <time
          className="mds-lesson-row__duration"
          dateTime={`PT${durationMinutes}M`}
        >
          {formatNumber(durationMinutes, locale)} {minuteUnit}
        </time>
      ) : null}
    </li>
  );
}
