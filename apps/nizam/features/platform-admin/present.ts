import type {
  AuditScopeKind,
  AuditType,
  PlatformPolicyKey,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the platform screens (MDRS-181): köşk applications
 * (nizam 15), the audit log (17), platform settings (19) and the course
 * requests of a köşk (39). No React and no I/O, so the rules the designs state
 * can be pinned by plain specs.
 */
export const REASON_MAX = 1000;

/** The two tabs of a request list: waiting, and answered. */
export type RequestTab = "PENDING" | "DECIDED";
export const isBlank = (value: string): boolean => value.trim() === "";

// ---- answers and errors -------------------------------------------------------------

export const errorCode = (body: unknown): string | null =>
  body && typeof body === "object" && "code" in body
    ? String((body as { code: unknown }).code)
    : null;

/** The codes tedrisat answers these screens with, and the message key of each. */
const ERROR_KEYS: Record<string, string> = {
  KOSK_APPLICATION_DECIDED: "errors.answered",
  KOSK_APPLICATION_NOT_FOUND: "errors.gone",
  COURSE_REQUEST_NOT_PENDING: "errors.answered",
  COURSE_REQUEST_NOT_FOUND: "errors.gone",
  COURSE_REQUEST_COURSE_NOT_FOUND: "errors.courseGone",
  PLATFORM_POLICY_LOCKED: "errors.locked",
  AUTHZ_FORBIDDEN: "errors.forbidden",
  COURSE_REQUEST_FORBIDDEN: "errors.forbidden",
};

/** A code this screen knows gets its own sentence; anything else the generic one. */
export const failureKey = (body: unknown): string =>
  ERROR_KEYS[errorCode(body) ?? ""] ?? "errors.generic";

/** Whether the answer says the request was answered meanwhile or is gone: the row should leave the waiting list. */
export const isSettled = (body: unknown): boolean =>
  [
    "KOSK_APPLICATION_DECIDED",
    "KOSK_APPLICATION_NOT_FOUND",
    "COURSE_REQUEST_NOT_PENDING",
    "COURSE_REQUEST_NOT_FOUND",
  ].includes(errorCode(body) ?? "");

// ---- köşk applications (nizam 15) ---------------------------------------------------

/** An application's field code as the screens spell it. */
export const FIELD_LABELS: Record<string, string> = {
  ARABIC_LANGUAGE_SCIENCES: "Arapça dil ilimleri",
  RHETORIC: "Belâgat",
  FIQH: "Fıkıh",
  USUL_AL_FIQH: "Fıkıh usûlü",
  HADITH: "Hadis",
  QURAN_SCIENCES: "Kur'an ilimleri",
  TAFSIR: "Tefsir",
  AQEEDAH_KALAM: "Akaid ve kelâm",
  SEERAH: "Siyer",
  LOGIC: "Mantık",
  OTHER: "Diğer",
};

export const fieldLabel = (code: string): string => FIELD_LABELS[code] ?? code;

/** The phone line: what was given, or null so the page says "Verilmedi". */
export const phoneOrNull = (phone: string | null | undefined): string | null =>
  phone && phone.trim() !== "" ? phone : null;

/** What the "Köşk aç" form is filled with from an application. */
export function openFormFromApplication(a: { name: string; summary: string }) {
  return {
    name: a.name,
    description: a.summary,
  };
}

// ---- audit log (nizam 17) -----------------------------------------------------------

export const AUDIT_TYPE_OPTIONS: readonly AuditType[] = [
  "CONTENT_READ",
  "PRIVATE_DECK_READ",
  "PERSONAL_DATA_READ",
  "USER_LOOKUP",
  "GRANT",
  "ROLE_CHANGE",
  "POLICY_CHANGE",
  "BAN",
  "HIDE",
  "HOSTING",
  "TAKEOVER",
  "APPEAL",
  "PERMANENT_BAN",
  "PERMANENT_DELETE",
  "EXPORT",
];

export const AUDIT_SCOPE_OPTIONS: readonly AuditScopeKind[] = [
  "PLATFORM",
  "KOSK",
  "MADRASAH",
];

export const AUDIT_RANGES = ["24h", "7d", "30d", "custom"] as const;
export type AuditRange = (typeof AUDIT_RANGES)[number];

/** What the page's URL carries; every key is optional and an absent one means "all". */
export interface AuditFilters {
  actor?: string;
  type?: AuditType;
  scope?: AuditScopeKind;
  range?: AuditRange;
  /** `YYYY-MM-DD`, with `range=custom` */
  from?: string;
  to?: string;
}

const pick = <T extends string>(
  value: string | undefined,
  allowed: readonly T[]
): T | undefined => allowed.find((a) => a === value);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The URL's query as filters; anything unknown is dropped rather than sent to the API. */
export function parseAuditFilters(
  query: Record<string, string | string[] | undefined>
): AuditFilters {
  const one = (key: string) => {
    const v = query[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const range = pick(one("range"), AUDIT_RANGES);
  const from = one("from");
  const to = one("to");
  return {
    actor: one("actor"),
    type: pick(one("type"), AUDIT_TYPE_OPTIONS),
    scope: pick(one("scope"), AUDIT_SCOPE_OPTIONS),
    range,
    ...(range === "custom" && from && DAY.test(from) ? { from } : {}),
    ...(range === "custom" && to && DAY.test(to) ? { to } : {}),
  };
}

/** Back to a query string for the URL, in a stable order and without empty keys. */
export function auditFiltersToQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const key of [
    "actor",
    "type",
    "scope",
    "range",
    "from",
    "to",
  ] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return params.toString();
}

const HOUR = 3_600_000;
/** Turkey has no summer time since 2016: a picked day starts and ends at UTC+3. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
const dayEnd = (day: string) => new Date(`${day}T23:59:59.999+03:00`);

/** The filters as the API's query: the range becomes a `from` and `to` moment. */
export function auditApiQuery(
  filters: AuditFilters,
  now: Date = new Date()
): {
  actor?: string;
  type?: AuditType;
  scope?: AuditScopeKind;
  from?: Date;
  to?: Date;
} {
  const since = (hours: number) => new Date(now.getTime() - hours * HOUR);
  let from: Date | undefined;
  let to: Date | undefined;
  if (filters.range === "24h") from = since(24);
  else if (filters.range === "7d") from = since(24 * 7);
  else if (filters.range === "30d") from = since(24 * 30);
  else if (filters.range === "custom") {
    if (filters.from) from = dayStart(filters.from);
    if (filters.to) to = dayEnd(filters.to);
  }
  return {
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

/** The export link of the same filters, through the page's own route. */
export function auditExportHref(filters: AuditFilters): string {
  const q = auditFiltersToQuery(filters);
  return `/api/audit-log/export${q ? `?${q}` : ""}`;
}

/** "Bugün 21:10", "Dün 09:03" or "29 Eyl 21:10": the day word is the caller's to translate. */
export function auditTime(
  at: Date | string,
  now: Date,
  opts: { locale: string; timeZone: string }
): { day: "today" | "yesterday" | null; date: string; time: string } {
  const date = typeof at === "string" ? new Date(at) : at;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: opts.timeZone }).format(d);
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * HOUR));
  const key = dayKey(date);
  return {
    day: key === today ? "today" : key === yesterday ? "yesterday" : null,
    date: new Intl.DateTimeFormat(opts.locale, {
      timeZone: opts.timeZone,
      day: "numeric",
      month: "short",
    }).format(date),
    time: new Intl.DateTimeFormat(opts.locale, {
      timeZone: opts.timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

/** The "#12" of a record. */
export const recordNumber = (n: number): string => `#${n}`;

/** The detail line under a record's kind: the name or title its writer kept, or nothing. */
export function auditDetail(details: Record<string, unknown>): string | null {
  for (const key of ["name", "title", "reason"] as const) {
    const value = details[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.length > 90 ? `${value.slice(0, 89)}…` : value;
    }
  }
  return null;
}

/** The short name in the "Kim" column: the first two initials of the person. */
export function shortName(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";
  const letters =
    parts.length > 1
      ? `${first.charAt(0)}${last.charAt(0)}`
      : first.slice(0, 2);
  return letters.toLocaleUpperCase("tr-TR") || "?";
}

// ---- platform settings (nizam 19) ---------------------------------------------------

export const POLICY_KEYS: readonly PlatformPolicyKey[] = [
  "ALWAYS_REQUIRE_APPROVAL",
  "RECORDINGS_NEVER_PUBLIC",
];

export interface PolicyState {
  key: string;
  enabled: boolean;
}

/** The list with one switch moved: what the page shows the moment it is pressed. */
export function withPolicy<T extends PolicyState>(
  items: readonly T[],
  key: string,
  enabled: boolean
): T[] {
  return items.map((p) => (p.key === key ? { ...p, enabled } : p));
}

// ---- course requests (nizam 39) -----------------------------------------------------

/** The course form's fields a request fills in: the request's own title. */
export const courseFormFromRequest = (r: { title: string }) => ({
  title: r.title,
});

/** The path "Kabul et" opens: the course form with the request named in the query. */
export const newCourseHref = (koskId: string, requestId: string): string =>
  `/kosks/${koskId}/courses/new?talep=${requestId}`;
