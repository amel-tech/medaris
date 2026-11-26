import type {
  ListZerothAnswerCountsRequest,
  ZerothCourseResponse,
} from "@medaris/services/tedrisat";

/**
 * Sıfırıncı soru cevapları (MDRS-299): the page's filters and the words of a
 * count. Pure, so the specs pin them without a server. The filters live in the
 * page's address, so a link opens the same counts (ui rule default-span).
 */

/** The span the page opens on (ui rule default-span). */
export const DEFAULT_SPAN_DAYS = 90;

export interface ZerothFilters {
  /** `YYYY-MM-DD` */
  from: string;
  to: string;
  kosk?: string;
  madrasah?: string;
  course?: string;
  /** a question's key: its exams are open */
  question?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[0-9a-f]{32}$/;

/** The day of a moment in Turkey, `YYYY-MM-DD`. */
const dayOf = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(at);

/** The URL's query as filters; anything unknown is dropped, a missing span is the last 90 days. */
export function parseZerothFilters(
  query: Record<string, string | string[] | undefined>,
  now: Date = new Date()
): ZerothFilters {
  const one = (key: string) => {
    const v = query[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const day = (key: string) => {
    const v = one(key);
    return v && DAY.test(v) ? v : undefined;
  };
  const id = (key: string, shape = UUID) => {
    const v = one(key);
    return v && shape.test(v) ? v : undefined;
  };
  return {
    from:
      day("from") ??
      dayOf(new Date(now.getTime() - DEFAULT_SPAN_DAYS * 86_400_000)),
    to: day("to") ?? dayOf(now),
    ...(id("kosk") ? { kosk: id("kosk") } : {}),
    ...(id("madrasah") ? { madrasah: id("madrasah") } : {}),
    ...(id("course") ? { course: id("course") } : {}),
    ...(id("question", KEY) ? { question: id("question", KEY) } : {}),
  };
}

/** Back to a query string, in a stable order and without empty keys. */
export function zerothFiltersToQuery(filters: Partial<ZerothFilters>): string {
  const params = new URLSearchParams();
  for (const key of [
    "from",
    "to",
    "kosk",
    "madrasah",
    "course",
    "question",
  ] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

/**
 * The filters as the API's query: the first day from its start and the last
 * to its end. Turkey has no summer time since 2016: a picked day starts and
 * ends at UTC+3, as the audit trail reads it. `koskId` is the page's köşk when
 * it is a köşk nazımı's.
 */
export function zerothApiQuery(
  filters: ZerothFilters,
  koskId?: string
): ListZerothAnswerCountsRequest {
  const kosk = koskId ?? filters.kosk;
  return {
    from: new Date(`${filters.from}T00:00:00+03:00`),
    to: new Date(`${filters.to}T23:59:59.999+03:00`),
    ...(kosk ? { koskId: kosk } : {}),
    ...(filters.madrasah ? { madrasahId: filters.madrasah } : {}),
    ...(filters.course ? { courseId: filters.course } : {}),
  };
}

/** The whole percentage of a count in its total; none of a total of zero. */
export function percentOf(count: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((count / total) * 100);
}

/** Whether a span's start is after its end (`YYYY-MM-DD` compare as days). */
export const spanReversed = (filters: Pick<ZerothFilters, "from" | "to">) =>
  filters.from > filters.to;

export interface IPlaceOption {
  value: string;
  label: string;
}

/** The köşk, medrese and course fields' choices, each narrowed by the ones before it. */
export function placeOptions(
  courses: readonly ZerothCourseResponse[],
  filters: Pick<ZerothFilters, "kosk" | "madrasah">
): {
  kosks: IPlaceOption[];
  madrasahs: IPlaceOption[];
  courses: IPlaceOption[];
} {
  const unique = (items: IPlaceOption[]) =>
    [...new Map(items.map((i) => [i.value, i])).values()].sort((a, b) =>
      a.label.localeCompare(b.label, "tr")
    );
  const inKosk = courses.filter(
    (c) => !filters.kosk || c.koskId === filters.kosk
  );
  const inMadrasah = inKosk.filter(
    (c) => !filters.madrasah || c.madrasahId === filters.madrasah
  );
  return {
    kosks: unique(courses.map((c) => ({ value: c.koskId, label: c.koskName }))),
    madrasahs: unique(
      inKosk.flatMap((c) =>
        c.madrasahId && c.madrasahName
          ? [{ value: c.madrasahId, label: c.madrasahName }]
          : []
      )
    ),
    courses: unique(
      inMadrasah.map((c) => ({ value: c.courseId, label: c.courseTitle }))
    ),
  };
}
