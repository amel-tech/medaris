import type { CourseArchiveCountsResponse } from "@medaris/services/tedrisat";

/**
 * Arşiv of one course (MDRS-143): the weeks and sessions its team hid, by tab.
 * The table, its pager and "Geri al" are the medrese Arşiv's (`features/archive`),
 * which says who may bring each row back; only the tabs and the addresses are
 * a course's own. Pure on purpose, so the page has nothing to decide.
 */
export type CourseArchiveTabId = "all" | "weeks" | "sessions";

export interface CourseArchiveTab {
  id: CourseArchiveTabId;
  /** `?tur=`; none for "Tümü" */
  param: string | null;
  /** the API's `types` */
  types: string | undefined;
  count: (counts: CourseArchiveCountsResponse) => number;
}

export const COURSE_ARCHIVE_TABS: readonly CourseArchiveTab[] = [
  { id: "all", param: null, types: undefined, count: (c) => c.all },
  { id: "weeks", param: "hafta", types: "week", count: (c) => c.week },
  { id: "sessions", param: "celse", types: "session", count: (c) => c.session },
];

/** The tab a `?tur=` names; a value nobody knows is "Tümü". */
export const courseTabOf = (param: string | undefined): CourseArchiveTab =>
  COURSE_ARCHIVE_TABS.find(
    (tab) => tab.param !== null && tab.param === param
  ) ?? (COURSE_ARCHIVE_TABS[0] as CourseArchiveTab);

export function courseArchiveHref(
  courseId: string,
  tab: Pick<CourseArchiveTab, "param">,
  page: number
): string {
  const query = new URLSearchParams();
  if (tab.param) query.set("tur", tab.param);
  if (page > 1) query.set("sayfa", String(page));
  const search = query.toString();
  return `/ders/${encodeURIComponent(courseId)}/arsiv${search ? `?${search}` : ""}`;
}
