import type {
  CourseDetailResponse,
  RecordingResponse,
  WeeklyPatternDto,
} from "@medaris/services/tedrisat";
import type { CoverTone } from "@medaris/ui/mds/cover-pattern";
import {
  fromZonedDatetimeLocal,
  meetingUrlProblem,
  normalizeMeetingUrl,
  parseYoutubeLiveUrl,
  toZonedDatetimeLocal,
  type YoutubeLiveProblem,
} from "@medaris/utils";

/**
 * The pure parts of the course screens (nizam 32, 33, 34, 54, 55, 56): the
 * schedule a form describes, the müderris list rules, the state of a session
 * against the clock, and the week copy. Nothing here reads the network or the
 * clock on its own, so every rule is unit-tested (test/course-present.spec.ts).
 */

// ---- the cover -------------------------------------------------------------

/** nizam/32 "Kapak ibaresi": the list and its Arabic live with the cover itself, shared with tedris. */
export {
  arabicOfCoverLabel,
  COVER_LABELS,
} from "@medaris/ui/mds/cover-pattern";

export const COVER_TONE_ORDER: CoverTone[] = [
  "laciverd",
  "bordo",
  "zumrut",
  "murekkep",
];

// ---- weekdays and the schedule ---------------------------------------------

/** ISO weekdays, Monday first (the order the chips are drawn in). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface ScheduleForm {
  /** "YYYY-MM-DD" */
  startDate: string;
  /** the course length in weeks, as typed */
  weeks: string;
  weekdays: number[];
  /** "HH:mm" */
  startTime: string;
  /** minutes, as typed */
  duration: string;
  timeZone: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayNumber = (date: string): number => {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** "YYYY-MM-DD" shifted by `days` calendar days; the zone plays no part. */
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** ISO weekday of a "YYYY-MM-DD" date. */
export function isoWeekdayOf(date: string): number {
  return ((((dayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

export type ScheduleProblem =
  | "startDate"
  | "weeks"
  | "weekdays"
  | "startTime"
  | "duration";

/** The first thing wrong with each schedule field; empty when the form can be sent. */
export function scheduleErrors(
  form: ScheduleForm
): Partial<Record<ScheduleProblem, true>> {
  const errors: Partial<Record<ScheduleProblem, true>> = {};
  if (!DATE.test(form.startDate)) errors.startDate = true;
  const weeks = Number(form.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) errors.weeks = true;
  if (form.weekdays.length === 0) errors.weekdays = true;
  if (!TIME.test(form.startTime)) errors.startTime = true;
  const duration = Number(form.duration);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    errors.duration = true;
  }
  return errors;
}

/**
 * nizam/32 "Zaman": N weeks from the start date, on the chosen weekdays. The
 * range ends on the last day of the N-th week counted from the start date, so
 * "8 weeks, Mondays, from 12 October" is exactly eight sessions. tedrisat
 * expands it (the same call previews and saves), this only builds the pattern.
 */
export function coursePattern(form: ScheduleForm): WeeklyPatternDto | null {
  if (Object.keys(scheduleErrors(form)).length > 0) return null;
  return {
    weekdays: [...form.weekdays].sort((a, b) => a - b),
    startTime: form.startTime,
    timeZone: form.timeZone,
    startDate: form.startDate,
    endDate: addDays(form.startDate, Number(form.weeks) * 7 - 1),
  };
}

export type RecurrenceEnd = "date" | "count";

export interface PlanForm {
  mode: "single" | "weekly";
  weekdays: number[];
  startTime: string;
  duration: string;
  timeZone: string;
  startDate: string;
  endMode: RecurrenceEnd;
  endDate: string;
  count: string;
}

export type PlanProblem =
  | "weekdays"
  | "startTime"
  | "duration"
  | "startDate"
  | "endDate"
  | "endBeforeStart"
  | "count";

/** nizam/55: the first thing wrong with each field; "N celse oluştur" is off while any is. */
export function planErrors(form: PlanForm): Partial<Record<PlanProblem, true>> {
  const errors: Partial<Record<PlanProblem, true>> = {};
  if (form.mode === "weekly" && form.weekdays.length === 0) {
    errors.weekdays = true;
  }
  if (!TIME.test(form.startTime)) errors.startTime = true;
  const duration = Number(form.duration);
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) {
    errors.duration = true;
  }
  if (!DATE.test(form.startDate)) errors.startDate = true;
  if (form.mode === "weekly") {
    if (form.endMode === "date") {
      if (!DATE.test(form.endDate)) errors.endDate = true;
      else if (DATE.test(form.startDate) && form.endDate < form.startDate) {
        errors.endBeforeStart = true;
      }
    } else {
      const n = Number(form.count);
      if (!Number.isInteger(n) || n < 1 || n > 200) errors.count = true;
    }
  }
  return errors;
}

/**
 * nizam/55: "Tek seferlik" is a weekly pattern of one session on the weekday
 * of its date; "Haftalık tekrar" ends on a date (inclusive) or after N.
 */
export function planPattern(form: PlanForm): WeeklyPatternDto | null {
  if (Object.keys(planErrors(form)).length > 0) return null;
  const base = {
    startTime: form.startTime,
    timeZone: form.timeZone,
    startDate: form.startDate,
  };
  if (form.mode === "single") {
    return {
      ...base,
      weekdays: [isoWeekdayOf(form.startDate)],
      count: 1,
    };
  }
  const weekdays = [...form.weekdays].sort((a, b) => a - b);
  return form.endMode === "date"
    ? { ...base, weekdays, endDate: form.endDate }
    : { ...base, weekdays, count: Number(form.count) };
}

/** What the preview strip says about a planned list: how many, from when to when. */
export function planSummary(sessions: { localDate: string }[]): {
  count: number;
  first: string | null;
  last: string | null;
} {
  const dates = sessions.map((s) => s.localDate).sort();
  return {
    count: dates.length,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
  };
}

// ---- the müderris list -----------------------------------------------------

export interface TeamMember {
  userId: string;
  name: string;
  title?: string;
  email?: string | null;
}

export interface TeamState {
  members: TeamMember[];
  imamUserId: string | null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A single müderris is the imam; with several the chosen one stays while they remain. */
export function normalizedImam(team: TeamState): string | null {
  if (team.members.length === 0) return null;
  if (team.members.length === 1) return team.members[0]?.userId ?? null;
  const kept = team.members.find(
    (m) => team.imamUserId && same(m.userId, team.imamUserId)
  );
  return kept ? kept.userId : null;
}

/** Adds a person unless already listed. The first one becomes the imam. */
export function addMember(team: TeamState, member: TeamMember): TeamState {
  if (team.members.some((m) => same(m.userId, member.userId))) return team;
  const members = [...team.members, member];
  return {
    members,
    imamUserId:
      team.imamUserId ?? (members.length === 1 ? member.userId : null),
  };
}

/** Removes a person. The imam goes with them; the lone one left is the imam. */
export function removeMember(team: TeamState, userId: string): TeamState {
  const members = team.members.filter((m) => !same(m.userId, userId));
  const imam =
    team.imamUserId && !same(team.imamUserId, userId) ? team.imamUserId : null;
  return {
    members,
    imamUserId: members.length === 1 ? (members[0]?.userId ?? null) : imam,
  };
}

/** The list can be saved: somebody is on it and the imam is one of them. */
export function teamReady(team: TeamState): boolean {
  const imam = normalizedImam(team);
  return team.members.length > 0 && imam !== null;
}

export interface TeamDiff {
  added: string[];
  removed: string[];
  imamChanged: boolean;
}

/** What saving changes against the stored list; nothing means "Kaydet" has nothing to send. */
export function teamDiff(before: TeamState, after: TeamState): TeamDiff {
  const ids = (t: TeamState) => t.members.map((m) => m.userId.toLowerCase());
  const b = ids(before);
  const a = ids(after);
  return {
    added: a.filter((id) => !b.includes(id)),
    removed: b.filter((id) => !a.includes(id)),
    imamChanged:
      (normalizedImam(before)?.toLowerCase() ?? null) !==
      (normalizedImam(after)?.toLowerCase() ?? null),
  };
}

export const teamChanged = (before: TeamState, after: TeamState): boolean => {
  const d = teamDiff(before, after);
  return d.added.length > 0 || d.removed.length > 0 || d.imamChanged;
};

/** The request body of PUT /courses/:id/muderris, or null while the list cannot be saved. */
export function teamPayload(
  team: TeamState,
  version: number
): {
  version: number;
  muderris: { userId: string; name: string; title?: string }[];
  imamUserId: string;
} | null {
  const imamUserId = normalizedImam(team);
  if (!teamReady(team) || imamUserId === null) return null;
  // The imam is listed first: it is also the order a course lists its müderris in.
  const ordered = [...team.members].sort(
    (x, y) =>
      Number(same(y.userId, imamUserId)) - Number(same(x.userId, imamUserId))
  );
  return {
    version,
    muderris: ordered.map((m) => ({
      userId: m.userId,
      name: m.name,
      ...(m.title ? { title: m.title } : {}),
    })),
    imamUserId,
  };
}

/** The team a course detail stores. */
export function teamOfCourse(course: Pick<CourseDetailResponse, "muderris">): {
  members: TeamMember[];
  imamUserId: string | null;
} {
  const linked = course.muderris.filter((m) => m.userId);
  const imam = linked.find((m) => m.isImam);
  return {
    members: linked.map((m) => ({
      userId: m.userId as string,
      name: m.name,
      title: m.title ?? undefined,
    })),
    imamUserId: imam?.userId ?? null,
  };
}

// ---- sessions against the clock --------------------------------------------

export type SessionState = "live" | "scheduled" | "ended" | "cancelled";

export interface SessionRow {
  id: string;
  title: string;
  weekNumber: number;
  start: Date;
  durationMinutes: number;
  meetingUrl: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  state: SessionState;
  /** minutes the session has been running, while it is live */
  minutesLive: number | null;
}

/** A lesson without a length is taken as 60 minutes, as tedrisat does. */
export const DEFAULT_SESSION_MINUTES = 60;

export function sessionState(
  lesson: {
    scheduledAt: Date;
    durationMinutes?: number | null;
    cancelledAt?: Date | null;
  },
  now: Date
): SessionState {
  if (lesson.cancelledAt) return "cancelled";
  const start = lesson.scheduledAt.getTime();
  const end =
    start + (lesson.durationMinutes ?? DEFAULT_SESSION_MINUTES) * 60_000;
  if (now.getTime() >= end) return "ended";
  if (now.getTime() >= start) return "live";
  return "scheduled";
}

/** Every live session of the course as a flat row, by date. */
export function sessionRows(
  course: Pick<CourseDetailResponse, "weeks">,
  now: Date
): SessionRow[] {
  const rows: SessionRow[] = [];
  for (const week of course.weeks) {
    for (const lesson of week.lessons) {
      if (lesson.type !== "LIVE" || !lesson.scheduledAt) continue;
      const start = new Date(lesson.scheduledAt);
      const durationMinutes = lesson.durationMinutes ?? DEFAULT_SESSION_MINUTES;
      const cancelledAt = lesson.cancelledAt
        ? new Date(lesson.cancelledAt)
        : null;
      const state = sessionState(
        { scheduledAt: start, durationMinutes, cancelledAt },
        now
      );
      rows.push({
        id: lesson.id,
        title: lesson.title,
        weekNumber: week.weekNumber,
        start,
        durationMinutes,
        meetingUrl: lesson.meetingUrl ?? null,
        cancelledAt,
        cancelReason: lesson.cancelReason ?? null,
        state,
        minutesLive:
          state === "live"
            ? Math.floor((now.getTime() - start.getTime()) / 60_000)
            : null,
      });
    }
  }
  return rows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export interface SessionGroups {
  upcoming: SessionRow[];
  past: SessionRow[];
  cancelledUpcoming: number;
  /** "5–8", or "5" for one week; null with nothing upcoming */
  weekRange: string | null;
}

/**
 * nizam/56: "Yaklaşan" holds what has not ended yet (live, planned, and a
 * cancelled one whose time has not come), oldest first; "Geçmiş" the rest,
 * newest first. The counts in the heading are the list's own.
 */
export function groupSessions(rows: SessionRow[], now: Date): SessionGroups {
  const ends = (r: SessionRow) =>
    r.start.getTime() + r.durationMinutes * 60_000;
  const upcoming = rows
    .filter((r) => ends(r) > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const past = rows
    .filter((r) => ends(r) <= now.getTime())
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  const weeks = upcoming.map((r) => r.weekNumber);
  const lo = Math.min(...weeks);
  const hi = Math.max(...weeks);
  return {
    upcoming,
    past,
    cancelledUpcoming: upcoming.filter((r) => r.state === "cancelled").length,
    weekRange:
      weeks.length === 0 ? null : lo === hi ? String(lo) : `${lo}–${hi}`,
  };
}

/** The recordings per session id, from GET /courses/:id/recordings. */
export function recordingCounts(
  recordings: Pick<RecordingResponse, "lessonId">[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of recordings) {
    counts.set(r.lessonId, (counts.get(r.lessonId) ?? 0) + 1);
  }
  return counts;
}

// ---- meeting links ----------------------------------------------------------

export type LinkProblem = "not-https" | "too-long" | "invalid";

/**
 * An empty link is allowed (it is added later); a filled one must be https.
 * A link typed with `http://` is refused as typed (nizam/54, nizam/56: "Bağlantıyı
 * platformdan yeniden kopyalayın") rather than silently upgraded; a link with
 * no scheme at all gets `https://`, as everywhere else.
 */
export function linkProblem(value: string): LinkProblem | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^http:/i.test(raw)) return "not-https";
  return meetingUrlProblem(normalizeMeetingUrl(raw)) ?? null;
}

// ---- the curriculum ---------------------------------------------------------

export interface LessonDraft {
  id?: string;
  title: string;
  type: string;
  /** "YYYY-MM-DD" on the course's clock; '' = unset */
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
  /** the stored instant, kept for a lesson that is not edited */
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

export function lessonDraftOf(
  lesson: CourseDetailResponse["weeks"][number]["lessons"][number],
  timeZone: string,
  makeupIds: ReadonlySet<string> = new Set()
): LessonDraft {
  const local = lesson.scheduledAt
    ? toZonedDatetimeLocal(new Date(lesson.scheduledAt), timeZone)
    : "";
  const [date = "", time = ""] = local.split("T");
  return {
    id: lesson.id,
    title: lesson.title,
    type: lesson.type,
    date,
    time: time.slice(0, 5),
    duration:
      lesson.durationMinutes != null ? String(lesson.durationMinutes) : "",
    meetingUrl: lesson.meetingUrl ?? "",
    kaynak: lesson.kaynak ?? "",
    agenda: (lesson.agenda ?? []).map((s) => ({
      time: s.time,
      title: s.title,
    })),
    isPreview: lesson.isPreview,
    cancelledAt: lesson.cancelledAt
      ? new Date(lesson.cancelledAt).toISOString()
      : null,
    cancelReason: lesson.cancelReason ?? null,
    scheduledAtIso: lesson.scheduledAt
      ? new Date(lesson.scheduledAt).toISOString()
      : null,
    makeup: makeupIds.has(lesson.id),
  };
}

export function weekDraftsOf(
  course: Pick<CourseDetailResponse, "weeks" | "timeZone">
): WeekDraft[] {
  const makeupIds = new Set(
    course.weeks.flatMap((w) =>
      w.lessons.flatMap((l) =>
        l.cancelledAt && l.replacementLessonId ? [l.replacementLessonId] : []
      )
    )
  );
  return course.weeks.map((w) => ({
    id: w.id,
    weekNumber: w.weekNumber,
    title: w.title,
    summary: w.summary ?? "",
    lessons: w.lessons.map((l) => lessonDraftOf(l, course.timeZone, makeupIds)),
  }));
}

/** The instant a lesson draft means on the course's clock; null while date or time is missing. */
export function lessonInstant(
  draft: Pick<LessonDraft, "date" | "time" | "scheduledAtIso">,
  timeZone: string
): Date | null {
  if (!draft.date || !draft.time) return null;
  return fromZonedDatetimeLocal(`${draft.date}T${draft.time}`, timeZone);
}

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
 * Everything that stops "Kaydet" (nizam/54): the course name, each week's
 * title, and for every live session its title, date, time, length and https
 * link. A cancelled session is information and is not checked.
 */
export function curriculumErrors(
  title: string,
  weeks: WeekDraft[]
): CurriculumError[] {
  const errors: CurriculumError[] = [];
  if (title.trim().length < 2) errors.push({ kind: "title" });
  weeks.forEach((week, weekIndex) => {
    if (!week.title.trim()) errors.push({ kind: "weekTitle", weekIndex });
    week.lessons.forEach((l, lessonIndex) => {
      if (l.cancelledAt) return;
      const at = { weekIndex, lessonIndex };
      if (!l.title.trim()) errors.push({ kind: "lessonTitle", ...at });
      if (l.type === "LIVE") {
        if (!l.date) errors.push({ kind: "lessonDate", ...at });
        if (!l.time) errors.push({ kind: "lessonTime", ...at });
        const d = Number(l.duration);
        if (!Number.isInteger(d) || d < 1 || d > 1440) {
          errors.push({ kind: "lessonDuration", ...at });
        }
        if (linkProblem(l.meetingUrl)) errors.push({ kind: "link", ...at });
      }
    });
  });
  return errors;
}

/** "Haftayı kopyala": the week again, 7 days later, with no links and nothing cancelled. */
export function copyWeek(week: WeekDraft, nextNumber: number): WeekDraft {
  return {
    weekNumber: nextNumber,
    title: week.title,
    summary: week.summary,
    lessons: week.lessons
      .filter((l) => !l.cancelledAt)
      .map((l) => ({
        ...l,
        id: undefined,
        date: l.date ? addDays(l.date, 7) : "",
        meetingUrl: "",
        isPreview: false,
        cancelledAt: null,
        cancelReason: null,
        scheduledAtIso: null,
        makeup: false,
      })),
  };
}

/** True when the current drafts differ from the saved ones (the "Kaydedilmemiş değişiklikler var" strip). */
export function curriculumDirty(
  a: { title: string; description: string; tone: string; weeks: WeekDraft[] },
  b: { title: string; description: string; tone: string; weeks: WeekDraft[] }
): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** A week's date span and counts for its collapsed row. */
export function weekFacts(week: WeekDraft): {
  sessions: number;
  minutes: number;
  from: string | null;
  to: string | null;
} {
  const live = week.lessons.filter((l) => !l.cancelledAt);
  const dates = live
    .map((l) => l.date)
    .filter(Boolean)
    .sort();
  return {
    sessions: live.length,
    minutes: live.reduce((sum, l) => sum + (Number(l.duration) || 0), 0),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

// ---- the sample session ------------------------------------------------------

export interface SampleOption {
  value: string;
  weekNumber: number | null;
  title: string | null;
}

/** nizam/34 "Örnek ders": "none" plus every live session, in programme order. */
export function sampleOptions(
  course: Pick<CourseDetailResponse, "weeks">
): SampleOption[] {
  const options: SampleOption[] = [
    { value: "", weekNumber: null, title: null },
  ];
  for (const week of course.weeks) {
    for (const lesson of week.lessons) {
      if (lesson.type !== "LIVE") continue;
      options.push({
        value: lesson.id,
        weekNumber: week.weekNumber,
        title: lesson.title,
      });
    }
  }
  return options;
}

export function sampleOf(course: Pick<CourseDetailResponse, "weeks">): string {
  for (const week of course.weeks) {
    for (const lesson of week.lessons) if (lesson.isPreview) return lesson.id;
  }
  return "";
}

export interface SettingsForm {
  isClosed: boolean;
  requiresApproval: boolean;
  timeZone: string;
  sampleLessonId: string;
}

export function settingsOf(
  course: Pick<
    CourseDetailResponse,
    "isClosed" | "requiresApproval" | "timeZone" | "weeks"
  >
): SettingsForm {
  return {
    isClosed: course.isClosed,
    requiresApproval: course.requiresApproval,
    timeZone: course.timeZone,
    sampleLessonId: sampleOf(course),
  };
}

export const settingsChanged = (a: SettingsForm, b: SettingsForm): boolean =>
  JSON.stringify(a) !== JSON.stringify(b);

/**
 * The köşk policy "Her zaman kayıt onayı" fixes the approval switch on: a
 * course cannot loosen it (nizam/24). The form shows the switch checked and
 * off-limits then.
 */
export function effectiveApproval(
  form: Pick<SettingsForm, "requiresApproval">,
  koskAlwaysRequiresApproval: boolean
): boolean {
  return koskAlwaysRequiresApproval || form.requiresApproval;
}

// ---- dates a pattern falls on (the form's instant summary) -------------------

/**
 * The calendar dates of a weekly pattern, in order, from the start date to the
 * end date inclusive or for `count` sessions. Dates only: the zone and the
 * clock time play no part, so this is what a form shows while it is typed;
 * tedrisat expands the same pattern with the zone when it is saved.
 */
export function patternDates(
  pattern: Pick<
    WeeklyPatternDto,
    "weekdays" | "startDate" | "endDate" | "count"
  >
): string[] {
  const limit = pattern.count ?? Number.POSITIVE_INFINITY;
  const dates: string[] = [];
  let day = pattern.startDate;
  // Bounded: a pattern without an end date carries a count.
  for (let i = 0; i < 4000 && dates.length < limit; i++) {
    if (pattern.endDate !== undefined && day > pattern.endDate) break;
    if (pattern.weekdays.includes(isoWeekdayOf(day))) dates.push(day);
    day = addDays(day, 1);
  }
  return dates;
}

// ---- what the API refuses ----------------------------------------------------

const CODES = {
  COURSE_VERSION_CONFLICT: "versionConflict",
  MUDERRIS_UNKNOWN_USER: "unknownUser",
  MUDERRIS_DUPLICATE_USER: "duplicateUser",
  MUDERRIS_LIST_INVALID: "listInvalid",
  LESSON_ALREADY_CANCELLED: "alreadyCancelled",
  AUTHZ_FORBIDDEN: "forbidden",
  INVALID_SESSION_PATTERN: "invalidPattern",
} as const;
export type CourseErrorKey = (typeof CODES)[keyof typeof CODES] | "generic";

/** The `errors.*` key of a refusal from tedrisat; `generic` for any other. */
export function courseErrorKey(errorBody: unknown): CourseErrorKey {
  const code =
    typeof errorBody === "object" && errorBody !== null
      ? (errorBody as { code?: unknown }).code
      : undefined;
  return typeof code === "string" && Object.hasOwn(CODES, code)
    ? CODES[code as keyof typeof CODES]
    : "generic";
}

// ---- the live stream link (MDRS-228) ----------------------------------------

/** The `stream.problems.*` key of a link the shared parser refuses. */
export type LiveStreamProblemKey =
  | "empty"
  | "channel"
  | "notYoutube"
  | "notHttps"
  | "noVideo";

const PROBLEM_KEYS: Record<YoutubeLiveProblem, LiveStreamProblemKey> = {
  empty: "empty",
  "too-long": "noVideo",
  invalid: "noVideo",
  "not-https": "notHttps",
  "not-youtube": "notYoutube",
  channel: "channel",
  "no-video": "noVideo",
};

/**
 * What the "Canlı yayın" field says before anything is sent: `null` when the
 * link is one tedrisat stores (`parseYoutubeLiveUrl` is the parser tedrisat
 * runs), otherwise the reason. Empty is a problem here: clearing the link is
 * its own button.
 */
export function liveStreamProblem(value: string): LiveStreamProblemKey | null {
  const parsed = parseYoutubeLiveUrl(value);
  return parsed.ok ? null : PROBLEM_KEYS[parsed.problem];
}

/**
 * Where a refused stream write is told: under the field, in the field's own
 * words, when tedrisat refused the link itself (`LIVE_STREAM_URL_INVALID`
 * carries the parser's `problem`); as a toast for the session's state; the
 * course's error otherwise.
 */
export type LiveStreamRefusal =
  | { field: LiveStreamProblemKey }
  | { toast: "stream.errors.notLive" | "stream.errors.cancelled" }
  | { toast: `errors.${CourseErrorKey}` };

export function liveStreamRefusal(errorBody: unknown): LiveStreamRefusal {
  const body =
    typeof errorBody === "object" && errorBody !== null
      ? (errorBody as { code?: unknown; context?: { problem?: unknown } })
      : {};
  if (body.code === "LIVE_STREAM_URL_INVALID") {
    const problem = body.context?.problem;
    return {
      field:
        typeof problem === "string" && Object.hasOwn(PROBLEM_KEYS, problem)
          ? PROBLEM_KEYS[problem as YoutubeLiveProblem]
          : "noVideo",
    };
  }
  if (body.code === "LESSON_NOT_LIVE")
    return { toast: "stream.errors.notLive" };
  if (body.code === "LESSON_CANCELLED") {
    return { toast: "stream.errors.cancelled" };
  }
  return { toast: `errors.${courseErrorKey(errorBody)}` };
}
