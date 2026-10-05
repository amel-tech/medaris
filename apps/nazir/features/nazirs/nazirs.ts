import type {
  DismissMadrasahNazirDecisionDto,
  MadrasahNazirGivenResponse,
  MadrasahNazirGroupResponse,
  MadrasahNazirResponse,
  NazimPersonResponse,
  UserSummaryResponse,
} from "@medaris/services/tedrisat";
import { permissionMessageKey } from "~/features/account/permissions";
import { dayMonth, dayMonthLocative } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Medrese nazırları, Görevden al and İzinleri düzenle (nazir 05, 15, 06) as
 * rules: how a nazır's permissions are summed up, when the "henüz izin almadı"
 * banner shows, what the table rows say, and the state machine of the dismissal.
 */

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

/**
 * A nazır who holds no group, no single permission and nothing in a course
 * ("henüz izin almadı").
 */
export const awaitingGrants = (held: {
  groups: readonly unknown[];
  permissions: readonly unknown[];
  courseGrants?: readonly unknown[];
}): boolean =>
  held.groups.length === 0 &&
  held.permissions.length === 0 &&
  (held.courseGrants?.length ?? 0) === 0;

/** The groups a nazır holds, in the medrese or only in some courses, each once. */
export function heldGroups(
  nazir: Pick<MadrasahNazirResponse, "groups" | "courseGrants">
): MadrasahNazirGroupResponse[] {
  const groups = new Map<string, MadrasahNazirGroupResponse>();
  for (const group of [
    ...nazir.groups,
    ...nazir.courseGrants.flatMap((grant) =>
      grant.group ? [grant.group] : []
    ),
  ]) {
    if (!groups.has(group.id)) groups.set(group.id, group);
  }
  return [...groups.values()];
}

/**
 * The single permissions beyond the groups, each code once, whether it is held
 * in the medrese or in a course: what "Ayrıca N izin" counts.
 */
export function extraCodes(
  nazir: Pick<MadrasahNazirResponse, "groups" | "permissions" | "courseGrants">
): string[] {
  const carried = new Set(heldGroups(nazir).flatMap((g) => g.permissions));
  const codes = [
    ...nazir.permissions.map((p) => p.code),
    ...nazir.courseGrants.flatMap((grant) =>
      grant.permission ? [grant.permission] : []
    ),
  ];
  return [...new Set(codes)].filter((code) => !carried.has(code));
}

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
  /** the single permissions beyond the groups, for the dismissal's summary */
  permissionCount: number;
  /** "Ders izinleri yalnız şu derslerde: …", when some are held only in courses */
  courseScope: string | null;
  awaiting: boolean;
  /** when the appointment ends, which the permissions cannot outlast */
  assignmentEnd: string | null;
  /** "Atayan: … · 30 Eylül 2026", for a nazır who holds nothing yet */
  appointedLine: string;
  /** who seated them: a nazır who appoints dismisses only their own (d-1004-28) */
  appointedById: string | null;
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
    const groups = heldGroups(n);
    const extras = extraCodes(n);
    const courses = [
      ...new Set(
        n.courseGrants.flatMap((g) => (g.courseTitle ? [g.courseTitle] : []))
      ),
    ];
    return {
      id: n.user.id,
      name: personName(n.user, t("Nazirs.unknownPerson")),
      email: n.user.email,
      groups: groups.map((g) => g.name),
      extra: permissionsLine({ groups, permissions: extras }, t),
      permissionCount: extras.length,
      courseScope:
        courses.length > 0
          ? t("Nazirs.courseScope", { list: courses.join(" · ") })
          : null,
      awaiting,
      assignmentEnd: n.assignmentExpiresAt
        ? new Date(n.assignmentExpiresAt).toISOString()
        : null,
      appointedLine: t("Nazirs.appointedBy", {
        name: personName(n.appointedBy, t("Nazirs.unknownPerson")),
        date: day.format(new Date(n.appointedAt)),
      }),
      appointedById: n.appointedBy?.id ?? null,
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

/**
 * The message key of a refused dismissal, appointment, permission change or
 * group write, from the code the API answered with.
 */
export function nazirErrorKey(code: string): string {
  switch (code) {
    case "DISMISS_DECISIONS_INCOMPLETE":
      return "Dismiss.changed";
    case "DISMISS_SEAT_HANDED_ON":
      return "Dismiss.cascade";
    case "SELF_GRANT_REFUSED":
      return "Problems.selfGrant";
    case "MADRASAH_NAZIR_NOT_FOUND":
      return "Dismiss.gone";
    case "AUTHZ_FORBIDDEN":
    case "PERMISSION_NOT_GIVABLE":
      return "Problems.actionForbidden";
    case "PERMISSION_UNKNOWN":
      return "Problems.permissionUnknown";
    case "GRANT_EXCEEDS_GIVER":
      return "Problems.exceedsGiver";
    case "NAZIR_COURSE_SCOPE_INVALID":
      return "Problems.courseScope";
    case "GRANT_EXPIRY_INVALID":
      return "Problems.expiryInvalid";
    case "PERMISSION_GROUP_NOT_FOUND":
      return "Problems.groupGone";
    case "PERMISSION_GROUP_NAME_TAKEN":
      return "Problems.groupNameTaken";
    default:
      return "Problems.actionGeneric";
  }
}
