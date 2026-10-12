import type {
  CourseDetailResponse,
  LessonResponse,
} from "@medaris/services/tedrisat";
import { isSameCalendarDay, showsDifferentTime } from "@medaris/utils";

/**
 * What the session page (MDRS-158) derives from the course and the session.
 * Pure and clock-free (`now` is always a parameter) so a spec can pin it.
 */

/** How long a live session with no length counts as running; tedrisat's rule. */
export const DEFAULT_SESSION_MINUTES = 60;

/** The state `SessionJoin` and the lesson rows draw. */
export type SessionState = "upcoming" | "live" | "ended" | "cancelled";

interface Timed {
  cancelledAt?: Date | null;
  startsAt?: Date | null;
  durationMinutes?: number | null;
}

/**
 * Where a session stands at `now`, the same rule as tedrisat's
 * `sessionStatus`. The page recomputes it every half minute in the browser,
 * so a card that was "upcoming" at render becomes "live" without a reload.
 */
export const sessionStateOf = (session: Timed, now: Date): SessionState => {
  if (session.cancelledAt) return "cancelled";
  if (!session.startsAt) return "upcoming";
  const start = session.startsAt.getTime();
  const end =
    start + (session.durationMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000;
  if (now.getTime() >= end) return "ended";
  if (now.getTime() >= start) return "live";
  return "upcoming";
};

const stateOfLesson = (lesson: LessonResponse, now: Date): SessionState =>
  sessionStateOf(
    {
      cancelledAt: lesson.cancelledAt,
      startsAt: lesson.scheduledAt,
      durationMinutes: lesson.durationMinutes,
    },
    now
  );

/** The calendar day of an instant in a zone, as `YYYY-MM-DD`. */
export const dayInZone = (at: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

const isLive = (lesson: LessonResponse) => lesson.type === "LIVE";

/**
 * A celse's place among its week's celses, for the eyebrow of the detail
 * page ("Hafta 5 · 2. celse", MDRS-289). A cancelled celse keeps its place,
 * so a cancellation renumbers nothing. Null when the course does not list it.
 */
export const celseNumberOf = (
  course: Pick<CourseDetailResponse, "weeks">,
  sessionId: string
): number | null => {
  for (const week of course.weeks) {
    const at = week.lessons.filter(isLive).findIndex((l) => l.id === sessionId);
    if (at >= 0) return at + 1;
  }
  return null;
};

export interface CurriculumRow {
  lesson: LessonResponse;
  weekNumber: number;
  state: SessionState;
  /** The celse the page shows. */
  viewing: boolean;
}

/**
 * The Müfredat combobox at the foot of the celse detail page (MDRS-289):
 * every celse of the course in programme order, each with where it stands at
 * `now`, the one on the page marked; the list scrolls through all of them.
 * `weeks` is how many weeks the programme runs, for "Hafta 5 / 12": the
 * highest week number, or the count of weeks when that is higher.
 */
export const curriculumOf = (
  course: Pick<CourseDetailResponse, "weeks">,
  viewingId: string,
  now: Date
): { rows: CurriculumRow[]; weeks: number } => ({
  rows: course.weeks.flatMap((week) =>
    week.lessons.filter(isLive).map(
      (lesson): CurriculumRow => ({
        lesson,
        weekNumber: week.weekNumber,
        state: stateOfLesson(lesson, now),
        viewing: lesson.id === viewingId,
      })
    )
  ),
  weeks: Math.max(
    course.weeks.length,
    ...course.weeks.map((week) => week.weekNumber)
  ),
});

/** Case and marks folded away, so "mehmuz" finds "Mehmûz" and "isaguci" "İsâgûcî". */
const fold = (text: string, locale: string): string =>
  text
    .toLocaleLowerCase(locale)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i");

/**
 * Whether a Müfredat row answers the search field ("Hafta ya da başlık ara",
 * MDRS-289). Every word of the query must be found: a number is the week
 * ("5" finds Hafta 5, not Hafta 15) or a number standing alone in the title;
 * any other word is looked for in the week's name and the title, without
 * case or marks. An empty query keeps every row.
 */
export const curriculumMatches = (
  row: { weekNumber: number; week: string; title: string },
  query: string,
  locale: string
): boolean => {
  const title = fold(row.title, locale);
  const named = `${fold(row.week, locale)} ${title}`;
  return fold(query, locale)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) =>
      /^\d+$/.test(word)
        ? Number(word) === row.weekNumber ||
          new RegExp(`(^|\\D)${word}(\\D|$)`).test(title)
        : named.includes(word)
    );
};

/** Minutes past midnight of an instant on a zone's clock. */
const clockMinutes = (at: Date, timeZone: string): number => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(at)
    .split(":")
    .map(Number) as [number, number];
  return h * 60 + m;
};

const AGENDA_CLOCK = /^(\d{1,2})[:.](\d{2})$/;

/**
 * The agenda step whose time has come while the celse is live, marked
 * "şimdi" (MDRS-289); null before the start, after the end, and when no
 * step's time can be read. A step's "21:25" is on the course's clock, read
 * against the start's, so an agenda that passes midnight (23:40, 00:05)
 * still counts on.
 */
export const currentAgendaStep = (
  agenda: readonly { time: string }[],
  celse: {
    startsAt?: Date | null;
    durationMinutes?: number | null;
    timeZone: string;
  },
  now: Date
): number | null => {
  const { startsAt } = celse;
  if (!startsAt || sessionStateOf(celse, now) !== "live") return null;
  const start = clockMinutes(startsAt, celse.timeZone);
  const elapsed = (now.getTime() - startsAt.getTime()) / 60_000;
  let current: number | null = null;
  let reached = Number.NEGATIVE_INFINITY;
  agenda.forEach((step, i) => {
    const clock = AGENDA_CLOCK.exec(step.time.trim());
    if (!clock) return;
    // The offset from the start, within half a day either way.
    let offset = (Number(clock[1]) * 60 + Number(clock[2]) - start) % 1440;
    if (offset > 720) offset -= 1440;
    if (offset <= -720) offset += 1440;
    if (offset <= elapsed && offset >= reached) {
      reached = offset;
      current = i;
    }
  });
  return current;
};

/**
 * How long until `at`, in the two largest units: "2 gün 4 saat", "1 saat 5
 * dakika", "45 dakika" (MDRS-289, "Başlamasına …"). Never less than a minute.
 */
export const timeUntil = (at: Date, now: Date, locale: string): string => {
  const total = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const unit = (n: number, name: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "long",
    }).format(n);
  const parts =
    days > 0
      ? [unit(days, "day"), hours > 0 ? unit(hours, "hour") : null]
      : hours > 0
        ? [unit(hours, "hour"), minutes > 0 ? unit(minutes, "minute") : null]
        : [unit(minutes, "minute")];
  return new Intl.ListFormat(locale, { type: "unit", style: "narrow" }).format(
    parts.filter((part): part is string => part !== null)
  );
};

export interface CelseTimeWords {
  /** "3 Ekim Cumartesi" */
  day: string;
  /** "Cumartesi" */
  weekday: string;
  /** "3 Ekim" */
  date: string;
  /** "23:20–00:20", the start alone without a length */
  clock: string;
  /** the viewer's start when their clock shows another time ("Paz 05:20"); else null */
  local: string | null;
}

/**
 * A celse's time in words for the detail page's header and its date block
 * (MDRS-289), on the course's clock, where the course team set it. The
 * viewer's own start comes beside it when their clock shows another time,
 * with the weekday when it falls on another day, as the join card does.
 */
export const celseTimeWords = (
  startsAt: Date,
  durationMinutes: number | null | undefined,
  {
    locale,
    courseTimeZone,
    viewerTimeZone,
  }: { locale: string; courseTimeZone: string; viewerTimeZone: string }
): CelseTimeWords => {
  const format = (
    at: Date,
    timeZone: string,
    options: Intl.DateTimeFormatOptions
  ) => new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(at);
  const hm = { hour: "2-digit", minute: "2-digit" } as const;
  const start = format(startsAt, courseTimeZone, hm);
  const clock =
    durationMinutes != null
      ? `${start}–${format(
          new Date(startsAt.getTime() + durationMinutes * 60_000),
          courseTimeZone,
          hm
        )}`
      : start;
  return {
    day: format(startsAt, courseTimeZone, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    weekday: format(startsAt, courseTimeZone, { weekday: "long" }),
    date: format(startsAt, courseTimeZone, { day: "numeric", month: "long" }),
    clock,
    local: showsDifferentTime(startsAt, courseTimeZone, viewerTimeZone)
      ? format(
          startsAt,
          viewerTimeZone,
          isSameCalendarDay(startsAt, courseTimeZone, viewerTimeZone)
            ? hm
            : { weekday: "short", ...hm }
        )
      : null,
  };
};

/**
 * What the main card of the detail page draws (MDRS-289). A cancelled celse
 * says so whatever else it has; a locked one offers the way in; then what
 * the watch page plays, as the API said at render time (`watch`) or, for a
 * celse with a stream whose page was drawn before the start, from the start
 * on (MDRS-285); else the date and how the celse is attended.
 */
export type ActionCase =
  | "cancelled"
  | "locked"
  | "recording"
  | "stream"
  | "date";

export const actionCaseOf = ({
  state,
  locked,
  watch,
  hasLiveStream,
}: {
  state: SessionState;
  locked: boolean;
  watch: "recording" | "stream" | null;
  hasLiveStream: boolean;
}): ActionCase => {
  if (state === "cancelled") return "cancelled";
  if (locked) return "locked";
  return watch ?? (hasLiveStream && state === "live" ? "stream" : "date");
};

/**
 * How a celse with nothing to watch now is attended, as MDRS-283 words it: a
 * meeting link stays the way in whatever else the celse has; without one,
 * the in-person mark and the stream say how.
 */
export type Attendance =
  | "link"
  | "inPersonStream"
  | "stream"
  | "inPerson"
  | "none";

export const attendanceOf = ({
  hasLink,
  inPerson,
  hasLiveStream,
}: {
  hasLink: boolean;
  inPerson: boolean;
  hasLiveStream: boolean;
}): Attendance => {
  if (hasLink) return "link";
  if (inPerson && hasLiveStream) return "inPersonStream";
  if (hasLiveStream) return "stream";
  return inPerson ? "inPerson" : "none";
};

/** The place a course's clock is kept in, for "Saatler İstanbul saatiyle". */
export const zoneLabel = (timeZone: string, locale: string): string => {
  if (timeZone === "Europe/Istanbul") {
    if (locale === "tr") return "İstanbul";
    if (locale === "ar") return "إسطنبول";
    return "Istanbul";
  }
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
};

const ARABIC_RUN = /[؀-ۿݐ-ݿࢠ-ࣿ]+(?:\s+[؀-ۿݐ-ݿࢠ-ࣿ]+)*/g;

/**
 * A line split into plain and Arabic runs, so the page can set each Arabic
 * run in `lang="ar" dir="rtl"` inside a Turkish sentence ("قرأ fiilinin…").
 */
export const splitArabic = (
  text: string
): { text: string; arabic: boolean }[] => {
  const parts: { text: string; arabic: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(ARABIC_RUN)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), arabic: false });
    parts.push({ text: match[0], arabic: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), arabic: false });
  return parts;
};
