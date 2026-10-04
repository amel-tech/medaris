import type {
  GivenItemResponse,
  GivenKind,
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
  PermissionGroupScope,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind Medaris nazımları, İzin ver and İzin grupları (nizam 11,
 * 12 and 13, MDRS-171): what the "Bitiş" column says, how the permissions of a
 * person are summed up, the dialog's checked and locked boxes, the rules of the
 * dismissal and of the group form. No React and no I/O, so the sentences and
 * rules the designs show can be pinned by plain specs. The end of a role or a
 * permission is an instant, read and compared by `@medaris/utils` (MDRS-254).
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

// ---- codes and sentences ---------------------------------------------------

/** `platform.kosk_create` is the message key `platform_kosk_create`: a dot would nest. */
export const codeKey = (code: string): string => code.replace(/\./g, "_");

/** The platform sections in the order the screens print them, for two columns. */
export type CatalogSections = PermissionCatalogResponse["platform"];

// ---- dates -----------------------------------------------------------------

/** "31 Aralık 2026": a date in the viewer's zone. */
export function formatDay(
  date: Date | string,
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

/** "30 Eylül 2026 16:12". */
export function formatMoment(
  date: Date | string,
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(date));
}

/** The calendar date `YYYY-MM-DD` of an instant in a zone. */
export function dayIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole calendar days from `now`'s date to `end`'s, in the viewer's zone; 0 on the day itself. */
export function daysLeft(end: Date, now: Date, timeZone: string): number {
  const toUtc = (iso: string) => {
    const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round(
    (toUtc(dayIn(end, timeZone)) - toUtc(dayIn(now, timeZone))) / 86_400_000
  );
}

/** How many days left a "Bitiş" warns about (nizam/11 criterion 2). */
export const WARN_DAYS = 30;

export type EndLabel =
  | { kind: "never" }
  | { kind: "date"; date: string; warnDays: number | null };

/** What the Bitiş column prints: "Süresiz", or the date and, within 30 days, the days left. */
export function endLabel(
  end: Date | string | null,
  now: Date,
  opts: { locale: string; timeZone: string }
): EndLabel {
  if (end === null) return { kind: "never" };
  const date = new Date(end);
  const left = daysLeft(date, now, opts.timeZone);
  return {
    kind: "date",
    date: formatDay(date, opts.locale, opts.timeZone),
    warnDays: left <= WARN_DAYS ? Math.max(left, 0) : null,
  };
}

// ---- the dismissal gate ----------------------------------------------------

/** "Görevden al" opens on 4 Ekim 2026, 00:00 in Istanbul (the version gate); the screen never says why. */
export const DISMISS_OPENS_AT = Date.parse("2026-10-04T00:00:00+03:00");

export const dismissOpen = (now: number): boolean => now >= DISMISS_OPENS_AT;

// ---- what a person holds ---------------------------------------------------

/** A group as a chip and a word: "Ders denetimi" and "her ders". */
export interface HeldGroup {
  id: string;
  name: string;
  scope: PermissionGroupScope;
  courseTitle: string | null;
}

export function heldGroupsOf(nazim: MedarisNazimResponse): HeldGroup[] {
  return nazim.groups.map((g) => ({
    id: g.id,
    name: g.name,
    scope: g.scope,
    courseTitle: g.courseTitle,
  }));
}

/** The platform group the person holds, if any: the one the dialog selects. */
export function platformGroupOf(nazim: MedarisNazimResponse) {
  return nazim.groups.find((g) => g.scope === "PLATFORM") ?? null;
}

/** Every group but the platform's: held "her ders" or for one course, out of the dialog's sight. */
export function otherGroupsOf(nazim: MedarisNazimResponse) {
  return nazim.groups.filter((g) => g.scope !== "PLATFORM");
}

/** The codes in the order the catalog prints them (the API sends them in the order they were given). */
export function orderByCatalog(
  codes: readonly string[],
  catalog: CatalogSections | null
): string[] {
  const rank = new Map(
    (catalog ?? []).flatMap((s) => s.permissions).map((c, i) => [c, i])
  );
  return [...codes].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
}

/** Single permissions as the list prints them: "Medrese aç, Desteyi herkese yayımla". */
export function shortList(
  codes: readonly string[],
  short: (code: string) => string
): string {
  return codes.map(short).join(", ");
}

// ---- the dialog's boxes ----------------------------------------------------

/** What a ticked set is made of: the group's boxes, locked, and the extras. */
export interface Selection {
  groupId: string | null;
  extras: string[];
}

export const NO_GROUP = "none";

/** The extras a group leaves: whatever it carries is the group's now, not a single permission. */
export function withoutGroupCodes(
  extras: readonly string[],
  groupCodes: readonly string[]
): string[] {
  const inGroup = new Set(groupCodes);
  return extras.filter((code) => !inGroup.has(code));
}

export function toggleExtra(
  extras: readonly string[],
  code: string,
  on: boolean
): string[] {
  const rest = extras.filter((c) => c !== code);
  return on ? [...rest, code] : rest;
}

/** "Gruptan N izin ve M ek izin": N is the group's, M the ones ticked besides. */
export function summaryCounts(
  groupCodes: readonly string[],
  extras: readonly string[]
): { fromGroup: number; extra: number } {
  return {
    fromGroup: groupCodes.length,
    extra: withoutGroupCodes(extras, groupCodes).length,
  };
}

/** Every code the save will send, in catalog order: the extras beyond the group. */
export function extrasToSend(
  catalog: CatalogSections,
  extras: readonly string[],
  groupCodes: readonly string[]
): string[] {
  const keep = new Set(withoutGroupCodes(extras, groupCodes));
  return catalog.flatMap((s) => s.permissions.filter((c) => keep.has(c)));
}

/** A group a platform person can be given: the platform's own. */
export const platformGroups = (groups: PermissionGroupResponse[]) =>
  groups.filter((g) => g.scope === "PLATFORM");

// ---- the dismissal ---------------------------------------------------------

export type DismissAnswer = "TAKE_OVER" | "DROP";

export const givenKey = (item: Pick<GivenItemResponse, "kind" | "id">) =>
  `${item.kind}:${item.id}`;

/** A role or a grant: what a dismissal asks an answer for. */
export type DecisionItem = GivenItemResponse & { kind: GivenKind };

/**
 * What the person handed on to others and the başnazım must decide about, in
 * the order listed. A row the person made for themselves goes with the
 * dismissal whatever the answer, so the API takes no answer for it and none is
 * asked (`selfMadeItems` lists those apart).
 */
export const decisionItems = (
  items: readonly GivenItemResponse[],
  personId?: string
): DecisionItem[] =>
  items.filter(
    (item): item is DecisionItem =>
      item.kind !== "GROUP" && !madeForThemselves(item, personId)
  );

/** The roles and grants the person gave themselves: shown as revoked with the dismissal, never asked about. */
export const selfMadeItems = (
  items: readonly GivenItemResponse[],
  personId: string | undefined
): DecisionItem[] =>
  items.filter(
    (item): item is DecisionItem =>
      item.kind !== "GROUP" && madeForThemselves(item, personId)
  );

const madeForThemselves = (
  item: Pick<GivenItemResponse, "to">,
  personId: string | undefined
) =>
  personId !== undefined &&
  item.to?.id.toLowerCase() === personId.toLowerCase();

/** The permission groups the person defined or changed: shown, never asked about. */
export const groupItems = (items: readonly GivenItemResponse[]) =>
  items.filter((item) => item.kind === "GROUP");

/** The confirm button is off until every item has an answer (_kurallar 14, 15). */
export function dismissReady(
  items: readonly Pick<GivenItemResponse, "kind" | "id">[],
  answers: Readonly<Record<string, DismissAnswer | undefined>>
): boolean {
  return items.every((item) => answers[givenKey(item)] !== undefined);
}

export function dismissDecisions(
  items: readonly Pick<DecisionItem, "kind" | "id">[],
  answers: Readonly<Record<string, DismissAnswer | undefined>>
) {
  return items.map((item) => ({
    kind: item.kind,
    id: item.id,
    action: answers[givenKey(item)] as DismissAnswer,
  }));
}

// ---- the group form --------------------------------------------------------

export const GROUP_NAME_MAX = 80;

export type GroupFieldError = "nameRequired" | "nameTooLong" | "nameTaken";

/** The first thing wrong with the name: blank, too long, or used by another group (case aside). */
export function groupNameError(
  name: string,
  groups: readonly { id: string; name: string }[],
  selfId: string | null
): GroupFieldError | null {
  const n = name.trim();
  if (n.length === 0) return "nameRequired";
  if (n.length > GROUP_NAME_MAX) return "nameTooLong";
  const lower = n.toLocaleLowerCase("tr");
  if (
    groups.some(
      (g) => g.id !== selfId && g.name.trim().toLocaleLowerCase("tr") === lower
    )
  ) {
    return "nameTaken";
  }
  return null;
}

/** The codes a scope lets a group carry (nizam/13: the scope filters the catalog). */
export function catalogFor(
  scope: PermissionGroupScope,
  catalog: PermissionCatalogResponse
): CatalogSections {
  return scope === "PLATFORM"
    ? catalog.platform
    : [{ id: "course", permissions: catalog.course }];
}

/** A scope change drops what the new scope cannot hold. */
export function keepAllowed(
  codes: readonly string[],
  scope: PermissionGroupScope,
  catalog: PermissionCatalogResponse
): string[] {
  const allowed = new Set(
    catalogFor(scope, catalog).flatMap((s) => s.permissions)
  );
  return codes.filter((c) => allowed.has(c));
}

export function sameCodes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c));
}

/**
 * Whether saving or deleting has to ask what becomes of the people who hold
 * the group (nizam/13 criterion 3): only while somebody does, and for a save
 * only when the permissions change.
 */
export function needsUsersQuestion(
  userCount: number,
  change: "delete" | { before: readonly string[]; after: readonly string[] }
): boolean {
  if (userCount <= 0) return false;
  return change === "delete" || !sameCodes(change.before, change.after);
}

/** The Kapsam shown in the list under a group's name. */
export function scopeKey(group: Pick<PermissionGroupResponse, "scope">) {
  return group.scope;
}

// ---- refusals --------------------------------------------------------------

const KNOWN: Record<string, string> = {
  PERMISSION_GROUP_NAME_TAKEN: "errors.nameTaken",
  PERMISSION_GROUP_NOT_FOUND: "errors.groupNotFound",
  PERMISSION_GROUP_EMPTY: "errors.groupEmpty",
  PERMISSION_GROUP_SCOPE_INVALID: "errors.scopeInvalid",
  PERMISSION_UNKNOWN: "errors.generic",
  MEDARIS_NAZIM_NOT_FOUND: "errors.nazimNotFound",
  MEDARIS_NAZIM_ALREADY_APPOINTED: "errors.alreadyAppointed",
  GRANT_EXPIRY_INVALID: "errors.expiryInvalid",
  DISMISS_DECISIONS_INCOMPLETE: "errors.dismissChanged",
  DISMISS_SEAT_HANDED_ON: "errors.dismissCascade",
  DISMISS_TAKE_OVER_WITHOUT_SEAT: "errors.dismissSeatless",
  USERS_POLICY_REQUIRED: "errors.usersPolicy",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The `nizam.PermissionsPage` key for a refusal's code, or the generic one. */
export function permissionErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}
