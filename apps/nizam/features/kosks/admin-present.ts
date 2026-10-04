import type {
  CreateKoskDto,
  KoskDirectoryItemResponse,
  KoskLevel,
  KoskListingFilter,
  KoskResponse,
  KoskStatus,
  KoskStatusFilter,
  UpdateKoskDto,
} from "@medaris/services/tedrisat";
import type { BadgeVariant } from "@medaris/ui/mds/badge";
import {
  type CoverTone,
  TONE_HUE,
  toneOfHue,
} from "@medaris/ui/mds/cover-pattern";
import type { IconName } from "@medaris/ui/mds/icon";
import { cleanHandle, HANDLE_PATTERN } from "../madrasahs/present";
import { KOSK_FORM_LIMITS } from "./kosk-form";

/**
 * Pure helpers behind Köşkler, Köşk aç, Köşk ayarları and Köşk nazımları
 * (nizam 09, 10, 24, 25 and 21, MDRS-174): the filters as the URL writes them,
 * how a status, a nazım list and a post's end read, the cover names and the
 * hues behind them, the forms' rules and the payloads they send. No React and
 * no I/O, so the sentences and rules the designs show can be pinned by plain
 * specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

export const DIRECTORY_PAGE_SIZE = 12;

// ---- the filters in the URL -------------------------------------------------

export const STATUS_TABS: KoskStatusFilter[] = [
  "ALL",
  "ACTIVE",
  "PASSIVE",
  "HIDDEN",
];

const STATUS_PARAM: Record<string, KoskStatusFilter> = {
  etkin: "ACTIVE",
  pasif: "PASSIVE",
  gizli: "HIDDEN",
};
const STATUS_TO_PARAM: Partial<Record<KoskStatusFilter, string>> = {
  ACTIVE: "etkin",
  PASSIVE: "pasif",
  HIDDEN: "gizli",
};
const LEVEL_PARAM: Record<string, KoskLevel> = {
  baslangic: "BEGINNER",
  orta: "INTERMEDIATE",
  ileri: "ADVANCED",
};
const LEVEL_TO_PARAM: Partial<Record<KoskLevel, string>> = {
  BEGINNER: "baslangic",
  INTERMEDIATE: "orta",
  ADVANCED: "ileri",
};
const LISTING_PARAM: Record<string, KoskListingFilter> = {
  listelenen: "LISTED",
  listelenmeyen: "UNLISTED",
};
const LISTING_TO_PARAM: Partial<Record<KoskListingFilter, string>> = {
  LISTED: "listelenen",
  UNLISTED: "listelenmeyen",
};

/** The levels the "Seviye" filter lists; "Bütün seviyeler" is a level a köşk may have, not a filter. */
export const LEVEL_FILTERS: KoskLevel[] = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
];
export const LISTING_CHIPS: KoskListingFilter[] = ["ALL", "LISTED", "UNLISTED"];

export interface DirectoryFilters {
  status: KoskStatusFilter;
  level?: KoskLevel;
  field?: string;
  listing: KoskListingFilter;
  q: string;
  page: number;
}

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

/** The filters a `?durum=&seviye=&alan=&gorunurluk=&q=&sayfa=` stands for; anything unknown is unset. */
export function filtersFromParams(
  params: Record<string, Param>
): DirectoryFilters {
  const page = Number.parseInt(first(params.sayfa) ?? "", 10);
  return {
    status: STATUS_PARAM[first(params.durum)?.toLowerCase() ?? ""] ?? "ALL",
    level: LEVEL_PARAM[first(params.seviye)?.toLowerCase() ?? ""],
    field: first(params.alan)?.trim().slice(0, 100) || undefined,
    listing:
      LISTING_PARAM[first(params.gorunurluk)?.toLowerCase() ?? ""] ?? "ALL",
    q: (first(params.q) ?? "").trim().slice(0, 100),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** The list's address for a set of filters, without the locale. */
export function directoryPath(filters: DirectoryFilters): string {
  const params = new URLSearchParams();
  const durum = STATUS_TO_PARAM[filters.status];
  if (durum) params.set("durum", durum);
  const seviye = filters.level ? LEVEL_TO_PARAM[filters.level] : undefined;
  if (seviye) params.set("seviye", seviye);
  if (filters.field) params.set("alan", filters.field);
  const gorunurluk = LISTING_TO_PARAM[filters.listing];
  if (gorunurluk) params.set("gorunurluk", gorunurluk);
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.page > 1) params.set("sayfa", String(filters.page));
  const query = params.toString();
  return query ? `/kosks?${query}` : "/kosks";
}

/** A filter changes: the page starts over. */
export const withFilter = (
  filters: DirectoryFilters,
  change: Partial<DirectoryFilters>
): DirectoryFilters => ({ ...filters, ...change, page: 1 });

/** What `GET /kosks/directory` is asked for. */
export function directoryQuery(filters: DirectoryFilters) {
  return {
    status: filters.status,
    level: filters.level,
    field: filters.field,
    listing: filters.listing,
    q: filters.q || undefined,
    page: filters.page,
    limit: DIRECTORY_PAGE_SIZE,
  };
}

export const pageCount = (total: number, limit = DIRECTORY_PAGE_SIZE) =>
  Math.max(1, Math.ceil(total / limit));

// ---- how a row reads --------------------------------------------------------------

/** How a status is drawn in the Durum column. Hidden is plain text with its glyph, as in the design. */
export const STATUS_LOOK: Record<
  KoskStatus,
  { badge: BadgeVariant | null; icon: IconName | null }
> = {
  ACTIVE: { badge: "secondary", icon: null },
  PASSIVE: { badge: "warning", icon: "lock" },
  HIDDEN: { badge: null, icon: "eyeOff" },
};

/**
 * The nazımları of a row, "A ve B"; "" when it has none. The viewer is told
 * apart by `isViewer`, not by the name, because two people may share one.
 */
export function nazimNames(
  nazims: KoskDirectoryItemResponse["nazims"],
  locale: string,
  unknown: string
): string {
  const names = nazims.map((n) => n.name ?? n.email ?? unknown);
  if (names.length === 0) return "";
  try {
    return new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** Whether the signed-in person is one of the row's nazımları (the row then says "Siz"). */
export const isNazimOf = (
  nazims: KoskDirectoryItemResponse["nazims"],
  viewerId: string | null
): boolean =>
  viewerId !== null &&
  nazims.some((n) => n.id.toLowerCase() === viewerId.toLowerCase());

/** The short name as the table prints it: "@beyazit"; nothing when there is none. */
export const handleLabel = (
  handle: string | null | undefined
): string | null => (handle ? `@${handle.replace(/^@+/, "")}` : null);

/** The second line of a Gizli or Pasif status: "24 Eylül’den beri" is built by the view from `since`. */
export const isHidden = (status: KoskStatus) => status === "HIDDEN";

// ---- the cover -------------------------------------------------------------------

export const COVER_TONES: CoverTone[] = [
  "laciverd",
  "bordo",
  "zumrut",
  "murekkep",
];

/** The hue table and the nearest-tone rule live with the cover itself, shared with tedris. */
export { TONE_HUE, toneOfHue };

// ---- the fixed lists -------------------------------------------------------------

/** nizam/10 and nizam/24: the fields a köşk can be in. The API takes free text; the screens offer these. */
export const KOSK_FIELDS = [
  "Arapça dil ilimleri",
  "Belâgat",
  "Fıkıh",
  "Fıkıh usûlü",
  "Hadis",
  "Kur'an ilimleri",
  "Tefsir",
  "Akaid ve kelâm",
  "Siyer",
  "Mantık",
  "Diğer",
];

/** The levels a form offers, "Bütün seviyeler" first. */
export const FORM_LEVELS: KoskLevel[] = [
  "ALL",
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
];

/** The field options, with the köşk's own value kept when it is not in the list (an older köşk). */
export function fieldOptions(current?: string | null): string[] {
  return current && !KOSK_FIELDS.includes(current)
    ? [current, ...KOSK_FIELDS]
    : KOSK_FIELDS;
}

// ---- tags -------------------------------------------------------------------------

/**
 * "Akaid, Kelâm, Akaid-i Nesefî" to a list: split on commas, trimmed, blanks
 * and repeats (compared without case, as `tr-TR` lower-cases) dropped.
 */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(/[,،]/)) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase("tr-TR");
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export type TagsProblem = "tagsFull" | "tagTooLong" | null;

export function tagsProblem(tags: string[]): TagsProblem {
  if (tags.length > KOSK_FORM_LIMITS.tagsMax) return "tagsFull";
  if (tags.some((t) => t.length > KOSK_FORM_LIMITS.tagMax)) {
    return "tagTooLong";
  }
  return null;
}

// ---- Köşk aç (nizam/10) ----------------------------------------------------------

export type KoskFieldError =
  | "nameRequired"
  | "nameShort"
  | "handleInvalid"
  | "fieldRequired"
  | "levelRequired"
  | "tagsFull"
  | "tagTooLong";

export interface OpenKoskForm {
  name: string;
  handle: string;
  field: string;
  level: KoskLevel | "";
  tags: string;
  description: string;
  tone: CoverTone;
  /** "Listelerde gösterme" */
  unlisted: boolean;
  nazimIds: string[];
}

export const emptyOpenForm = (): OpenKoskForm => ({
  name: "",
  handle: "",
  field: "",
  level: "",
  tags: "",
  description: "",
  tone: "laciverd",
  unlisted: false,
  nazimIds: [],
});

export function nameError(name: string): KoskFieldError | null {
  const n = name.trim();
  if (n.length === 0) return "nameRequired";
  if (n.length < KOSK_FORM_LIMITS.nameMin) return "nameShort";
  return null;
}

/** An empty short name is allowed; a typed one must fit. */
export function handleError(handle: string): KoskFieldError | null {
  const h = cleanHandle(handle);
  return h === "" || HANDLE_PATTERN.test(h) ? null : "handleInvalid";
}

/** The first thing wrong with a form, per field; the button stays off while any is. */
export function openErrors(
  form: OpenKoskForm
): Partial<
  Record<"name" | "handle" | "field" | "level" | "tags", KoskFieldError>
> {
  const errors: Partial<
    Record<"name" | "handle" | "field" | "level" | "tags", KoskFieldError>
  > = {};
  const name = nameError(form.name);
  if (name) errors.name = name;
  const handle = handleError(form.handle);
  if (handle) errors.handle = handle;
  if (form.field === "") errors.field = "fieldRequired";
  if (form.level === "") errors.level = "levelRequired";
  const tags = tagsProblem(parseTags(form.tags));
  if (tags) errors.tags = tags;
  return errors;
}

/** "Köşk aç" is off until the name, field, level and at least one nazım are right. */
export const canOpen = (form: OpenKoskForm): boolean =>
  Object.keys(openErrors(form)).length === 0 && form.nazimIds.length > 0;

/** The body `POST /kosks` takes; empty optional fields are left out. */
export function openPayload(form: OpenKoskForm): CreateKoskDto {
  const handle = cleanHandle(form.handle);
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    ...(handle ? { handle } : {}),
    field: form.field,
    level: form.level as KoskLevel,
    tags: parseTags(form.tags),
    ...(description ? { description } : {}),
    coverHue: TONE_HUE[form.tone],
    isPrivate: form.unlisted,
    managerUserIds: form.nazimIds,
  };
}

/** Adds a person once: choosing the same account again leaves the list as it is. */
export function addNazim<T extends { id: string }>(list: T[], person: T): T[] {
  return list.some((p) => p.id.toLowerCase() === person.id.toLowerCase())
    ? list
    : [...list, person];
}

// ---- Köşk ayarları (nizam/24) ----------------------------------------------------

export interface SettingsForm {
  name: string;
  field: string;
  level: KoskLevel | "";
  tags: string;
  tone: CoverTone;
  description: string;
  unlisted: boolean;
  alwaysRequireApproval: boolean;
  recordingsNeverPublic: boolean;
}

const LEVELS: string[] = ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"];

/** The form as the köşk is now. A level or field the API holds that the lists do not offer stays as it is. */
export function settingsFromKosk(
  kosk: Pick<
    KoskResponse,
    | "name"
    | "field"
    | "level"
    | "tags"
    | "coverHue"
    | "description"
    | "isPrivate"
    | "alwaysRequireApproval"
    | "recordingsNeverPublic"
  >
): SettingsForm {
  return {
    name: kosk.name,
    field: kosk.field ?? "",
    level: LEVELS.includes(kosk.level ?? "") ? (kosk.level as KoskLevel) : "",
    tags: kosk.tags.join(", "),
    tone: toneOfHue(kosk.coverHue),
    description: kosk.description ?? "",
    unlisted: kosk.isPrivate,
    alwaysRequireApproval: kosk.alwaysRequireApproval,
    recordingsNeverPublic: kosk.recordingsNeverPublic,
  };
}

/** The first thing wrong with each field of the settings form; "Kaydet" sends nothing while any is. */
export function settingsErrors(
  form: SettingsForm
): Partial<Record<"name" | "field" | "level" | "tags", KoskFieldError>> {
  const errors: Partial<
    Record<"name" | "field" | "level" | "tags", KoskFieldError>
  > = {};
  const name = nameError(form.name);
  if (name) errors.name = name;
  if (form.field === "") errors.field = "fieldRequired";
  if (form.level === "") errors.level = "levelRequired";
  const tags = tagsProblem(parseTags(form.tags));
  if (tags) errors.tags = tags;
  return errors;
}

/**
 * What changed since the köşk was read, as the `PATCH /kosks/:id` body — only
 * the fields that differ. The cover is left alone while the chosen name is the
 * one the stored hue already looks like, so saving an older köşk does not
 * repaint it. An emptied description is sent as `null`, which clears it.
 */
export function settingsPayload(
  form: SettingsForm,
  kosk: Parameters<typeof settingsFromKosk>[0]
): UpdateKoskDto {
  const before = settingsFromKosk(kosk);
  const dto: UpdateKoskDto = {};
  if (form.name.trim() !== before.name) dto.name = form.name.trim();
  if (form.field !== before.field) dto.field = form.field;
  if (form.level !== before.level && form.level !== "") dto.level = form.level;
  if (form.tags !== before.tags) dto.tags = parseTags(form.tags);
  if (form.tone !== before.tone) dto.coverHue = TONE_HUE[form.tone];
  if (form.description.trim() !== before.description.trim()) {
    dto.description = form.description.trim() || null;
  }
  if (form.unlisted !== before.unlisted) dto.isPrivate = form.unlisted;
  if (form.alwaysRequireApproval !== before.alwaysRequireApproval) {
    dto.alwaysRequireApproval = form.alwaysRequireApproval;
  }
  if (form.recordingsNeverPublic !== before.recordingsNeverPublic) {
    dto.recordingsNeverPublic = form.recordingsNeverPublic;
  }
  return dto;
}

export const isDirty = (
  form: SettingsForm,
  kosk: Parameters<typeof settingsFromKosk>[0]
): boolean => Object.keys(settingsPayload(form, kosk)).length > 0;

// ---- Köşk nazımları (nizam/25, 21) -------------------------------------------------

/** "Süresiz" when the post has no end, else the date as the page's locale writes it. */
export function termLabel(
  endsAt: Date | string | null | undefined,
  opts: { locale: string; timeZone: string; unlimited: string }
): string {
  if (!endsAt) return opts.unlimited;
  return new Intl.DateTimeFormat(opts.locale, {
    timeZone: opts.timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(endsAt));
}

/** `YYYY-MM-DD` of a date in a zone, for the date input's `min`. */
export function isoDay(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

/** A chosen day is in the past when it is before today in the viewer's zone. */
export const isPastDay = (day: string, now: Date, timeZone: string): boolean =>
  day !== "" && day < isoDay(now, timeZone);

/** The end of the chosen day in the viewer's zone, as the instant the API takes; "" is no end. */
export function endsAtOf(day: string, timeZone: string): string | undefined {
  if (!day) return undefined;
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const wallEnd = Date.UTC(y, m - 1, d, 23, 59, 59);
  return new Date(
    wallEnd - zoneOffsetMs(new Date(wallEnd), timeZone)
  ).toISOString();
}

/** How far a zone's wall clock is ahead of UTC at an instant, in milliseconds. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts: Record<string, number> = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)])
  );
  const wall = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * "Nûruosmaniye Köşkü’nün" (genitive) or "Nûruosmaniye Köşkü’nü" (accusative):
 * a Turkish köşk name takes its ending by how it ends, so "{kosk} köşkünün"
 * cannot be one fixed string. A name that does not end in "Köşkü" or "Köşk"
 * gets "… köşkünün" / "… köşkünü". Other languages get the bare name; their
 * own messages carry the preposition.
 */
export function koskCase(
  name: string,
  locale: string,
  kind: "genitive" | "accusative"
): string {
  if (!locale.toLowerCase().startsWith("tr")) return name;
  const [afterU, afterConsonant] =
    kind === "genitive" ? ["’nün", "’ün"] : ["’nü", "’ü"];
  if (/köşkü$/iu.test(name)) return `${name}${afterU}`;
  if (/köşk$/iu.test(name)) return `${name}${afterConsonant}`;
  return `${name} ${kind === "genitive" ? "köşkünün" : "köşkünü"}`;
}

// ---- refusals ------------------------------------------------------------------------

const KNOWN: Record<string, string> = {
  KOSK_HANDLE_TAKEN: "errors.handleTaken",
  KOSK_NAZIM_EXISTS: "errors.nazimExists",
  KOSK_NAZIM_UNKNOWN_ACCOUNT: "errors.unknownAccount",
  KOSK_ALREADY_HIDDEN: "errors.alreadyHidden",
  KOSK_NOT_HIDDEN: "errors.notHidden",
  KOSK_ALREADY_PASSIVE: "errors.alreadyPassive",
  KOSK_NOT_FOUND: "errors.notFound",
  GRANT_EXPIRY_INVALID: "errors.endPast",
  AUTHZ_FORBIDDEN: "errors.forbidden",
  // A restore by a lower level than the one that hid it (MDRS-143).
  ARCHIVE_RESTORE_LEVEL: "errors.restoreLevel",
};

/** The namespace key for a refusal's code, or the generic one. */
export function koskErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}
