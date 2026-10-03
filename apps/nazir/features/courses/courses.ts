import type {
  MadrasahCourseKoskResponse,
  MadrasahCourseListItemResponse,
  OpenMadrasahCourseDto,
} from "@medaris/services/tedrisat";
import { dayKey } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";
import {
  type Member,
  type Team,
  teamOf,
  teamProblem,
  teamRequest,
} from "./team";

/**
 * Dersler, Medrese dersi aç and Dersi gizle (nazir 07, 08, 18) as rules: what
 * the list asks the API for, how a course is worded and dated as a row, the
 * sentences of the hiding question, and what the opening form allows and sends.
 * Pure on purpose, so that the pages and the dialogs have nothing to decide.
 */

// ---- the list's filters ------------------------------------------------------------

export type CourseStatus = MadrasahCourseListItemResponse["status"];

export interface Filters {
  /** a köşk's id; null for every köşk */
  kosk: string | null;
  status: CourseStatus | null;
}

/** `?durum=` and the status it names. */
export const STATUS_PARAMS: Readonly<Record<string, CourseStatus>> = {
  yayinda: "PUBLISHED",
  taslak: "DRAFT",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID.test(value);

/** The filters an address names; a value nobody knows is "tümü", so a stale link never reaches the API as a 400. */
export function filtersOf(params: { kosk?: string; durum?: string }): Filters {
  return {
    kosk: params.kosk && isUuid(params.kosk) ? params.kosk : null,
    status:
      params.durum && Object.hasOwn(STATUS_PARAMS, params.durum)
        ? (STATUS_PARAMS[params.durum] ?? null)
        : null,
  };
}

const medreseHref = (madrasahId: string): string =>
  `/medrese/${encodeURIComponent(madrasahId)}`;

export function coursesHref(madrasahId: string, filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.kosk) query.set("kosk", filters.kosk);
  const param = Object.entries(STATUS_PARAMS).find(
    ([, status]) => status === filters.status
  )?.[0];
  if (param) query.set("durum", param);
  const search = query.toString();
  return `${medreseHref(madrasahId)}/dersler${search ? `?${search}` : ""}`;
}

export const openCourseHref = (madrasahId: string): string =>
  `${medreseHref(madrasahId)}/dersler/yeni`;

/** Nazir 09's page, which MDRS-187 builds at the address its spec proposes. */
export const offsiteRequestHref = (madrasahId: string): string =>
  `${medreseHref(madrasahId)}/dersler/talep`;

export const ALL = "all";

export interface FilterOption {
  value: string;
  label: string;
}

/** The köşk filter lists every köşk that hosts the medrese, not only those of the courses on screen. */
export const koskOptions = (
  kosks: readonly Pick<MadrasahCourseKoskResponse, "id" | "name">[],
  t: Messages
): FilterOption[] => [
  { value: ALL, label: t("Courses.filters.kosk.all") },
  ...kosks.map((kosk) => ({
    value: kosk.id,
    label: t("Courses.filters.kosk.one", { name: kosk.name }),
  })),
];

export const statusOptions = (t: Messages): FilterOption[] => [
  { value: ALL, label: t("Courses.filters.status.all") },
  ...(["PUBLISHED", "DRAFT"] as const).map((status) => ({
    value: status,
    label: t(`Courses.filters.status.${status}`),
  })),
];

/** "3 ders · 2 köşkte": the courses listed and the köşks they are in. */
export function counterOf(
  items: ReadonlyArray<Pick<MadrasahCourseListItemResponse, "koskId">>,
  t: Messages
): string {
  if (items.length === 0) return t("Courses.counterNone");
  return t("Courses.counter", {
    courses: items.length,
    kosks: new Set(items.map((item) => item.koskId.toLowerCase())).size,
  });
}

// ---- Turkish words that depend on a name ---------------------------------------------

/** The vowel a harmony of four takes after each vowel. */
const FOUR_WAY: Readonly<Record<string, string>> = {
  a: "ı",
  ı: "ı",
  â: "ı",
  e: "i",
  i: "i",
  î: "i",
  o: "u",
  u: "u",
  û: "u",
  ö: "ü",
  ü: "ü",
};

/**
 * "Nûruosmaniye Köşkü’nün": the genitive of a name, whose ending follows its
 * last vowel and, after a vowel, takes a buffer n. In another language the
 * name is returned as it is and the message carries the possessive. A name that
 * ends in no letter is left alone rather than guessed at.
 */
export function genitive(name: string, locale: string): string {
  const base = name.trim();
  if (!locale.toLowerCase().startsWith("tr") || base === "") return base;
  const letters = Array.from(base.toLocaleLowerCase("tr"));
  const last = letters[letters.length - 1] ?? "";
  const vowel = [...letters].reverse().find((c) => Object.hasOwn(FOUR_WAY, c));
  if (!vowel || !/\p{L}/u.test(last)) return base;
  const buffer = Object.hasOwn(FOUR_WAY, last) ? "n" : "";
  return `${base}’${buffer}${FOUR_WAY[vowel]}n`;
}

// ---- the rows ----------------------------------------------------------------------

/** What the hiding question says (nazir 18): who is hidden from, and how many talebe lose the course. */
export interface HideWords {
  /** "talebelerden, ziyaretçilerden ve Nûruosmaniye Köşkü’nün sayfasından gizlenecek; …" */
  rest: string;
  /** "35 talebe celselere ve ders kayıtlarına erişemez."; null while nobody is enrolled */
  affected: string | null;
}

export function hideWords(
  course: Pick<MadrasahCourseListItemResponse, "koskName" | "studentCount">,
  t: Messages,
  locale: string
): HideWords {
  return {
    rest: t("HideCourse.rest", {
      kosk: course.koskName,
      koskGenitive: genitive(course.koskName, locale),
    }),
    affected:
      course.studentCount > 0
        ? t("HideCourse.affected", { count: course.studentCount })
        : null,
  };
}

/** One line of the list, already worded and dated, so that the table has nothing to translate. */
export interface CourseRow {
  id: string;
  title: string;
  /** the course's own page, while the caller holds a scope there */
  href: string | null;
  koskName: string;
  /** "Nûruosmaniye Köşkü · bugün açıldı" */
  meta: string;
  muderris: Array<{ name: string; imam: boolean }>;
  /** the list the dialog of nazir 17 starts from */
  team: Member[];
  students: {
    /** the enrolled talebe, as the page's locale writes a number */
    count: string;
    /** "2 onay bekliyor"; null while nobody waits */
    pending: string | null;
    /** nobody is enrolled and nobody waits: a draft has nobody to speak of yet */
    none: "draft" | "published" | null;
  };
  status: CourseStatus;
  statusLabel: string;
  hide: HideWords;
}

export function courseRows(
  items: readonly MadrasahCourseListItemResponse[],
  t: Messages,
  where: {
    locale: string;
    timeZone: string;
    now: Date;
    /** the ids of the courses the caller holds a scope in, lower case */
    held: ReadonlySet<string>;
  }
): CourseRow[] {
  const today = dayKey(where.now, where.timeZone);
  const numbers = new Intl.NumberFormat(where.locale);
  return items.map((item) => {
    const openedToday =
      dayKey(new Date(item.createdAt), where.timeZone) === today;
    const empty = item.studentCount === 0 && item.pendingCount === 0;
    return {
      id: item.id,
      title: item.title,
      href: where.held.has(item.id.toLowerCase())
        ? `/ders/${encodeURIComponent(item.id)}`
        : null,
      koskName: item.koskName,
      meta: [item.koskName, openedToday ? t("Courses.openedToday") : null]
        .filter(Boolean)
        .join(" · "),
      muderris: item.muderris.map((m) => ({ name: m.name, imam: m.isImam })),
      team: item.muderris.map((m) => ({
        userId: m.userId,
        name: m.name,
        email: m.email,
        isImam: m.isImam,
      })),
      students: {
        count: numbers.format(item.studentCount),
        pending:
          item.pendingCount > 0
            ? t("Courses.pending", { count: item.pendingCount })
            : null,
        none: empty ? (item.status === "DRAFT" ? "draft" : "published") : null,
      },
      status: item.status,
      statusLabel: t(`Courses.status.${item.status}`),
      hide: hideWords(item, t, where.locale),
    };
  });
}

/** The köşk in the side list: its field and how many of the medrese's courses it holds. */
export const hostLine = (
  kosk: Pick<MadrasahCourseKoskResponse, "field" | "courseCount">,
  t: Messages
): string =>
  [kosk.field, t("Courses.hosts.courses", { count: kosk.courseCount })]
    .filter(Boolean)
    .join(" · ");

// ---- Medrese dersi aç ----------------------------------------------------------------

export const TITLE_MIN = 2;
export const TITLE_MAX = 200;

export type TitleProblem = "required" | "short" | "long";

/** The first thing wrong with the name: blank, too short or too long, as the API counts it (trimmed). */
export function titleProblem(title: string): TitleProblem | null {
  const length = title.trim().length;
  if (length === 0) return "required";
  if (length < TITLE_MIN) return "short";
  return length > TITLE_MAX ? "long" : null;
}

/** The köşk's line in the choice: its field and what the medrese already has there. */
export const koskChoiceLine = (
  kosk: Pick<MadrasahCourseKoskResponse, "field" | "courseCount">,
  t: Messages
): string =>
  [
    kosk.field,
    kosk.courseCount > 0
      ? t("OpenCourse.kosk.courses", { count: kosk.courseCount })
      : t("OpenCourse.kosk.noCourses"),
  ]
    .filter(Boolean)
    .join(" · ");

/** The medrese's policies that fix an answer of the form: it is on and cannot be turned off. */
export interface Locks {
  closed: boolean;
  approval: boolean;
}

/** A policy that could not be read locks nothing here; the server applies it all the same. */
export const locksOf = (
  policies: { closedCourseRequired: boolean; alwaysApproval: boolean } | null
): Locks => ({
  closed: policies?.closedCourseRequired ?? false,
  approval: policies?.alwaysApproval ?? false,
});

export interface OpenForm {
  koskId: string | null;
  title: string;
  team: Team;
  closed: boolean;
  approval: boolean;
}

export interface OpenProblems {
  kosk: boolean;
  title: TitleProblem | null;
  team: ReturnType<typeof teamProblem>;
}

/** What keeps the form from being sent; null when it can be. */
export function openProblems(form: OpenForm): OpenProblems | null {
  const problems: OpenProblems = {
    kosk: form.koskId === null,
    title: titleProblem(form.title),
    team: teamProblem(form.team),
  };
  return problems.kosk || problems.title || problems.team ? problems : null;
}

/** The body of the POST: the name trimmed, and a locked answer sent as the form shows it, on. */
export function openRequest(
  form: OpenForm,
  locks: Locks
): OpenMadrasahCourseDto {
  return {
    koskId: form.koskId as string,
    title: form.title.trim(),
    ...teamRequest(form.team),
    closedCourse: form.closed || locks.closed,
    requiresApproval: form.approval || locks.approval,
  };
}

/** A new, empty form: the first köşk chosen, as the design draws it. */
export const blankForm = (
  kosks: ReadonlyArray<Pick<MadrasahCourseKoskResponse, "id">>
): OpenForm => ({
  koskId: kosks[0]?.id ?? null,
  title: "",
  team: teamOf([]),
  closed: false,
  approval: false,
});

/** The message key of a refused call, from the code the API answered with. */
export function courseErrorKey(code: string): string {
  switch (code) {
    case "HOSTING_RIGHT_REQUIRED":
      return "Courses.errors.hostingRight";
    case "MUDERRIS_UNKNOWN_USER":
      return "Courses.errors.unknownUser";
    case "COURSE_IMAM_REQUIRED":
    case "COURSE_IMAM_NOT_LISTED":
      return "Courses.errors.imam";
    case "MUDERRIS_DUPLICATE_USER":
      return "Courses.errors.duplicate";
    case "VALIDATION_ERROR":
      return "Courses.errors.invalid";
    case "MADRASAH_COURSE_NOT_FOUND":
      return "Courses.errors.gone";
    case "MADRASAH_COURSE_ALREADY_HIDDEN":
      return "HideCourse.already";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}
