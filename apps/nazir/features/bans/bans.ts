import type {
  CreateMadrasahBanDto,
  MadrasahBanResponse,
} from "@medaris/services/tedrisat";
import { whenLabel } from "~/features/archive/archive";
import { ALL, genitive, isUuid } from "~/features/courses/courses";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Yasaklamalar (nazir 11) and the "Yasakla" of Talebeler (nazir 10) as rules:
 * what the list asks the API for, how a ban is worded and dated as a row, which
 * actions a row offers and why one may be missing, and what the dialogs send.
 * Pure on purpose, so that the pages and the dialogs have nothing to decide.
 */

// ---- the list's address -------------------------------------------------------------

export type BanStatus = "ACTIVE" | "LIFTED";

/** The scope filter's value for "Medrese düzeyi"; any other value but `ALL` is a course's id. */
export const MADRASAH_SCOPE = "madrasah";

export interface Filters {
  status: BanStatus;
  /** `ALL`, `MADRASAH_SCOPE` or a course's id */
  scope: string;
}

export const BLANK: Filters = { status: "ACTIVE", scope: ALL };

/** The filters an address names (`?durum=kaldirilan`, `?kapsam=medrese` or `?kapsam=<ders>`); anything else is the default. */
export function filtersOf(params: {
  durum?: string;
  kapsam?: string;
}): Filters {
  return {
    status: params.durum === "kaldirilan" ? "LIFTED" : "ACTIVE",
    scope:
      params.kapsam === "medrese"
        ? MADRASAH_SCOPE
        : params.kapsam && isUuid(params.kapsam)
          ? params.kapsam
          : ALL,
  };
}

export function bansHref(madrasahId: string, filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.status === "LIFTED") query.set("durum", "kaldirilan");
  if (filters.scope === MADRASAH_SCOPE) query.set("kapsam", "medrese");
  else if (filters.scope !== ALL) query.set("kapsam", filters.scope);
  const search = query.toString();
  return `/medrese/${encodeURIComponent(madrasahId)}/yasaklamalar${search ? `?${search}` : ""}`;
}

/** What the list asks the API for: "Medrese düzeyi" is a scope, a course is its own parameter, "Bütün kapsamlar" none. */
export function listRequest(filters: Filters): {
  status: BanStatus;
  scope?: "MADRASAH";
  courseId?: string;
} {
  return {
    status: filters.status,
    scope: filters.scope === MADRASAH_SCOPE ? "MADRASAH" : undefined,
    courseId:
      filters.scope === ALL || filters.scope === MADRASAH_SCOPE
        ? undefined
        : filters.scope,
  };
}

export interface ScopeOption {
  value: string;
  label: string;
}

/** "Bütün kapsamlar", "Medrese düzeyi" and the medrese's courses. */
export const scopeOptions = (
  courses: ReadonlyArray<{ id: string; title: string }>,
  t: Messages
): ScopeOption[] => [
  { value: ALL, label: t("Bans.filters.scope.all") },
  { value: MADRASAH_SCOPE, label: t("Bans.filters.scope.madrasah") },
  ...courses.map((course) => ({ value: course.id, label: course.title })),
];

// ---- the rows ------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** A ban placed in the last 24 hours wears the "Yeni" badge. */
export const isRecent = (createdAt: Date, now: Date): boolean =>
  now.getTime() - new Date(createdAt).getTime() < DAY_MS;

/** The role of whoever placed it, as words: a placer with no role in the table is read as the Medaris yönetimi. */
export function roleLabel(role: string, t: Messages): string {
  if (role === "SYSTEM_ADMIN") return t("Bans.admin");
  return t.has(`Roles.${role}`) ? t(`Roles.${role}`) : "";
}

/** Roles whose ban only Medaris administration lifts (the top of the ladder). */
const PLATFORM_ROLES: ReadonlySet<string> = new Set([
  "MEDARIS_NAZIM",
  "SYSTEM_ADMIN",
]);

/** What a row offers: each action only where the API says the caller may, and the sentence that stands in for a lift that is not offered. */
export interface BanActions {
  lift: boolean;
  escalate: boolean;
  permanent: boolean;
  /** why there is no "Yasağı kaldır"; null when there is one, and for a lifted ban */
  note: string | null;
}

export function actionsOf(
  ban: Pick<
    MadrasahBanResponse,
    | "liftedAt"
    | "bannedRole"
    | "viewerMayLift"
    | "viewerMayEscalate"
    | "viewerMayRequestPermanent"
  >,
  t: Messages
): BanActions {
  if (ban.liftedAt) {
    return { lift: false, escalate: false, permanent: false, note: null };
  }
  return {
    lift: ban.viewerMayLift,
    escalate: ban.viewerMayEscalate,
    permanent: ban.viewerMayRequestPermanent,
    note: ban.viewerMayLift
      ? null
      : t(
          PLATFORM_ROLES.has(ban.bannedRole)
            ? "Bans.platformOnly"
            : "Bans.higherOnly"
        ),
  };
}

export interface Stamp {
  label: string;
  iso: string;
}

export interface BanRow {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  /** placed in the last 24 hours and still open */
  recent: boolean;
  permanentPending: boolean;
  scope: { kind: "COURSE" | "MADRASAH"; label: string; detail: string[] };
  courseId: string | null;
  courseTitle: string | null;
  reason: string;
  bannedBy: { name: string; role: string };
  when: Stamp;
  lifted: { name: string; when: Stamp; reason: string | null } | null;
  actions: BanActions;
  /** the three lines the lifting dialog opens with */
  summary: { scope: string; bannedBy: string; reason: string };
}

const stamp = (
  at: Date,
  t: Messages,
  where: { locale: string; timeZone: string; now: Date }
): Stamp => ({
  label: whenLabel(new Date(at), where.now, where, t),
  iso: new Date(at).toISOString(),
});

export function banRows(
  items: readonly MadrasahBanResponse[],
  t: Messages,
  where: {
    locale: string;
    timeZone: string;
    now: Date;
    madrasahName: string;
    viewerId?: string;
  }
): BanRow[] {
  return items.map((ban) => {
    const name = ban.user.name ?? ban.user.email ?? t("Nazirs.unknownPerson");
    const placed =
      ban.bannedBy.name ?? ban.bannedBy.email ?? t("Nazirs.unknownPerson");
    const mine =
      where.viewerId !== undefined &&
      ban.bannedBy.id.toLowerCase() === where.viewerId.toLowerCase();
    const role = roleLabel(ban.bannedRole, t);
    const kind = ban.scope === "MADRASAH" ? "MADRASAH" : "COURSE";
    const madrasah = ban.madrasahName ?? where.madrasahName;
    const detail =
      kind === "MADRASAH"
        ? [
            madrasah
              ? t("Bans.madrasahScope", {
                  name: madrasah,
                  nameGenitive: genitive(madrasah, where.locale),
                })
              : t("Bans.madrasahScopeUnnamed"),
            ban.extendedFromCourseTitle
              ? t("Bans.extendedFrom", { course: ban.extendedFromCourseTitle })
              : null,
          ].filter((part): part is string => Boolean(part))
        : [ban.courseTitle].filter((part): part is string => Boolean(part));
    const label = t(`Bans.scope.${kind}`);
    const created = stamp(ban.createdAt, t, where);
    return {
      id: ban.id,
      userId: ban.user.id,
      name,
      email: ban.user.email,
      recent: !ban.liftedAt && isRecent(ban.createdAt, where.now),
      permanentPending: ban.permanentRequestedAt !== null,
      scope: { kind, label, detail },
      courseId: ban.courseId,
      courseTitle: ban.courseTitle,
      reason: ban.reason,
      bannedBy: {
        name: placed,
        role: mine && role ? t("Bans.you", { role }) : role,
      },
      when: created,
      lifted: ban.liftedAt
        ? {
            name:
              ban.liftedBy?.name ??
              ban.liftedBy?.email ??
              t("Nazirs.unknownPerson"),
            when: stamp(ban.liftedAt, t, where),
            reason: ban.liftReason,
          }
        : null,
      actions: actionsOf(ban, t),
      summary: {
        scope: [label, detail[0]].filter(Boolean).join(" · "),
        bannedBy: `${[placed, role].filter(Boolean).join(", ")} · ${created.label}`,
        reason: ban.reason,
      },
    };
  });
}

// ---- the dialogs ---------------------------------------------------------------------

/** The longest reason the API takes. */
export const REASON_MAX = 500;

/** True for a reason that is empty or only white space. */
export const isBlank = (text: string): boolean => text.trim().length === 0;

/** The body of the POST of "Yasakla": the chosen course, or the whole medrese (`MADRASAH_SCOPE`). */
export function banRequest(input: {
  userId: string;
  scope: string;
  reason: string;
}): CreateMadrasahBanDto {
  const reason = input.reason.trim();
  return input.scope === MADRASAH_SCOPE
    ? { userId: input.userId, scope: "MADRASAH", reason }
    : { userId: input.userId, scope: "COURSE", courseId: input.scope, reason };
}

/** The message key of a refused call, from the code the API answered with. */
export function banErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "BAN_FORBIDDEN":
    case "BAN_LIFT_FORBIDDEN":
    case "BAN_ALREADY_LIFTED":
    case "BAN_NOT_FOUND":
    case "BAN_TARGET_INVALID":
    case "BAN_NOT_ESCALATABLE":
    case "BAN_PERMANENT_REQUEST_EXISTS":
    case "BAN_PERMANENT_REQUEST_INVALID":
    case "COURSE_NOT_FOUND":
    case "VALIDATION_ERROR":
      return `Bans.errors.${code}`;
    default:
      return "Problems.actionGeneric";
  }
}

/** Whether the list has moved under the person: the answer means the row is gone or has changed, so it is read again. */
export const listMoved = (code: string): boolean =>
  [
    "BAN_ALREADY_LIFTED",
    "BAN_NOT_FOUND",
    "BAN_NOT_ESCALATABLE",
    "BAN_PERMANENT_REQUEST_EXISTS",
    "BAN_PERMANENT_REQUEST_INVALID",
  ].includes(code);
