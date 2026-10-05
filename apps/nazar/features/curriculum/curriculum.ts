import type {
  CourseDetailResponse,
  CreateLessonDto,
  ReplaceCourseDto,
} from "@medaris/services/tedrisat";
import { type CoverTone, TONE_HUE } from "@medaris/ui/mds/cover-pattern";
import { normalizeMeetingUrl } from "@medaris/utils";
import {
  addDays,
  fieldsOf,
  instantOf,
  linkProblem,
} from "../sessions/sessions";

/**
 * Müfredat as rules: what the weeks-and-sessions form holds, what stops
 * "Kaydet", what the whole-course save sends, and which sentence a refusal
 * gets. Pure on purpose, so the page and the form have nothing to decide.
 * nizam's curriculum runs the same rules
 * (`apps/nizam/features/courses/present.ts`, `payload.ts`); the parts the two
 * screens share are kept here. The dates and times of a session are written
 * in the zone the page is given (the viewer's, as on Celseler).
 */

export const curriculumHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/mufredat`;

// ---- the drafts -------------------------------------------------------------------

export interface LessonDraft {
  id?: string;
  title: string;
  type: string;
  /** "YYYY-MM-DD" in the page's zone; '' = unset */
  date: string;
  /** "HH:mm"; '' = unset */
  time: string;
  /** minutes as typed */
  duration: string;
  meetingUrl: string;
  kaynak: string;
  agenda: { time: string; title: string }[];
  isPreview: boolean;
  /** a cancelled session is shown as information and is saved as it is */
  cancelledAt: string | null;
  cancelReason: string | null;
  /** the stored instant, kept for a session whose date and time are not edited */
  scheduledAtIso: string | null;
  /** this session makes up for a cancelled one: it stays in its own week */
  makeup: boolean;
}

export interface WeekDraft {
  id?: string;
  weekNumber: number;
  title: string;
  summary: string;
  lessons: LessonDraft[];
}

/** The whole form: what "Kaydet" sends and what "Vazgeç" puts back. */
export interface CurriculumForm {
  title: string;
  description: string;
  tone: CoverTone;
  weeks: WeekDraft[];
}

type CourseLesson = CourseDetailResponse["weeks"][number]["lessons"][number];

export function lessonDraftOf(
  lesson: CourseLesson,
  timeZone: string,
  makeupIds: ReadonlySet<string> = new Set()
): LessonDraft {
  const at = lesson.scheduledAt ? new Date(lesson.scheduledAt) : null;
  const { date, time } = at ? fieldsOf(at, timeZone) : { date: "", time: "" };
  return {
    id: lesson.id,
    title: lesson.title,
    type: lesson.type,
    date,
    time,
    duration:
      lesson.durationMinutes != null ? String(lesson.durationMinutes) : "",
    meetingUrl: lesson.meetingUrl ?? "",
    kaynak: lesson.kaynak ?? "",
    agenda: (lesson.agenda ?? []).map((step) => ({
      time: step.time,
      title: step.title,
    })),
    isPreview: lesson.isPreview,
    cancelledAt: lesson.cancelledAt
      ? new Date(lesson.cancelledAt).toISOString()
      : null,
    cancelReason: lesson.cancelReason ?? null,
    scheduledAtIso: at ? at.toISOString() : null,
    makeup: makeupIds.has(lesson.id),
  };
}

export function weekDraftsOf(
  course: Pick<CourseDetailResponse, "weeks">,
  timeZone: string
): WeekDraft[] {
  const makeupIds = new Set(
    course.weeks.flatMap((week) =>
      week.lessons.flatMap((lesson) =>
        lesson.cancelledAt && lesson.replacementLessonId
          ? [lesson.replacementLessonId]
          : []
      )
    )
  );
  return course.weeks.map((week) => ({
    id: week.id,
    weekNumber: week.weekNumber,
    title: week.title,
    summary: week.summary ?? "",
    lessons: week.lessons.map((lesson) =>
      lessonDraftOf(lesson, timeZone, makeupIds)
    ),
  }));
}

export const emptyLesson = (date = ""): LessonDraft => ({
  title: "",
  type: "LIVE",
  date,
  time: "21:00",
  duration: "60",
  meetingUrl: "",
  kaynak: "",
  agenda: [],
  isPreview: false,
  cancelledAt: null,
  cancelReason: null,
  scheduledAtIso: null,
  makeup: false,
});

/** "Haftayı kopyala": the week again, 7 days later, with no links and nothing cancelled. */
export function copyWeek(week: WeekDraft, nextNumber: number): WeekDraft {
  return {
    weekNumber: nextNumber,
    title: week.title,
    summary: week.summary,
    lessons: week.lessons
      .filter((lesson) => !lesson.cancelledAt)
      .map((lesson) => ({
        ...lesson,
        id: undefined,
        date: lesson.date ? addDays(lesson.date, 7) : "",
        meetingUrl: "",
        isPreview: false,
        cancelledAt: null,
        cancelReason: null,
        scheduledAtIso: null,
        makeup: false,
      })),
  };
}

/** The number a week added at the end gets. */
export const nextWeekNumber = (weeks: readonly WeekDraft[]): number =>
  Math.max(0, ...weeks.map((week) => week.weekNumber)) + 1;

/** True when the form differs from the saved one (the "Kaydedilmemiş değişiklikler var" strip). */
export const curriculumDirty = (
  now: CurriculumForm,
  saved: CurriculumForm
): boolean => JSON.stringify(now) !== JSON.stringify(saved);

/** A week's date span and counts for its collapsed row. */
export function weekFacts(week: WeekDraft): {
  sessions: number;
  minutes: number;
  from: string | null;
  to: string | null;
} {
  const live = week.lessons.filter((lesson) => !lesson.cancelledAt);
  const dates = live
    .map((lesson) => lesson.date)
    .filter(Boolean)
    .sort();
  return {
    sessions: live.length,
    minutes: live.reduce(
      (sum, lesson) => sum + (Number(lesson.duration) || 0),
      0
    ),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

// ---- what stops "Kaydet" ----------------------------------------------------------

export type CurriculumProblem =
  | "title"
  | "weekTitle"
  | "lessonTitle"
  | "lessonDate"
  | "lessonTime"
  | "lessonDuration"
  | "link";

export interface CurriculumError {
  kind: CurriculumProblem;
  weekIndex?: number;
  lessonIndex?: number;
}

/**
 * The course name, each week's title, and for every live session its title,
 * date, time, length and https link. A cancelled session is information and
 * is not checked.
 */
export function curriculumErrors(
  title: string,
  weeks: readonly WeekDraft[]
): CurriculumError[] {
  const errors: CurriculumError[] = [];
  if (title.trim().length < 2) errors.push({ kind: "title" });
  weeks.forEach((week, weekIndex) => {
    if (!week.title.trim()) errors.push({ kind: "weekTitle", weekIndex });
    week.lessons.forEach((lesson, lessonIndex) => {
      if (lesson.cancelledAt) return;
      const at = { weekIndex, lessonIndex };
      if (!lesson.title.trim()) errors.push({ kind: "lessonTitle", ...at });
      if (lesson.type !== "LIVE") return;
      if (!lesson.date) errors.push({ kind: "lessonDate", ...at });
      if (!lesson.time) errors.push({ kind: "lessonTime", ...at });
      const minutes = Number(lesson.duration);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        errors.push({ kind: "lessonDuration", ...at });
      }
      if (linkProblem(lesson.meetingUrl)) errors.push({ kind: "link", ...at });
    });
  });
  return errors;
}

// ---- what "Kaydet" sends ----------------------------------------------------------

/**
 * The instant a session means. A session whose date and time still read as
 * the stored instant keeps that instant, so saving never moves a session by
 * the seconds or the daylight-saving fold a "YYYY-MM-DD HH:mm" cannot hold.
 */
function lessonInstant(draft: LessonDraft, timeZone: string): Date | null {
  const stored = draft.scheduledAtIso ? new Date(draft.scheduledAtIso) : null;
  if (stored) {
    const { date, time } = fieldsOf(stored, timeZone);
    if (date === draft.date && time === draft.time) return stored;
  }
  return instantOf(draft.date, draft.time, timeZone) ?? stored;
}

const lessonBody = (draft: LessonDraft, timeZone: string): CreateLessonDto => {
  const url = normalizeMeetingUrl(draft.meetingUrl);
  const at = draft.cancelledAt
    ? draft.scheduledAtIso
      ? new Date(draft.scheduledAtIso)
      : null
    : lessonInstant(draft, timeZone);
  return {
    ...(draft.id ? { id: draft.id } : {}),
    title: draft.title.trim(),
    type: draft.type as CreateLessonDto["type"],
    durationMinutes: draft.duration ? Number(draft.duration) : undefined,
    scheduledAt: at ?? undefined,
    // An emptied link or source line is sent as null: tedrisat clears the
    // column for null and leaves it alone for a missing key (MDRS-279).
    kaynak: (draft.kaynak.trim() || null) as unknown as string,
    meetingUrl: (url || null) as unknown as string,
    agenda: draft.agenda,
    isPreview: draft.isPreview,
  };
};

/**
 * The whole-course body of "Kaydet" (`PUT /courses/:id`): what the form holds,
 * plus everything it does not edit and a PUT would otherwise drop, the
 * müderris rows (unchanged, so a müderris may save) and the resources. A week
 * or a session left out of `weeks` is hidden by the PUT, never deleted.
 * `version` is the course version the page was read at.
 */
export function curriculumPayload(
  course: CourseDetailResponse,
  form: CurriculumForm,
  timeZone: string
): ReplaceCourseDto {
  return {
    version: course.version,
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    coverHue: TONE_HUE[form.tone],
    weeks: form.weeks.map((week) => ({
      ...(week.id ? { id: week.id } : {}),
      weekNumber: week.weekNumber,
      title: week.title.trim(),
      summary: week.summary.trim() || undefined,
      lessons: week.lessons.map((lesson) => lessonBody(lesson, timeZone)),
    })),
    muderris: course.muderris.map((m) => ({
      id: m.id,
      userId: m.userId ?? undefined,
      name: m.name,
      title: m.title ?? undefined,
      bio: m.bio ?? undefined,
      avatarHue: m.avatarHue,
    })),
    resources: course.resources.map((r) => ({
      id: r.id,
      name: r.name,
      meta: r.meta ?? undefined,
      type: r.type ?? undefined,
      url: r.url ?? undefined,
    })),
  };
}

// ---- dates ---------------------------------------------------------------------------

/** "12 Ekim" or "12 Ekim 2026" for a "YYYY-MM-DD" calendar day. */
export const dayLabel = (
  locale: string,
  day: string,
  withYear: boolean
): string =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

/** A session's heading date, "Cum 9 Eki", from its "YYYY-MM-DD" day. */
export const headingDay = (locale: string, day: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

/** A cancellation's moment on the page's clock: "9 Ekim 21:00". */
export const cancelledLabel = (
  locale: string,
  at: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(at));

// ---- what the API refuses ----------------------------------------------------------

/** The message key (from the catalogue's root) of a refused save, from the API's code. */
export function curriculumErrorKey(code: string): string {
  return code === "AUTHZ_FORBIDDEN"
    ? "Problems.actionForbidden"
    : "Problems.actionGeneric";
}

/** Whether the answer means the course changed since the page was read: nothing was written. */
export const curriculumConflict = (code: string): boolean =>
  code === "COURSE_VERSION_CONFLICT";
