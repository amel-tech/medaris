import type {
  CourseDetailResponse,
  KoskCourseCountsResponse,
  KoskCourseRowResponse,
  KoskCourseStatus,
  LessonResponse,
} from "@medaris/services/tedrisat";
import type { BadgeVariant } from "@medaris/ui/mds/badge";
import type { IconName } from "@medaris/ui/mds/icon";

/**
 * Pure helpers behind the köşk page of the Medaris yönetimi, the Dersler table
 * and a course's overview (nizam 20, 23 and 53, MDRS-175): the tabs and their
 * numbers, which buttons a row carries, how a row's cells read, the next
 * sessions and the warning for a missing meeting link. No React and no I/O, so
 * the sentences and counts the designs show can be pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

// ---- the tabs ----------------------------------------------------------------

export type CourseTab = "ALL" | KoskCourseStatus;

export const COURSE_TABS: CourseTab[] = ["ALL", "PUBLISHED", "DRAFT", "HIDDEN"];

/** The number a tab shows; the köşk's own counts, so it equals the rows it lists. */
export function tabCount(
  counts: KoskCourseCountsResponse,
  tab: CourseTab
): number {
  switch (tab) {
    case "ALL":
      return counts.all;
    case "PUBLISHED":
      return counts.published;
    case "DRAFT":
      return counts.draft;
    case "HIDDEN":
      return counts.hidden;
  }
}

/** The rows a tab lists; "Tümü" lists every course, the hidden ones too. */
export function filterCourses(
  rows: KoskCourseRowResponse[],
  tab: CourseTab
): KoskCourseRowResponse[] {
  return tab === "ALL" ? rows : rows.filter((row) => row.status === tab);
}

/** The counts as the rows give them: what a tab should say when there is nothing else to trust. */
export function countRows(
  rows: KoskCourseRowResponse[]
): KoskCourseCountsResponse {
  return {
    all: rows.length,
    published: rows.filter((r) => r.status === "PUBLISHED").length,
    draft: rows.filter((r) => r.status === "DRAFT").length,
    hidden: rows.filter((r) => r.status === "HIDDEN").length,
  };
}

// ---- a row -------------------------------------------------------------------------

/** What a row's Durum cell draws: a badge, and for a hidden course the plain word with its glyph. */
export const COURSE_STATUS_LOOK: Record<
  KoskCourseStatus,
  { badge: BadgeVariant | null; icon: IconName | null }
> = {
  PUBLISHED: { badge: "secondary", icon: null },
  DRAFT: { badge: "outline", icon: null },
  HIDDEN: { badge: null, icon: "eyeOff" },
};

export type RowAction = "edit" | "editMuderris" | "view" | "hide" | "restore";

/**
 * The buttons of a row in the Dersler table (nizam 23). A hidden course has
 * only "Geri al", and only when the row says the caller may bring it back: a
 * course a higher level hid has no button, the API would refuse it
 * (MDRS-143). A medrese's course has no "Düzenle" and no müderris editing —
 * the medrese opens the course and picks its müderrisler — but may be viewed
 * and hidden by the köşk's nazım.
 */
export function rowActions(row: KoskCourseRowResponse): RowAction[] {
  if (row.status === "HIDDEN") return row.canRestore ? ["restore"] : [];
  if (row.madrasah) return ["view", "hide"];
  return ["edit", "editMuderris", "hide"];
}

/** Why a restore failed: the level that hid the course is above the caller's, or anything else. */
export function restoreFailureKey(errorBody: unknown): "level" | "generic" {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? (errorBody as { code: unknown }).code
      : null;
  return code === "ARCHIVE_RESTORE_LEVEL" ? "level" : "generic";
}

/** The Talebe cell: the number, or nothing for a course nobody can have joined yet. */
export function studentsCell(row: KoskCourseRowResponse): number | null {
  if (row.status === "PUBLISHED" || row.status === "HIDDEN") {
    return row.status === "HIDDEN" && row.studentCount === 0
      ? null
      : row.studentCount;
  }
  return row.studentCount > 0 ? row.studentCount : null;
}

/** The Kayıt durumu chips: only a published course has any, and only the ones that are not zero. */
export function registrationChips(
  row: KoskCourseRowResponse
): { kind: "pending" | "banned"; count: number }[] {
  if (row.status !== "PUBLISHED") return [];
  const chips: { kind: "pending" | "banned"; count: number }[] = [];
  if (row.pendingCount > 0)
    chips.push({ kind: "pending", count: row.pendingCount });
  if (row.bannedCount > 0)
    chips.push({ kind: "banned", count: row.bannedCount });
  return chips;
}

// ---- the köşk page (nizam 20) -----------------------------------------------------------

/** "3 yayında · 2 taslak · 2 gizli": the line under the Ders number; a part with none is left out except when all are none. */
export function courseBreakdown(
  counts: KoskCourseCountsResponse,
  t: Messages
): string {
  return [
    t("published", { count: counts.published }),
    t("draft", { count: counts.draft }),
    t("hidden", { count: counts.hidden }),
  ].join(" · ");
}

/**
 * Whether the köşk can be taken out of service now: it is active. A hidden
 * köşk is already out of sight and a passive one is passive.
 */
export const canDeactivate = (
  status: "ACTIVE" | "PASSIVE" | "HIDDEN"
): boolean => status === "ACTIVE";

/** The same for hiding: anything that is not hidden. */
export const canHide = (status: "ACTIVE" | "PASSIVE" | "HIDDEN"): boolean =>
  status !== "HIDDEN";

// ---- a course's overview (nizam 53) ------------------------------------------------------

export const NEXT_SESSIONS = 4;

export type SessionStatus = "cancelled" | "missingLink" | "planned";

const liveSessions = (course: Pick<CourseDetailResponse, "weeks">) =>
  course.weeks.flatMap((week) =>
    week.lessons
      .filter((lesson) => lesson.type === "LIVE" && lesson.scheduledAt)
      .map((lesson) => ({ week, lesson }))
  );

export interface UpcomingSession {
  lesson: LessonResponse;
  weekNumber: number;
  at: Date;
  status: SessionStatus;
}

/** How one live session stands: cancelled, planned with no link yet, or planned. */
export function sessionStatus(
  lesson: Pick<LessonResponse, "cancelledAt" | "meetingUrl">
): SessionStatus {
  if (lesson.cancelledAt) return "cancelled";
  return lesson.meetingUrl?.trim() ? "planned" : "missingLink";
}

/**
 * "Sıradaki celseler": the nearest `limit` live sessions that have not begun,
 * by date. A cancelled session keeps its slot in the list, marked.
 */
export function upcomingSessions(
  course: Pick<CourseDetailResponse, "weeks">,
  now: Date,
  limit = NEXT_SESSIONS
): UpcomingSession[] {
  return liveSessions(course)
    .map(({ week, lesson }) => ({
      lesson,
      weekNumber: week.weekNumber,
      at: new Date(lesson.scheduledAt as Date),
      status: sessionStatus(lesson),
    }))
    .filter((s) => s.at.getTime() >= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, limit);
}

/**
 * The session the warning above the numbers names: the first upcoming one that
 * is not cancelled and has no meeting link. Looked for among every upcoming
 * session, not only the four listed.
 */
export function firstMissingLink(
  course: Pick<CourseDetailResponse, "weeks">,
  now: Date
): UpcomingSession | null {
  return (
    upcomingSessions(course, now, Number.MAX_SAFE_INTEGER).find(
      (s) => s.status === "missingLink"
    ) ?? null
  );
}

/** How many sessions the programme holds, cancelled ones too. */
export const sessionCount = (course: Pick<CourseDetailResponse, "weeks">) =>
  liveSessions(course).length;

/**
 * "Cumartesi 21:00 ve Pazar 20:00": the days and times the course meets, from
 * its live sessions in the course's own zone, Monday first. Empty when no
 * session is dated.
 */
export function meetingSlots(
  course: Pick<CourseDetailResponse, "weeks" | "timeZone">,
  locale: string
): string[] {
  const slots = new Map<string, { order: number; label: string }>();
  for (const { lesson } of liveSessions(course)) {
    const at = new Date(lesson.scheduledAt as Date);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: course.timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(at)
        .map((p) => [p.type, p.value])
    );
    const key = `${parts.weekday} ${parts.hour}:${parts.minute}`;
    if (slots.has(key)) continue;
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      parts.weekday ?? ""
    );
    const day = new Intl.DateTimeFormat(locale, {
      timeZone: course.timeZone,
      weekday: "long",
    }).format(at);
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: course.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    slots.set(key, { order, label: `${day} ${time}` });
  }
  return [...slots.values()]
    .sort((a, b) => a.order - b.order)
    .map((s) => s.label);
}

/** The list of slots as a sentence: "A ve B" in the page's language. */
export function listWords(items: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(items);
  } catch {
    return items.join(", ");
  }
}

/**
 * The platform a meeting link is on, from its address: "Zoom", "Google Meet",
 * "Microsoft Teams", "YouTube", else the host's name. Nothing for no link or
 * one that is no address.
 */
export function platformOf(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const known: [RegExp, string][] = [
    [/(^|\.)zoom\.(us|com)$/, "Zoom"],
    [/^meet\.google\.com$/, "Google Meet"],
    [/(^|\.)teams\.(microsoft|live)\.com$/, "Microsoft Teams"],
    [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  ];
  return known.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}
