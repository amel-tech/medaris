import type { EffectivePermissionGroup } from "@medaris/services/tedrisat";
import type { Messages } from "~/lib/i18n/messages";

/** The parts of a permission group these rules read; the API's group fits. */
interface GroupLike {
  role?: string | null;
  scopes: ReadonlyArray<{ id?: string | null; name?: string | null }>;
}

/**
 * The codes whose sentence carries a second, smaller line on the account
 * screen. `<key>` is `permissionMessageKey(code)`; the sentence is
 * `Account.permissions.<key>` and the note `Account.permissionNotes.<key>`, and
 * a code that is in this set must have both.
 */
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

/** next-intl keys cannot hold a dot, so `kosk.manage` is `kosk_manage` in the messages. */
export const permissionMessageKey = (code: string): string =>
  code.replaceAll(".", "_");

/** A group's title and, when its role holds in several scopes, the line that says so. */
export function groupHeading(
  group: GroupLike,
  t: Messages,
  locale: string
): { title: string; scopeLine: string | null } {
  const roleLabel = group.role
    ? t(`Roles.${group.role}`)
    : t("Account.grantedRole");
  const names = group.scopes
    .map((scope) => scope.name)
    .filter((name): name is string => Boolean(name));
  if (group.scopes.length === 1 && names.length === 1) {
    return {
      title: `${names[0]} · ${roleLabel.toLocaleLowerCase(locale)}`,
      scopeLine: null,
    };
  }
  if (names.length === 0) return { title: roleLabel, scopeLine: null };
  return {
    title: roleLabel,
    scopeLine: t(
      group.role === "MUDERRIS"
        ? "Account.eachScope.MUDERRIS"
        : "Account.eachScope.default",
      {
        role: roleLabel,
        names: new Intl.ListFormat(locale, {
          style: "long",
          type: "conjunction",
        }).format(names),
      }
    ),
  };
}

/** The codes of a group the screen has a sentence for; a code it has none for is left out, never shown bare. */
export const knownCodes = (
  group: Pick<EffectivePermissionGroup, "permissions">,
  t: Pick<Messages, "has">
): string[] =>
  group.permissions.filter((code) =>
    t.has(`Account.permissions.${permissionMessageKey(code)}`)
  );

/** The groups that have at least one sentence to show, each with those codes. */
export const visibleGroups = (
  groups: readonly EffectivePermissionGroup[],
  t: Pick<Messages, "has">
): Array<{ group: EffectivePermissionGroup; codes: string[] }> =>
  groups
    .map((group) => ({ group, codes: knownCodes(group, t) }))
    .filter(({ codes }) => codes.length > 0);

export type GroupExpiry =
  | { kind: "none" }
  | { kind: "at"; at: Date }
  | { kind: "earliest"; at: Date };

/**
 * When a role group ends, from the assignments it came from ("Bitiş: süresiz."):
 * none of them has an end date, or the one end date, or the nearest of several.
 * A group that holds only grants has no assignment to read it from and says nothing.
 */
export function groupExpiry(
  group: GroupLike,
  assignments: ReadonlyArray<{
    role: string;
    scopeId?: string | null;
    expiresAt?: Date | null;
  }>
): GroupExpiry | null {
  if (!group.role) return null;
  const ids = new Set(group.scopes.map((scope) => scope.id));
  const held = assignments.filter(
    (a) => a.role === group.role && a.scopeId != null && ids.has(a.scopeId)
  );
  if (held.length === 0) return null;
  const ends = held
    .map((a) => (a.expiresAt ? new Date(a.expiresAt) : null))
    .filter((at): at is Date => at !== null);
  if (ends.length === 0) return { kind: "none" };
  const nearest = new Date(Math.min(...ends.map((at) => at.getTime())));
  return held.length === 1
    ? { kind: "at", at: nearest }
    : { kind: "earliest", at: nearest };
}
