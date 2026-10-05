import type { MadrasahStudentResponse } from "@medaris/services/tedrisat";
import { pageOf, pageWindow } from "~/features/archive/archive";
import { ALL, isUuid } from "~/features/courses/courses";
import { shortDay } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Talebeler (nazir 10) as rules: what the list asks the API for, the pager's
 * words, and how a talebe is worded and dated as a row. Pure on purpose, so
 * that the page and the table have nothing to decide.
 */

/** The API's default; the page asks for it by name so that the pager and the list agree. */
export const STUDENT_PAGE_SIZE = 10;

/** The API takes at most 100 characters of a search. */
const SEARCH_MAX = 100;

export type StudentStatus = "ENROLLED" | "COMPLETED";

/** `?durum=` and the state it names. */
export const STATUS_PARAMS: Readonly<Record<string, StudentStatus>> = {
  devam: "ENROLLED",
  tamamladi: "COMPLETED",
};

export interface Filters {
  /** part of a name or an e-mail address; empty for everyone */
  q: string;
  /** a course's id; null for every course */
  courseId: string | null;
  status: StudentStatus | null;
  page: number;
}

export const BLANK: Filters = { q: "", courseId: null, status: null, page: 1 };

/** The filters an address names; a value nobody knows is "tümü", so a stale link never reaches the API as a 400. */
export function filtersOf(params: {
  ara?: string;
  ders?: string;
  durum?: string;
  sayfa?: string;
}): Filters {
  return {
    q: (params.ara ?? "").trim().slice(0, SEARCH_MAX),
    courseId: params.ders && isUuid(params.ders) ? params.ders : null,
    status:
      params.durum && Object.hasOwn(STATUS_PARAMS, params.durum)
        ? (STATUS_PARAMS[params.durum] ?? null)
        : null,
    page: pageOf(params.sayfa),
  };
}

export function studentsHref(madrasahId: string, filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("ara", filters.q);
  if (filters.courseId) query.set("ders", filters.courseId);
  const param = Object.entries(STATUS_PARAMS).find(
    ([, status]) => status === filters.status
  )?.[0];
  if (param) query.set("durum", param);
  if (filters.page > 1) query.set("sayfa", String(filters.page));
  const search = query.toString();
  return `/medrese/${encodeURIComponent(madrasahId)}/talebeler${search ? `?${search}` : ""}`;
}

/** What the list asks the API for. */
export const listRequest = (filters: Filters) => ({
  page: filters.page,
  limit: STUDENT_PAGE_SIZE,
  q: filters.q || undefined,
  courseId: filters.courseId ?? undefined,
  status: filters.status ?? undefined,
});

export interface FilterOption {
  value: string;
  label: string;
}

/** "Bütün dersler" and the medrese's courses. */
export const courseOptions = (
  courses: ReadonlyArray<{ id: string; title: string }>,
  t: Messages
): FilterOption[] => [
  { value: ALL, label: t("Students.filters.course.all") },
  ...courses.map((course) => ({ value: course.id, label: course.title })),
];

export const statusOptions = (t: Messages): FilterOption[] => [
  { value: ALL, label: t("Students.filters.status.all") },
  ...(["ENROLLED", "COMPLETED"] as const).map((status) => ({
    value: status,
    label: t(`Students.filters.status.${status}`),
  })),
];

/** "48 talebe": every talebe the filters match, over every page. */
export const counterOf = (total: number, t: Messages, locale: string): string =>
  t("Students.counter", { count: new Intl.NumberFormat(locale).format(total) });

// ---- the pager -----------------------------------------------------------------------

/** The last page of a list of `total`, for a link that points past it. */
export const lastPage = (total: number, limit = STUDENT_PAGE_SIZE): number =>
  Math.max(1, Math.ceil(total / limit));

export interface StudentsPager {
  /** "Sayfa 1 / 5 · 48 talebeden 1–10" */
  range: string;
  /** null on the first page: the button is drawn, but off */
  previousHref: string | null;
  nextHref: string | null;
}

/** The pager under the table: "Sayfa {page} / {pages} · {total} talebeden {from}–{to}". */
export function pagerOf(
  madrasahId: string,
  filters: Filters,
  data: { total: number; page: number; limit: number },
  t: Messages,
  locale: string
): StudentsPager {
  const numbers = new Intl.NumberFormat(locale);
  const pages = lastPage(data.total, data.limit);
  const window = pageWindow(data.total, data.page, data.limit);
  const hrefOf = (page: number) =>
    studentsHref(madrasahId, { ...filters, page });
  return {
    range: t("Students.pager.range", {
      page: numbers.format(data.page),
      pages: numbers.format(pages),
      total: numbers.format(data.total),
      from: numbers.format(window.from),
      to: numbers.format(window.to),
    }),
    previousHref: window.hasPrevious ? hrefOf(data.page - 1) : null,
    nextHref: window.hasNext ? hrefOf(data.page + 1) : null,
  };
}

// ---- the rows ------------------------------------------------------------------------

export interface StudentRow {
  userId: string;
  name: string;
  email: string | null;
  /** the titles of the courses they attend */
  ongoing: string[];
  /** the courses they finished, with the day the course team marked it, when it kept one */
  completed: Array<{ id: string; title: string; day: string | null }>;
  first: { label: string; iso: string };
  /** every course of the medrese they hold a seat in: the choices of "Yasakla" */
  courses: Array<{ id: string; title: string }>;
}

export function studentRows(
  items: readonly MadrasahStudentResponse[],
  t: Messages,
  where: { locale: string; timeZone: string; now: Date }
): StudentRow[] {
  return items.map((item) => ({
    userId: item.userId,
    name: item.name ?? item.email ?? t("Nazirs.unknownPerson"),
    email: item.email,
    ongoing: item.ongoingCourses.map((course) => course.title),
    completed: item.completedCourses.map((course) => ({
      id: course.id,
      title: course.title,
      day: course.completedAt
        ? shortDay(new Date(course.completedAt), where.now, where)
        : null,
    })),
    first: {
      label: shortDay(new Date(item.firstEnrolledAt), where.now, where),
      iso: new Date(item.firstEnrolledAt).toISOString(),
    },
    courses: [...item.ongoingCourses, ...item.completedCourses].map(
      (course) => ({ id: course.id, title: course.title })
    ),
  }));
}
