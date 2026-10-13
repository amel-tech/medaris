import type {
  CourseDetailResponse,
  CourseResourceFileUploadResponse,
  CreateLessonDto,
  LessonResourceFileUploadResponse,
  ReplaceCourseDto,
} from "@medaris/services/tedrisat";
import { type CoverTone, TONE_HUE } from "@medaris/ui/mds/cover-pattern";
import { normalizeMeetingUrl, resourceUrlProblem } from "@medaris/utils";
import { type StoredFile, storedFileOf } from "../files/files";
import { hasAccess } from "../sessions/attendance";
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
  /**
   * How the session is attended besides its link (MDRS-283): its own
   * in-person mark (null follows the course) and whether a live stream is
   * set. Null when the read carried neither (a content-locked one), so the
   * session is not judged. Never sent: the save leaves both as stored.
   */
  attendance: {
    inPersonOverride: boolean | null;
    hasLiveStream: boolean;
  } | null;
  /** the session's own links, in order (MDRS-286) */
  resources: LessonResourceDraft[];
}

/**
 * A row of a session's own resources (MDRS-286): a name, an optional short
 * line and the address it opens, as a row of "Bağlı kaynaklar", or since
 * MDRS-287 a file uploaded to Medaris storage. tedrisat stores no link without
 * an address. Changing them is session work (`session.manage`), so a save
 * sends a session's list only when the form changed it (see
 * `curriculumPayload`).
 */
export interface LessonResourceDraft {
  id?: string;
  name: string;
  /** '' = none */
  meta: string;
  /** a link's address; '' for a file */
  url: string;
  /**
   * Whether an empty address stops "Kaydet": not for a row of a
   * content-locked read, which carries no address to show and is never sent,
   * nor for a file.
   */
  urlRequired: boolean;
  /**
   * The stored file of a file row (MDRS-287), which is renamed, moved and
   * removed like a link but never takes an address. Absent for a link, and
   * for any row of a content-locked read.
   */
  file?: StoredFile;
}

/** A session made on this page: it follows the course and has no stream yet. */
const FRESH_ATTENDANCE = { inPersonOverride: null, hasLiveStream: false };

export interface WeekDraft {
  id?: string;
  weekNumber: number;
  title: string;
  summary: string;
  lessons: LessonDraft[];
}

/**
 * A row of "Bağlı kaynaklar" (MDRS-279): a name, an optional short line
 * ("PDF · 88 sayfa") and the address it opens, or since MDRS-287 a file
 * uploaded to Medaris storage.
 */
export interface ResourceDraft {
  id?: string;
  name: string;
  /** '' = none */
  meta: string;
  /** a link's address; '' for a file */
  url: string;
  /** kept as stored; a row added here is a "link" */
  type: string | null;
  /**
   * Whether an empty address stops "Kaydet". Not for a row stored without
   * one (it predates the rule), a file, nor any row of a content-locked
   * read, which carries no address to show: tedrisat keeps what is stored.
   */
  urlRequired: boolean;
  /** the stored file of a file row (MDRS-287); absent for a link */
  file?: StoredFile;
}

/** The whole form: what "Kaydet" sends and what "Vazgeç" puts back. */
export interface CurriculumForm {
  title: string;
  description: string;
  tone: CoverTone;
  weeks: WeekDraft[];
  resources: ResourceDraft[];
}

type CourseLesson = CourseDetailResponse["weeks"][number]["lessons"][number];

type LessonResource = NonNullable<CourseLesson["resources"]>[number];

/**
 * One of a session's resources as read (MDRS-286). A stored link always has
 * an address, so a link read without one comes from a content-locked read; a
 * file (MDRS-287) has none, and its `file` only for a reader of the content.
 */
export const lessonResourceDraftOf = (
  resource: LessonResource
): LessonResourceDraft => ({
  id: resource.id,
  name: resource.name,
  meta: resource.meta ?? "",
  url: resource.url ?? "",
  urlRequired: Boolean(resource.url),
  ...(resource.file ? { file: storedFileOf(resource.file) } : {}),
});

/** A session's resources as read, in order. */
export const lessonResourceDraftsOf = (
  lesson: Pick<CourseLesson, "resources">
): LessonResourceDraft[] => (lesson.resources ?? []).map(lessonResourceDraftOf);

export const emptyLessonResource = (): LessonResourceDraft => ({
  name: "",
  meta: "",
  url: "",
  urlRequired: true,
});

/** The rows with the one at `from` moved to `to`; the same rows when either is out of range. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  const next = [...rows];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) {
    return next;
  }
  const [row] = next.splice(from, 1) as [T];
  next.splice(to, 0, row);
  return next;
}

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
    attendance:
      lesson.inPerson === undefined
        ? null
        : {
            inPersonOverride: lesson.inPersonOverride ?? null,
            hasLiveStream: lesson.hasLiveStream === true,
          },
    resources: lessonResourceDraftsOf(lesson),
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

type CourseResource = CourseDetailResponse["resources"][number];

/** One of the course's resources as read; `locked` for a content-locked read. */
export const resourceDraftOf = (
  resource: CourseResource,
  locked = false
): ResourceDraft => ({
  id: resource.id,
  name: resource.name,
  meta: resource.meta ?? "",
  url: resource.url ?? "",
  type: resource.type ?? null,
  urlRequired: !locked && Boolean(resource.url),
  ...(resource.file ? { file: storedFileOf(resource.file) } : {}),
});

export const resourceDraftsOf = (
  course: Pick<CourseDetailResponse, "resources" | "contentLocked">
): ResourceDraft[] =>
  course.resources.map((resource) =>
    resourceDraftOf(resource, course.contentLocked)
  );

export const emptyResource = (): ResourceDraft => ({
  name: "",
  meta: "",
  url: "",
  type: "link",
  urlRequired: true,
});

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
  attendance: FRESH_ATTENDANCE,
  resources: [],
});

/**
 * "Haftayı kopyala": the week again, 7 days later, with no links and nothing
 * cancelled. The copies are new sessions: they follow the course's in-person
 * mark and have no stream. Nor do they take the sessions' own resources
 * (MDRS-286): those are links too, and belong to the session they were added to.
 */
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
        attendance: FRESH_ATTENDANCE,
        resources: [],
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

// ---- how a session is attended ----------------------------------------------------

/**
 * Whether Müfredat flags a session as having no way in (MDRS-283): a live
 * one, not cancelled, still ahead, with no link typed, no live stream and not
 * held in person (its own mark, else the course's). The course menu's badge
 * counts the same sessions; one that is under way or over is not flagged.
 */
export function lessonWithoutAccess(
  draft: LessonDraft,
  courseInPerson: boolean,
  timeZone: string,
  now: Date
): boolean {
  if (draft.cancelledAt || draft.type !== "LIVE" || !draft.attendance) {
    return false;
  }
  const start = lessonInstant(draft, timeZone);
  if (!start || start <= now) return false;
  return !hasAccess({
    meeting: normalizeMeetingUrl(draft.meetingUrl),
    hasLiveStream: draft.attendance.hasLiveStream,
    inPerson: draft.attendance.inPersonOverride ?? courseInPerson,
  });
}

/**
 * The help under a session's link field. "Talebeler bağlantı olmadan celseye
 * katılamaz" is said only of a session that has no other way in: one held in
 * person or streamed needs no link (MDRS-283). A session whose attendance the
 * read did not carry gets the plain line.
 */
export function linkHelpKey(
  draft: LessonDraft,
  courseInPerson: boolean
):
  | "Curriculum.linkHelp"
  | "Curriculum.linkHelpFilled"
  | "Curriculum.linkHelpInPerson"
  | "Curriculum.linkHelpStream" {
  if (normalizeMeetingUrl(draft.meetingUrl) || !draft.attendance) {
    return "Curriculum.linkHelpFilled";
  }
  if (draft.attendance.inPersonOverride ?? courseInPerson) {
    return "Curriculum.linkHelpInPerson";
  }
  return draft.attendance.hasLiveStream
    ? "Curriculum.linkHelpStream"
    : "Curriculum.linkHelp";
}

// ---- what stops "Kaydet" ----------------------------------------------------------

export type CurriculumProblem =
  | "title"
  | "weekTitle"
  | "lessonTitle"
  | "lessonDate"
  | "lessonTime"
  | "lessonDuration"
  | "link"
  | "resourceName"
  | "resourceUrl"
  | "lessonResourceName"
  | "lessonResourceUrl";

export interface CurriculumError {
  kind: CurriculumProblem;
  weekIndex?: number;
  lessonIndex?: number;
  /** the course's resource, or with a session's indexes that session's own */
  resourceIndex?: number;
}

/**
 * The course name, each week's title, and for every live session its title,
 * date, time, length and https link. A cancelled session is information and
 * is not checked. Every resource, the course's or a session's own (MDRS-286),
 * needs a name, and a link an http(s) address, as tedrisat does (MDRS-279),
 * but for a row that has none to show (see `urlRequired`). A file
 * (MDRS-287) has no address to check.
 */
export function curriculumErrors(
  title: string,
  weeks: readonly WeekDraft[],
  resources: readonly ResourceDraft[] = []
): CurriculumError[] {
  const errors: CurriculumError[] = [];
  if (title.trim().length < 2) errors.push({ kind: "title" });
  weeks.forEach((week, weekIndex) => {
    if (!week.title.trim()) errors.push({ kind: "weekTitle", weekIndex });
    week.lessons.forEach((lesson, lessonIndex) => {
      if (lesson.cancelledAt) return;
      const at = { weekIndex, lessonIndex };
      if (!lesson.title.trim()) errors.push({ kind: "lessonTitle", ...at });
      lesson.resources.forEach((resource, resourceIndex) => {
        if (!resource.name.trim()) {
          errors.push({ kind: "lessonResourceName", ...at, resourceIndex });
        }
        if (
          !resource.file &&
          (resource.url.trim() || resource.urlRequired) &&
          resourceUrlProblem(resource.url)
        ) {
          errors.push({ kind: "lessonResourceUrl", ...at, resourceIndex });
        }
      });
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
  resources.forEach((resource, resourceIndex) => {
    if (!resource.name.trim()) {
      errors.push({ kind: "resourceName", resourceIndex });
    }
    // A typed address is always checked; an empty one only where required.
    if (
      !resource.file &&
      (resource.url.trim() || resource.urlRequired) &&
      resourceUrlProblem(resource.url)
    ) {
      errors.push({ kind: "resourceUrl", resourceIndex });
    }
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

/**
 * A session's own resources as "Kaydet" sends them (MDRS-286), or nothing
 * when the form left them as they were read: tedrisat keeps the stored list
 * for a missing key. Sent, the list replaces the stored one in its order,
 * keeping the rows that carry their id, and a stored file left out is
 * deleted with its file (MDRS-287). A file row goes back with its id and
 * never an address (tedrisat refuses one: RESOURCE_IS_FILE). Only a changed
 * list is sent because
 * the whole-course PUT counts any change to it as session work: a caller
 * without `session.manage` cannot change it here, and a content-locked read
 * has no address to send back.
 */
function lessonResourcesBody(
  draft: LessonDraft,
  read: readonly LessonResourceDraft[]
): Pick<CreateLessonDto, "resources"> {
  if (JSON.stringify(draft.resources) === JSON.stringify(read)) return {};
  return {
    resources: draft.resources.map((resource) => ({
      ...(resource.id ? { id: resource.id } : {}),
      name: resource.name.trim(),
      meta: resource.meta.trim() || null,
      ...(resource.file ? {} : { url: resource.url.trim() }),
    })),
  };
}

const lessonBody = (
  draft: LessonDraft,
  timeZone: string,
  locked: boolean,
  readResources: readonly LessonResourceDraft[]
): CreateLessonDto => {
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
    // A caller whose read was content-locked was sent no source line, link
    // or agenda, so its empty drafts are not theirs to clear: those keys stay
    // out and tedrisat keeps what is stored. A link such a caller types is
    // still sent.
    ...(locked
      ? {}
      : {
          kaynak: (draft.kaynak.trim() || null) as unknown as string,
          agenda: draft.agenda,
        }),
    ...(locked && !url
      ? {}
      : { meetingUrl: (url || null) as unknown as string }),
    isPreview: draft.isPreview,
    ...lessonResourcesBody(draft, readResources),
  };
};

/**
 * The whole-course body of "Kaydet" (`PUT /courses/:id`): what the form holds,
 * plus what it does not edit and a PUT would otherwise drop, the müderris rows
 * (unchanged, so a müderris may save). A week or a session left out of
 * `weeks` is hidden by the PUT, never deleted; a resource left out of
 * `resources` is removed, as a link has nothing hanging off it (MDRS-279),
 * and a file with its stored object (MDRS-287), which is why the editor asks
 * before taking a file off the list. A session's own resources go only when
 * the form changed them (MDRS-286). `version` is the course version the page
 * was read at, or the one an upload since then answered with.
 */
export function curriculumPayload(
  course: CourseDetailResponse,
  form: CurriculumForm,
  timeZone: string
): ReplaceCourseDto {
  // Each stored session's resources as read; a new session had none.
  const readResources = new Map(
    course.weeks.flatMap((week) =>
      week.lessons.map(
        (lesson) => [lesson.id, lessonResourceDraftsOf(lesson)] as const
      )
    )
  );
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
      lessons: week.lessons.map((lesson) =>
        lessonBody(
          lesson,
          timeZone,
          course.contentLocked,
          (lesson.id && readResources.get(lesson.id)) || []
        )
      ),
    })),
    muderris: course.muderris.map((m) => ({
      id: m.id,
      userId: m.userId ?? undefined,
      name: m.name,
      title: m.title ?? undefined,
      bio: m.bio ?? undefined,
      avatarHue: m.avatarHue,
    })),
    // In list order (tedrisat stores the order as sent); an emptied line is
    // null, which clears it, like a session's link.
    resources: form.resources.map((resource) => ({
      ...(resource.id ? { id: resource.id } : {}),
      name: resource.name.trim(),
      meta: (resource.meta.trim() || null) as unknown as string,
      type: resource.type ?? undefined,
      // No address is sent for a row the caller could not see the address
      // of (a content-locked read) or one stored without any: tedrisat
      // keeps the stored url for a missing key. Nor for a file (MDRS-287),
      // which goes back by its id alone and keeps its file.
      ...(!course.contentLocked && !resource.file && resource.url.trim()
        ? { url: resource.url.trim() }
        : {}),
    })),
  };
}

// ---- files uploaded while the form is open ---------------------------------------------

/**
 * The course version to save with after an upload (MDRS-287). An upload adds
 * its row at once and bumps the course's version by one, and its answer
 * carries the new one: the page takes it, so its next save does not meet a
 * conflict of its own making. A version further on means somebody else saved
 * the course in between; the page keeps the one it read, so its next save
 * meets the 409 and offers the current course, as for any other change.
 */
export const versionAfterUpload = (
  readVersion: number,
  courseVersion: number
): number => (courseVersion === readVersion + 1 ? courseVersion : readVersion);

/**
 * The course as the page now knows it is stored, after a file was added to
 * its resources: its new version and the new row last, as tedrisat put it.
 */
export function courseAfterUpload(
  read: CourseDetailResponse,
  upload: CourseResourceFileUploadResponse
): CourseDetailResponse {
  return {
    ...read,
    version: versionAfterUpload(read.version, upload.courseVersion),
    resources: [...read.resources, upload.resource],
  };
}

/**
 * The course after a file was added to a session's own resources: its new
 * version, and the new row last in that session's list. That list is what
 * the save compares the form's with, so the upload alone sends nothing.
 */
export function courseAfterLessonUpload(
  read: CourseDetailResponse,
  lessonId: string,
  upload: LessonResourceFileUploadResponse
): CourseDetailResponse {
  return {
    ...read,
    version: versionAfterUpload(read.version, upload.courseVersion),
    weeks: read.weeks.map((week) => ({
      ...week,
      lessons: week.lessons.map((lesson) =>
        lesson.id === lessonId
          ? {
              ...lesson,
              resources: [...(lesson.resources ?? []), upload.resource],
            }
          : lesson
      ),
    })),
  };
}

/** `weeks` with `row` last in the resources of the session `lessonId`. */
export const withLessonResource = (
  weeks: readonly WeekDraft[],
  lessonId: string,
  row: LessonResourceDraft
): WeekDraft[] =>
  weeks.map((week) => ({
    ...week,
    lessons: week.lessons.map((lesson) =>
      lesson.id === lessonId
        ? { ...lesson, resources: [...lesson.resources, row] }
        : lesson
    ),
  }));

// ---- a celse's homework ----------------------------------------------------------------

/**
 * The homework the course team set on a celse, as the editor holds it: its
 * description ('' for none) and its files, oldest first. Apart from the
 * celse's resources, and stored by its own writes, never by "Kaydet".
 */
export interface AssignmentState {
  description: string;
  files: Array<StoredFile & { id: string }>;
}

/** What tedrisat answers for a celse's homework, read or written, as JSON or parsed. */
export interface AssignmentAnswer {
  description?: string | null;
  files?: ReadonlyArray<StoredFile & { id: string }>;
}

/** A celse's homework as tedrisat answered it; null for none. */
export const assignmentStateOf = (
  answer: AssignmentAnswer | null | undefined
): AssignmentState | null =>
  answer
    ? {
        description: answer.description ?? "",
        files: (answer.files ?? []).map((file) => ({
          id: file.id,
          ...storedFileOf(file),
        })),
      }
    : null;

/**
 * Every stored celse's homework, by its id, as the course read gives it.
 * A content-locked read carries none, so it says nothing of any celse.
 */
export const assignmentsOf = (
  course: Pick<CourseDetailResponse, "weeks">
): Record<string, AssignmentState | null> =>
  Object.fromEntries(
    course.weeks.flatMap((week) =>
      week.lessons.map((lesson) => [
        lesson.id,
        assignmentStateOf(lesson.assignment),
      ])
    )
  );

/** The longest homework description tedrisat keeps, in characters. */
export const ASSIGNMENT_DESCRIPTION_MAX = 4000;

/** What a description save sends: trimmed, and null for a blank one. */
export const assignmentDescriptionBody = (draft: string): string | null =>
  draft.trim() || null;

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
