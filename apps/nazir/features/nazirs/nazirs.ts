import type {
  DismissMadrasahNazirDecisionDto,
  MadrasahNazirGivenResponse,
  MadrasahNazirResponse,
  NazimPersonResponse,
  UserSummaryResponse,
} from "@medaris/services/tedrisat";
import { permissionMessageKey } from "~/features/account/permissions";
import { dayMonth, dayMonthLocative } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Medrese nazırları and Görevden al (nazir 05, 15) as rules: how a nazır's
 * permissions are summed up, when the "henüz izin almadı" banner shows, what
 * the table rows say, and the state machine of the dismissal.
 */

/** "Görevden al" opens on 4 Ekim 2026, 00:00 in Istanbul (the version gate); the screen never says why. */
export const DISMISS_OPENS_AT = Date.parse("2026-10-04T00:00:00+03:00");

export const dismissOpen = (now: number): boolean => now >= DISMISS_OPENS_AT;

export type Person = Pick<NazimPersonResponse, "name" | "email">;

/** The name, else the address, else `fallback`. */
export const personName = (person: Person | null, fallback: string): string =>
  person?.name?.trim() || person?.email?.trim() || fallback;

/**
 * The sentence for a permission code (the account page's, `Account.permissions`).
 * A code with no sentence is shown as the code itself, never left out: the count
 * beside it counts every permission, so a hidden one would make the line lie.
 */
export const permissionLabel = (code: string, t: Messages): string => {
  const key = `Account.permissions.${permissionMessageKey(code)}`;
  return t.has(key) ? t(key) : code;
};

/** What a person holds in the medrese: groups by name, single permissions by code. */
export interface Held {
  groups: ReadonlyArray<{ name: string }>;
  permissions: readonly string[];
}

/** A nazır who holds neither a group nor a permission ("henüz izin almadı"). */
export const awaitingGrants = (held: {
  groups: readonly unknown[];
  permissions: readonly unknown[];
}): boolean => held.groups.length === 0 && held.permissions.length === 0;

/**
 * "Ayrıca 3 izin: a · b · c" beside the group chips, or "3 izin: a · b · c"
 * when there is no group; null when no single permission is held.
 */
export function permissionsLine(held: Held, t: Messages): string | null {
  if (held.permissions.length === 0) return null;
  return t(
    held.groups.length > 0
      ? "Nazirs.permissionsWithGroups"
      : "Nazirs.permissionsOnly",
    {
      count: held.permissions.length,
      list: held.permissions
        .map((code) => permissionLabel(code, t))
        .join(" · "),
    }
  );
}

export interface Dated {
  label: string;
  iso: string;
}

/** One line of the table, already worded and dated, so that the table has nothing to translate. */
export interface NazirRow {
  id: string;
  name: string;
  email: string | null;
  groups: string[];
  /** "Ayrıca 3 izin: …" */
  extra: string | null;
  /** the single permissions held, for the dismissal's summary */
  permissionCount: number;
  awaiting: boolean;
  /** "Atayan: … · 30 Eylül 2026", for a nazır who holds nothing yet */
  appointedLine: string;
  /** null where the cell is a dash */
  end: { label: string; iso: string | null } | null;
  giver: { name: string; at: Dated } | null;
}

const dated = (at: Date | string, day: Intl.DateTimeFormat): Dated => {
  const date = new Date(at);
  return { label: day.format(date), iso: date.toISOString() };
};

/** The rows of the table, in the order the API gave them (oldest appointment first). */
export function nazirRows(
  nazirs: readonly MadrasahNazirResponse[],
  t: Messages,
  day: Intl.DateTimeFormat
): NazirRow[] {
  return nazirs.map((n) => {
    const awaiting = awaitingGrants(n);
    const held = {
      groups: n.groups,
      permissions: n.permissions.map((p) => p.code),
    };
    return {
      id: n.user.id,
      name: personName(n.user, t("Nazirs.unknownPerson")),
      email: n.user.email,
      groups: n.groups.map((g) => g.name),
      extra: permissionsLine(held, t),
      permissionCount: n.permissions.length,
      awaiting,
      appointedLine: t("Nazirs.appointedBy", {
        name: personName(n.appointedBy, t("Nazirs.unknownPerson")),
        date: day.format(new Date(n.appointedAt)),
      }),
      end: awaiting
        ? null
        : n.expiresAt
          ? {
              label: day.format(new Date(n.expiresAt)),
              iso: new Date(n.expiresAt).toISOString(),
            }
          : { label: t("Nazirs.never"), iso: null },
      giver:
        !awaiting && n.grantedBy && n.grantedAt
          ? {
              name: personName(n.grantedBy, t("Nazirs.unknownPerson")),
              at: dated(n.grantedAt, day),
            }
          : null,
    };
  });
}

/**
 * The band above the table: it names the nazır who has not received a
 * permission yet and who appointed them, or counts them when there are
 * several. Null when everyone holds something.
 */
export function awaitingNotice(
  nazirs: readonly MadrasahNazirResponse[],
  t: Messages,
  where: { locale: string; timeZone: string }
): { title: string; text: string } | null {
  const waiting = nazirs.filter(awaitingGrants);
  const unknown = t("Nazirs.unknownPerson");
  const [first] = waiting;
  if (!first) return null;
  if (waiting.length === 1) {
    return {
      title: t("Nazirs.awaitingTitle", {
        name: personName(first.user, unknown),
      }),
      text: t("Nazirs.awaiting", {
        appointer: personName(first.appointedBy, unknown),
        // Turkish takes its case ending by the month; the other languages carry the preposition
        dateLocative: dayMonthLocative(
          new Date(first.appointedAt),
          where.locale,
          where.timeZone
        ),
        date: dayMonth(
          new Date(first.appointedAt),
          where.locale,
          where.timeZone
        ),
      }),
    };
  }
  return {
    title: t("Nazirs.awaitingManyTitle", { count: waiting.length }),
    text: t("Nazirs.awaitingMany", {
      names: new Intl.ListFormat(where.locale, {
        style: "long",
        type: "conjunction",
      }).format(waiting.map((n) => personName(n.user, unknown))),
    }),
  };
}

// ---- the appointment ---------------------------------------------------------

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Only an address that could be one is searched: every search is written to the audit log. */
export const isEmailLike = (value: string): boolean =>
  EMAIL_LIKE.test(value.trim());

/** A person the e-mail search found. */
export interface PickedPerson {
  id: string;
  name: string;
  email: string | null;
}

export function pickedPerson(user: UserSummaryResponse): PickedPerson {
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

// ---- the dismissal ------------------------------------------------------------

export type Answer = "TAKE_OVER" | "DROP";
export type Answers = Readonly<Record<string, Answer | undefined>>;

/** The button is off until every person the nazır gave something to has an answer (_kurallar 14, 15). */
export const dismissReady = (
  given: ReadonlyArray<Pick<MadrasahNazirGivenResponse, "user">>,
  answers: Answers
): boolean => given.every((row) => answers[row.user.id] !== undefined);

/** The body of the DELETE: exactly one decision per person listed; `[]` when nobody is. */
export const dismissDecisions = (
  given: ReadonlyArray<Pick<MadrasahNazirGivenResponse, "user">>,
  answers: Answers
): DismissMadrasahNazirDecisionDto[] =>
  given.map((row) => ({
    userId: row.user.id,
    action: answers[row.user.id] as Answer,
  }));

/**
 * One role the nazır gave, as a line of the dismissal's row: "Medrese nazırı ·
 * Süleymaniye Medresesi · süresiz · verildi 30 Eylül 2026".
 */
export function givenRoleLine(
  role: MadrasahNazirGivenResponse["roles"][number],
  t: Messages,
  day: Intl.DateTimeFormat
): string {
  const label = t.has(`Roles.${role.role}`)
    ? t(`Roles.${role.role}`)
    : role.role;
  return [
    label,
    role.scopeName,
    role.expiresAt
      ? t("Dismiss.until", { date: day.format(new Date(role.expiresAt)) })
      : t("Dismiss.noEnd"),
    t("Dismiss.givenAt", { date: day.format(new Date(role.grantedAt)) }),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What goes at once when this nazır is dismissed (the callout of nazir 15): the
 * groups and single permissions they hold, or that they hold none.
 */
export function dropSummary(
  nazir: { name: string; groups: readonly string[]; permissionCount: number },
  t: Messages,
  locale: string
): string {
  const parts: string[] = [];
  if (nazir.groups.length > 0) {
    const names = new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(nazir.groups.map((name) => `“${name}”`));
    parts.push(
      t(
        nazir.groups.length === 1
          ? "Dismiss.drops.groupOne"
          : "Dismiss.drops.groupMany",
        { names }
      )
    );
  }
  if (nazir.permissionCount > 0) {
    parts.push(
      t("Dismiss.drops.permissions", { count: nazir.permissionCount })
    );
  }
  if (parts.length === 0) {
    return t("Dismiss.drops.nothing", { name: nazir.name });
  }
  const [first, second] = parts as [string, string?];
  return t("Dismiss.drops.summary", {
    name: nazir.name,
    what: second
      ? t("Dismiss.drops.both", { groups: first, permissions: second })
      : first,
  });
}

/** The message key of a refused dismissal or appointment, from the code the API answered with. */
export function nazirErrorKey(code: string): string {
  switch (code) {
    case "DISMISS_DECISIONS_INCOMPLETE":
      return "Dismiss.changed";
    case "MADRASAH_NAZIR_NOT_FOUND":
      return "Dismiss.gone";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}
