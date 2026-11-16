"use client";

import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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

interface LessonNoteProps {
  note: string;
  moreLabel: string;
  lessLabel: string;
}

/**
 * A cancelled session's note: one line, cut with an ellipsis, and a button
 * that opens the whole note when the line is cut. `title` serves a mouse
 * alone; the button serves the keyboard and touch, and sits above the row's
 * full-row link so a tap opens the note rather than the session.
 */
function LessonNote({ note, moreLabel, lessLabel }: LessonNoteProps) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, note]);
  return (
    <div className="mds-lesson-row__note-wrap">
      <p
        ref={ref}
        id={id}
        className={cx("mds-lesson-row__note", open && "is-open")}
        dir="auto"
        title={open ? undefined : note}
      >
        {note}
      </p>
      {cut || open ? (
        <button
          type="button"
          className="mds-lesson-row__note-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  );
}

export interface LessonRowProps
  extends Omit<HTMLAttributes<HTMLLIElement>, "title"> {
  title: ReactNode;
  type: LessonType;
  state?: "default" | "current" | "done";
  /** The row of the page being read: `aria-current="page"`, tinted, marked */
  viewing?: boolean;
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
  viewingLabel?: string;
  doneLabel?: string;
  lockedLabel?: string;
  localTimeLabel?: string;
  minuteUnit?: string;
  locale?: string;
  trailing?: ReactNode;
  /**
   * One line under the meta, cut with an ellipsis: a cancelled session's note.
   * When the line is cut, a button opens the whole note.
   */
  note?: string;
  noteMoreLabel?: string;
  noteLessLabel?: string;
}

/** One lesson of a week: an `<li>` for the `.mds-lesson-list` a WeekAccordion draws. */
export function LessonRow({
  title,
  type,
  state = "default",
  viewing = false,
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
  viewingLabel = "Bu celse",
  doneLabel = ", tamamlandı",
  lockedLabel = "Kilitli",
  localTimeLabel = "senin saatinle",
  minuteUnit = "dk",
  locale: localeProp,
  trailing,
  note,
  noteMoreLabel = "Notun tamamı",
  noteLessLabel = "Notu kısalt",
  className,
  ...rest
}: LessonRowProps) {
  const { ref, lang: locale } = usePageLocale<HTMLLIElement>(localeProp);
  const locked = access === "locked";
  const titleProps = {
    className: "mds-lesson-row__title",
    dir: "auto" as const,
    "aria-current": viewing
      ? ("page" as const)
      : state === "current"
        ? ("step" as const)
        : undefined,
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
  if (viewing)
    meta.push(
      <span key="viewing" className="mds-lesson-row__marker">
        {viewingLabel}
      </span>
    );
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
        viewing && "is-viewing",
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
        {note ? (
          <LessonNote
            note={note}
            moreLabel={noteMoreLabel}
            lessLabel={noteLessLabel}
          />
        ) : null}
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
