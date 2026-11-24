import type {
  KoskRecordingRowResponse,
  KoskSessionRowResponse,
} from "@medaris/services/tedrisat";

/**
 * Pure rules behind the köşk-wide Celseler, Talebeler and Ders kayıtları
 * (MDRS-211): what an address asks for, where a row leads, how a page of
 * recordings is grouped. No React and no I/O. The tab, the page and the
 * search live in the address (`?sekme=`, `?sayfa=`, `?ara=`), so a list can
 * be linked and the server reads exactly the page that is shown.
 */
export const PAGE_SIZE = 20;

/** The longest search tedrisat reads. */
export const SEARCH_MAX = 100;

export type SessionTab = "UPCOMING" | "PAST";

type Param = string | string[] | undefined;
const single = (value: Param): string =>
  typeof value === "string" ? value : "";

/** `?sekme=gecmis` is the past tab; anything else the upcoming one. */
export const sessionTabOf = (value: Param): SessionTab =>
  single(value) === "gecmis" ? "PAST" : "UPCOMING";

/** The last page asked of tedrisat; far past any real list. */
export const PAGE_MAX = 100_000;

/** `?sayfa=3`; anything that is not a positive whole number is the first page, and none is past `PAGE_MAX`. */
export function pageOf(value: Param): number {
  const n = Number(single(value));
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, PAGE_MAX) : 1;
}

/** `?ara=`: trimmed and cut to what the API reads. */
export const searchOf = (value: Param): string =>
  single(value).trim().slice(0, SEARCH_MAX);

const withQuery = (path: string, query: Record<string, string>): string => {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
};

export function sessionsHref(
  koskId: string,
  tab: SessionTab = "UPCOMING",
  page = 1
): string {
  return withQuery(`/kosks/${koskId}/celseler`, {
    ...(tab === "PAST" ? { sekme: "gecmis" } : {}),
    ...(page > 1 ? { sayfa: String(page) } : {}),
  });
}

export function studentsHref(koskId: string, q = "", page = 1): string {
  return withQuery(`/kosks/${koskId}/talebeler`, {
    ...(q ? { ara: q } : {}),
    ...(page > 1 ? { sayfa: String(page) } : {}),
  });
}

export function recordingsHref(koskId: string, page = 1): string {
  return withQuery(
    `/kosks/${koskId}/ders-kayitlari`,
    page > 1 ? { sayfa: String(page) } : {}
  );
}

/** A course's own Celseler, where its sessions and ders kayıtları are worked on. */
export const courseSessionsHref = (koskId: string, courseId: string): string =>
  `/kosks/${koskId}/courses/${courseId}/sessions`;

/** A course's own Talebeler, where its talebe are worked on. */
export const courseStudentsHref = (koskId: string, courseId: string): string =>
  `/kosks/${koskId}/courses/${courseId}/students`;

export interface Pager {
  page: number;
  pages: number;
  /** the first and last row shown, counted from one; both 0 on an empty list */
  from: number;
  to: number;
  prev: number | null;
  next: number | null;
}

/** Where a page stands in its list. A page past the end has no rows and still leads back. */
export function pagerOf(
  page: number,
  limit: number,
  total: number,
  shown: number
): Pager {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = shown === 0 ? 0 : (page - 1) * limit + 1;
  return {
    page,
    pages,
    from,
    to: shown === 0 ? 0 : from + shown - 1,
    prev: page > 1 ? Math.min(page - 1, pages) : null,
    next: page < pages ? page + 1 : null,
  };
}

/** How a session reads in the Durum column. */
export type SessionState = "cancelled" | "ended" | "live" | "scheduled";

/**
 * A session that has started stays among the upcoming ones until it ends,
 * and reads as under way there, as on the köşk home and the course's page.
 */
export function sessionState(
  session: Pick<KoskSessionRowResponse, "cancelled" | "scheduledAt">,
  tab: SessionTab,
  now: Date
): SessionState {
  if (session.cancelled) return "cancelled";
  if (tab === "PAST") return "ended";
  return new Date(session.scheduledAt).getTime() <= now.getTime()
    ? "live"
    : "scheduled";
}

export interface RecordingWeek {
  weekNumber: number;
  weekTitle: string;
  items: KoskRecordingRowResponse[];
}

export interface RecordingCourse {
  courseId: string;
  courseTitle: string;
  weeks: RecordingWeek[];
}

/**
 * A page of ders kayıtları as the page draws it: by course, then by week,
 * in the order the API sent them (course, latest week first).
 */
export function groupRecordings(
  items: readonly KoskRecordingRowResponse[]
): RecordingCourse[] {
  const courses: RecordingCourse[] = [];
  for (const item of items) {
    let course = courses.find((c) => c.courseId === item.courseId);
    if (!course) {
      course = {
        courseId: item.courseId,
        courseTitle: item.courseTitle,
        weeks: [],
      };
      courses.push(course);
    }
    let week = course.weeks.find((w) => w.weekNumber === item.weekNumber);
    if (!week) {
      week = {
        weekNumber: item.weekNumber,
        weekTitle: item.weekTitle,
        items: [],
      };
      course.weeks.push(week);
    }
    week.items.push(item);
  }
  return courses;
}

/** The badge of a recording's status. */
export const recordingVariant = (
  status: string
): "success" | "warning" | "error" =>
  status === "READY" ? "success" : status === "FAILED" ? "error" : "warning";
