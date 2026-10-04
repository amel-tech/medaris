import type {
  CreateMadrasahDto,
  HeadDelegationResponse,
  MadrasahDirectoryItemResponse,
  MadrasahStatus,
  MadrasahStatusFilter,
} from "@medaris/services/tedrisat";
import type { BadgeVariant } from "@medaris/ui/mds/badge";
import type { IconName } from "@medaris/ui/mds/icon";

/**
 * Pure helpers behind Medreseler and "Medrese aç" (nizam 07 and 08, MDRS-170):
 * the status filter as it is written in the URL, how a status reads, the
 * Turkish "…’den beri" a date takes, the form's rules and the payload it
 * sends. No React and no I/O, so the sentences and rules the designs show can
 * be pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** `?durum=`: the tabs as the URL says them. "Tümü" has no parameter. */
const PARAM_TO_STATUS: Record<string, MadrasahStatusFilter> = {
  etkin: "ACTIVE",
  pasif: "PASSIVE",
  gizli: "HIDDEN",
};
const STATUS_TO_PARAM: Partial<Record<MadrasahStatusFilter, string>> = {
  ACTIVE: "etkin",
  PASSIVE: "pasif",
  HIDDEN: "gizli",
};

export const STATUS_TABS: MadrasahStatusFilter[] = [
  "ALL",
  "ACTIVE",
  "PASSIVE",
  "HIDDEN",
];

/** The filter a `?durum=` stands for; anything unknown is "Tümü". */
export function statusFromParam(
  value: string | string[] | undefined
): MadrasahStatusFilter {
  const first = Array.isArray(value) ? value[0] : value;
  return (first && PARAM_TO_STATUS[first.toLowerCase()]) || "ALL";
}

/** The list's address for a filter and a search, without the locale. */
export function directoryPath(
  status: MadrasahStatusFilter,
  q?: string
): string {
  const params = new URLSearchParams();
  const durum = STATUS_TO_PARAM[status];
  if (durum) params.set("durum", durum);
  const search = q?.trim();
  if (search) params.set("q", search);
  const query = params.toString();
  return query ? `/medreseler?${query}` : "/medreseler";
}

/** `?q=` cut to what the API takes. */
export function searchFromParam(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? "").trim().slice(0, 100);
}

/** How a status is drawn in the Durum column. Hidden is plain text with its glyph, as in the design. */
export const STATUS_LOOK: Record<
  MadrasahStatus,
  { badge: BadgeVariant | null; icon: IconName | null }
> = {
  ACTIVE: { badge: "secondary", icon: null },
  PASSIVE: { badge: "warning", icon: "lock" },
  HIDDEN: { badge: null, icon: "eyeOff" },
};

const MONTHS_TR = [
  // [ablative -den/-dan, locative -de/-da], by the month's last vowel
  ["tan", "ta"], // Ocak
  ["tan", "ta"], // Şubat
  ["tan", "ta"], // Mart
  ["dan", "da"], // Nisan
  ["tan", "ta"], // Mayıs
  ["dan", "da"], // Haziran
  ["dan", "da"], // Temmuz
  ["tan", "ta"], // Ağustos
  ["den", "de"], // Eylül
  ["den", "de"], // Ekim
  ["dan", "da"], // Kasım
  ["tan", "ta"], // Aralık
] as const;

/** The date's month in the viewer's zone, 0 to 11. */
function monthIn(date: Date, timeZone: string): number {
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "numeric",
  }).format(date);
  return Number(month) - 1;
}

/** "27 Eylül": a day and a month, in the viewer's zone. */
export function dayMonth(date: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * "27 Eylül’den" or "27 Eylül’de": a Turkish date takes its case ending by the
 * vowel of the month's name, so "{tarih}’den beri" cannot be one fixed string.
 * Other languages get the bare date; their own messages carry the preposition.
 */
export function dateWithCase(
  date: Date,
  kind: "ablative" | "locative",
  opts: { locale: string; timeZone: string }
): string {
  const base = dayMonth(date, opts.locale, opts.timeZone);
  if (!opts.locale.toLowerCase().startsWith("tr")) return base;
  const ending =
    MONTHS_TR[monthIn(date, opts.timeZone)]?.[kind === "ablative" ? 0 : 1];
  return ending ? `${base}’${ending}` : base;
}

/** "27 Eylül’den beri" — the second line of a Pasif or Gizli status. */
export function sinceLabel(
  at: Date | string | null | undefined,
  opts: { locale: string; timeZone: string; t: Messages }
): string | null {
  if (!at) return null;
  const date = new Date(at);
  return opts.t("since", {
    date: dayMonth(date, opts.locale, opts.timeZone),
    dateAblative: dateWithCase(date, "ablative", opts),
  });
}

/** "Görev süresi 27 Eylül’de doldu" — under "Atanmamış" on a passive medrese. */
export function termEndedLabel(
  at: Date | string | null | undefined,
  opts: { locale: string; timeZone: string; t: Messages }
): string | null {
  if (!at) return null;
  const date = new Date(at);
  return opts.t("termEnded", {
    date: dayMonth(date, opts.locale, opts.timeZone),
    dateLocative: dateWithCase(date, "locative", opts),
  });
}

/** The köşks a medrese holds a right in, "A ve B"; "Yok" when it holds none. */
export function hostingLabel(
  kosks: { name: string }[],
  locale: string,
  none: string
): string {
  if (kosks.length === 0) return none;
  const names = kosks.map((k) => k.name);
  try {
    return new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** Who is shown as the başmüderris: the name, "" when the account has none yet. */
export function headName(
  item: Pick<MadrasahDirectoryItemResponse, "headMuderris">
) {
  return item.headMuderris ? (item.headMuderris.name ?? "") : null;
}

/** nizam/08: lower-case letters, digits and inner hyphens, 2 to 60 characters. */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$/;
export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 1000;

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmailLike = (value: string) => EMAIL_LIKE.test(value.trim());

/** What the "Kısa ad" field holds without the "@" the design draws before it. */
export const cleanHandle = (value: string) => value.trim().replace(/^@+/, "");

export type FieldError = "nameRequired" | "nameShort" | "handleInvalid";

export interface OpenForm {
  name: string;
  handle: string;
  description: string;
  headMuderrisUserId: string | null;
}

/** The first thing wrong with a field, in the order the form lists them; `null` when it is fine. */
export function nameError(name: string): FieldError | null {
  const n = name.trim();
  if (n.length === 0) return "nameRequired";
  if (n.length < NAME_MIN) return "nameShort";
  return null;
}

/** An empty handle is allowed (the server makes one from the name); a typed one must fit. */
export function handleError(handle: string): FieldError | null {
  const h = cleanHandle(handle);
  return h === "" || HANDLE_PATTERN.test(h) ? null : "handleInvalid";
}

/** The button is off until the name, the handle and the başmüderris are right. */
export function canOpen(form: OpenForm): boolean {
  return (
    nameError(form.name) === null &&
    handleError(form.handle) === null &&
    form.headMuderrisUserId !== null
  );
}

/** The body `POST /madrasahs` takes; empty optional fields are left out. */
export function openPayload(form: OpenForm): CreateMadrasahDto {
  const handle = cleanHandle(form.handle);
  const description = form.description.trim();
  return {
    name: form.name.trim(),
    ...(handle ? { handle } : {}),
    ...(description ? { description } : {}),
    headMuderrisUserId: form.headMuderrisUserId as string,
  };
}

const KNOWN: Record<string, string> = {
  MADRASAH_HANDLE_TAKEN: "errors.handleTaken",
  MADRASAH_NOT_FOUND: "errors.notFound",
  MADRASAH_NOT_HIDDEN: "errors.notHidden",
  DISMISS_DECISIONS_INCOMPLETE: "errors.delegationsChanged",
  GRANT_EXPIRY_INVALID: "errors.expiryInvalid",
  AUTHZ_FORBIDDEN: "errors.forbidden",
  // A restore by a lower level than the one that hid it (MDRS-143).
  ARCHIVE_RESTORE_LEVEL: "errors.restoreLevel",
};

/** The `nizam.MadrasahsPage` key for a refusal's code, or the generic one. */
export function madrasahErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}

/** What an e-mail search found, for the picker's states. */
export type LookupState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; user: PickedUser }
  | { kind: "none"; email: string }
  | { kind: "failed" };

export interface PickedUser {
  id: string;
  name: string;
  email: string | null;
}

/** A person as the picker prints them: the name, else the address. */
export function pickedUser(user: {
  id: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}): PickedUser {
  const name = [user.givenName, user.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return {
    id: user.id,
    name: name || user.email || "",
    email: user.email ?? null,
  };
}

/** One person's share of what a başmüderris handed on: every role, group and permission given to them. */
export interface PersonHandOn {
  person: HeadDelegationResponse["to"];
  items: HeadDelegationResponse[];
}

type Answers = Readonly<Record<string, "TAKE_OVER" | "DROP" | undefined>>;

/**
 * The hand-ons by the person they went to, in the order they first appear:
 * the başnazım decides once for each person (nizam/22), the API still takes an
 * answer for every item.
 */
export function groupByPerson(
  items: readonly HeadDelegationResponse[]
): PersonHandOn[] {
  const groups = new Map<string, PersonHandOn>();
  for (const item of items) {
    const found = groups.get(item.to.id);
    if (found) found.items.push(item);
    else groups.set(item.to.id, { person: item.to, items: [item] });
  }
  return [...groups.values()];
}

/** Every item of a person gets that person's answer. */
export function personDecisions(
  groups: readonly PersonHandOn[],
  answers: Answers
) {
  return groups.flatMap((g) =>
    g.items.map((item) => ({
      kind: item.kind,
      id: item.id,
      action: answers[g.person.id] as "TAKE_OVER" | "DROP",
    }))
  );
}

/** The confirm button stays off until every person has an answer. */
export function personsReady(
  groups: readonly PersonHandOn[],
  answers: Answers
): boolean {
  return groups.every((g) => answers[g.person.id] !== undefined);
}
