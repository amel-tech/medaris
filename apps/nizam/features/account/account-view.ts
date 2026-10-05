import type {
  AssignmentResponse,
  EffectivePermissionGroup,
} from "@medaris/services/tedrisat";

/**
 * What "Hesap ve ayarlar" decides without a browser (nizam 36, 47, MDRS-179):
 * the order and wording of the roles, the line under a role's permissions
 * about when they end, the course badge, the time-zone choices. No React, no
 * I/O.
 */

/** The held roles, widest first: the order of the person's summary line. */
export const ROLE_ORDER = [
  "chief",
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
  "MUDERRIS",
  "DERS_NAZIR",
] as const;
export type RoleKey = (typeof ROLE_ORDER)[number];

/** The distinct roles a person holds, widest first; `chief` is the realm's SYSTEM_ADMIN. */
export const heldRoleKeys = (
  systemAdmin: boolean,
  assignments: Pick<AssignmentResponse, "role">[]
): RoleKey[] => {
  const held = new Set<string>(assignments.map((a) => a.role));
  if (systemAdmin) held.add("chief");
  return ROLE_ORDER.filter((role) => held.has(role));
};

/** "Köşk nazımı · müderris": the widest role as written, the rest in lower case. */
export const roleSummary = (
  roles: readonly string[],
  label: (role: string) => string,
  locale: string
): string =>
  roles
    .map((role, i) =>
      i === 0 ? label(role) : label(role).toLocaleLowerCase(locale)
    )
    .join(" · ");

export type ScopeBadge = "published" | "draft" | "hidden";

/** The badge beside a course: hidden wins over its published/draft state. */
export const courseBadge = (
  course: AssignmentResponse["course"]
): ScopeBadge | null => {
  if (!course) return null;
  if (course.hidden) return "hidden";
  return course.status === "PUBLISHED" ? "published" : "draft";
};

/** The second line of the scope cell: the köşk, then the medrese, when there is one. */
export const scopeMeta = (
  assignment: Pick<AssignmentResponse, "course">
): string[] =>
  [assignment.course?.koskName, assignment.course?.madrasahName].filter(
    (part): part is string => Boolean(part)
  );

/** The page a role's work is done in: köşk nazımı and above here, the rest in Nazar. */
export const roleApp = (role: string): "nizam" | "nazar" =>
  role === "MEDARIS_NAZIM" || role === "KOSK_NAZIM" ? "nizam" : "nazar";

export type ExpiryNote =
  | { kind: "none" }
  | { kind: "indefinite"; role: string }
  | { kind: "ends"; role: string; at: Date };

/**
 * The small line under a role's permissions about when they end: they follow
 * the assignment. A role held without an end date by any assignment lasts
 * until it is taken away; a role every assignment of which ends goes with the
 * last of them. The realm's `chief` has no assignment and no note.
 */
export const expiryNote = (
  role: string | null,
  assignments: Pick<AssignmentResponse, "role" | "expiresAt">[]
): ExpiryNote => {
  if (!role) return { kind: "none" };
  const mine = assignments.filter((a) => a.role === role);
  if (mine.length === 0) return { kind: "none" };
  if (mine.some((a) => !a.expiresAt)) return { kind: "indefinite", role };
  const at = new Date(
    Math.max(...mine.map((a) => new Date(a.expiresAt as Date).getTime()))
  );
  return { kind: "ends", role, at };
};

/** next-intl keys cannot hold a dot, so `kosk.manage` is `kosk_manage` in the messages. */
export const permissionMessageKey = (code: string): string =>
  code.replaceAll(".", "_");

/** The codes whose sentence carries a second, smaller line (nizam 36, 47). */
export const PERMISSION_NOTE_CODES: ReadonlySet<string> = new Set([
  "course.manage_all",
  "course_nazir.assign_kosk",
  "user.lookup",
  "ban.lift_course",
]);

/** The roles whose default permissions the screen explains under the list. */
export const ROLE_DEFAULTS_NOTE: ReadonlySet<string> = new Set([
  "KOSK_NAZIM",
  "MUDERRIS",
]);

/** Groups with a sentence to show, in the order the API sent them; a code with no sentence is left out rather than shown bare. */
export const visibleGroups = (
  groups: EffectivePermissionGroup[],
  has: (key: string) => boolean
): EffectivePermissionGroup[] =>
  groups
    .map((g) => ({
      ...g,
      permissions: g.permissions.filter((code) =>
        has(`permissions.${permissionMessageKey(code)}`)
      ),
    }))
    .filter((g) => g.permissions.length > 0);

/** The zones the picker names first (nizam 47); "Diğer…" opens the rest. */
export const FEATURED_TIME_ZONES = [
  "Europe/Istanbul",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Paris",
  "Europe/Vienna",
  "Europe/London",
  "America/New_York",
] as const;

/** Chosen in the picker to open the full list; never a zone. */
export const OTHER_ZONE = "__other__";

/** The zone the picker shows: the profile's, the browser-independent default when it has none. */
export const effectiveZone = (saved: string | undefined | null): string =>
  saved && saved.length > 0 ? saved : "Europe/Istanbul";

/** Whether the picker opens on its full list: a saved zone the short list does not name. */
export const needsFullList = (zone: string): boolean =>
  !(FEATURED_TIME_ZONES as readonly string[]).includes(zone);

/** Every zone the runtime knows, for "Diğer…"; the saved zone is kept in the list even when the runtime does not name it. */
export const allTimeZones = (saved: string): string[] => {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [...FEATURED_TIME_ZONES];
  }
  return zones.includes(saved) ? zones : [saved, ...zones];
};
