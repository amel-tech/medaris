import type { AssignmentResponse } from "@medaris/services/tedrisat";

/**
 * The scopes of the Nazar portal (MDRS-183): a medrese the person runs, and the
 * courses they teach or look after. Pure on purpose: the rules for deduping,
 * ordering, the remembered scope and the links are exercised without a server.
 */
export type ScopeKind = "medrese" | "ders";

export interface Scope {
  kind: ScopeKind;
  id: string;
  name: string;
  /** the stronger of the roles held in this scope */
  role: string;
  /** a müderris who is the course's imam */
  isImam: boolean;
  /** a course's köşk */
  koskName: string | null;
}

/** The signed-in person, as the portal names them. */
export interface Person {
  name: string;
  email: string | null;
}

/** The cookie the scoped pages leave so that `/` can reopen the same scope. */
export const SCOPE_COOKIE = "nazar-scope";

/** Where a person with no scope is sent (nazir 02). */
export const NO_ACCESS_PATH = "/erisim-yok";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const KIND_OF_SCOPE_TYPE: Readonly<Record<string, ScopeKind>> = {
  madrasah: "medrese",
  course: "ders",
};

/**
 * Within one scope a higher number is the stronger role. A person who is both
 * başmüderris and nazır of a medrese, or müderris and ders nazırı of a course,
 * has one scope and it carries the stronger label.
 */
const SCOPE_ROLE_STRENGTH: Readonly<Record<string, number>> = {
  MEDRESE_BASMUDERRIS: 2,
  MEDRESE_NAZIR: 1,
  MUDERRIS: 2,
  DERS_NAZIR: 1,
};

/** Every role the API can name, strongest first: the order of the user row's role line. */
const ROLE_ORDER = [
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
  "MUDERRIS",
  "DERS_NAZIR",
] as const;

type AssignmentLike = Pick<
  AssignmentResponse,
  "role" | "scopeType" | "scopeId" | "scopeName" | "isImam"
> & { course?: Pick<NonNullable<AssignmentResponse["course"]>, "koskName"> };

export const scopeKey = (scope: Pick<Scope, "kind" | "id">): string =>
  `${scope.kind}:${scope.id}`;

/** The scope's own page: `/medrese/<id>` (Pano) or `/ders/<id>` (genel bakış). */
export const scopeHref = (scope: Pick<Scope, "kind" | "id">): string =>
  `/${scope.kind}/${encodeURIComponent(scope.id)}`;

const collator = new Intl.Collator("tr");

/**
 * The scopes behind a list of assignments: medrese first, then courses, each
 * group by name. Two roles in one scope make one scope with the stronger role.
 * Roles whose scope is the platform or a köşk are Nizam's and make no scope.
 */
export function buildScopes(assignments: readonly AssignmentLike[]): Scope[] {
  const byKey = new Map<string, Scope>();
  for (const a of assignments) {
    const kind = KIND_OF_SCOPE_TYPE[a.scopeType];
    if (!kind || !a.scopeId) continue;
    const strength = SCOPE_ROLE_STRENGTH[a.role];
    if (strength === undefined) continue;
    const key = scopeKey({ kind, id: a.scopeId });
    const held = byKey.get(key);
    const imam = a.role === "MUDERRIS" && a.isImam;
    if (!held) {
      byKey.set(key, {
        kind,
        id: a.scopeId,
        name: a.scopeName ?? "",
        role: a.role,
        isImam: imam,
        koskName: a.course?.koskName ?? null,
      });
      continue;
    }
    if (imam) held.isImam = true;
    if (strength > (SCOPE_ROLE_STRENGTH[held.role] ?? 0)) held.role = a.role;
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "medrese" ? -1 : 1) ||
      collator.compare(a.name, b.name)
  );
}

/** The role labels of the user row, strongest first, once each; empty when none is held. */
export function heldRoles(
  assignments: readonly Pick<AssignmentLike, "role">[]
) {
  const held = new Set(assignments.map((a) => a.role));
  return ROLE_ORDER.filter((role) => held.has(role));
}

export function findScope(
  scopes: readonly Scope[],
  kind: ScopeKind,
  id: string
): Scope | undefined {
  const wanted = id.toLowerCase();
  return scopes.find((s) => s.kind === kind && s.id.toLowerCase() === wanted);
}

/** The `nazar-scope` cookie's value as a kind and an id, or null for anything else. */
export function parseScopeCookie(
  raw: string | null | undefined
): { kind: ScopeKind; id: string } | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const match = /^(medrese|ders):([A-Za-z0-9-]{1,64})$/.exec(value);
  return match ? { kind: match[1] as ScopeKind, id: match[2] as string } : null;
}

/** The `document.cookie` assignment that remembers `scope`. */
export function serializeScopeCookie(
  scope: Pick<Scope, "kind" | "id">
): string {
  return `${SCOPE_COOKIE}=${encodeURIComponent(scopeKey(scope))}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; samesite=lax`;
}

/**
 * The scope a person lands in: the remembered one while they still hold it,
 * else the first medrese, else the first course; null when they hold none.
 */
export function defaultScope(
  scopes: readonly Scope[],
  remembered: string | null | undefined
): Scope | null {
  const wanted = parseScopeCookie(remembered);
  const kept = wanted && findScope(scopes, wanted.kind, wanted.id);
  return (
    kept ||
    scopes.find((s) => s.kind === "medrese") ||
    scopes.find((s) => s.kind === "ders") ||
    null
  );
}

/** Where `/` sends a signed-in person: their scope, or the no-access page. */
export function landingPath(
  scopes: readonly Scope[],
  remembered: string | null | undefined
): string {
  const scope = defaultScope(scopes, remembered);
  return scope ? scopeHref(scope) : NO_ACCESS_PATH;
}

/**
 * The Pano is the medrese's dashboard. A course's menu opens the Pano of the
 * first medrese the person runs; someone with no medrese has nothing to open
 * there and Pano falls back to the course's own overview.
 */
export function panoHref(scopes: readonly Scope[], current: Scope): string {
  if (current.kind === "medrese") return scopeHref(current);
  const medrese = scopes.find((s) => s.kind === "medrese");
  return scopeHref(medrese ?? current);
}

/** The name the user row shows: the token's name, else given and family name, else the e-mail. */
export function displayName(user: {
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  email?: string | null;
}): string {
  const full = [user.given_name, user.family_name].filter(Boolean).join(" ");
  return user.name?.trim() || full.trim() || user.email?.trim() || "";
}
