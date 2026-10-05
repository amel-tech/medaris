import type {
  CourseNazirsResponse,
  KoskPersonResponse,
} from "@medaris/services/tedrisat";
import {
  type Dated,
  type PickedPerson,
  permissionLabel,
  personName,
} from "~/features/nazirs/nazirs";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Ders nazırları of a course (MDRS-270) as rules: what each row of the table
 * says, which boxes the dialog lets the caller tick, whom it will not appoint,
 * and how a refusal is worded. What the caller may do on each row comes from
 * the API's list (`mayAppoint`, `grantable`, `mayEdit`, `mayEnd`), never from
 * a guess here: the API decides every write again.
 */

/** What the table and the dialogs need from the page, beside the rows. */
export interface CourseNazirsContext {
  courseId: string;
  courseTitle: string;
  /** the course catalog, in order: the boxes the dialog draws */
  catalog: string[];
  /** the codes the caller may give here; empty for one who appoints only */
  grantable: string[];
  /** the viewer's zone: "Bitiş tarihi ve saati" is read on their clock */
  timeZone: string;
  viewerId: string | null;
  /** the people who hold a post in the course now */
  holders: string[];
}

export const courseNazirsContext = (
  list: CourseNazirsResponse,
  where: { courseId: string; timeZone: string; viewerId: string | null }
): CourseNazirsContext => ({
  courseId: where.courseId,
  courseTitle: list.course.title,
  catalog: [...list.catalog],
  grantable: [...list.grantable],
  timeZone: where.timeZone,
  viewerId: where.viewerId,
  holders: list.items.map((item) => item.user.id),
});

/** One line of the table, already worded and dated, so that the table has nothing to translate. */
export interface CourseNazirRow {
  /** the post: "İzinleri düzenle" and "Görevden al" address it */
  id: string;
  userId: string;
  name: string;
  email: string | null;
  /** the codes the post holds, in the catalog's order */
  codes: string[];
  /** "2 izin", or "İzin yok" */
  count: string;
  /** the sentences of the codes held; null when none is */
  permissionsLine: string | null;
  /** the post's end, which its permissions share; `iso` null is "Süresiz" */
  ends: { label: string; iso: string | null };
  /** who appointed: the Atayan column */
  giver: { name: string; isYou: boolean; at: Dated };
  /** "Atayan: … · 30 Eylül 2026", for the dialog's card */
  appointedLine: string;
  /** the viewer's own post */
  isYou: boolean;
  mayEdit: boolean;
  mayEnd: boolean;
  /** the posts in the list this person appointed: they end first (DISMISS_SEAT_HANDED_ON) */
  appointees: number;
}

const samePerson = (
  a: string | null | undefined,
  b: string | null | undefined
): boolean => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

const named = (person: KoskPersonResponse) => ({
  name: person.name ?? null,
  email: person.email ?? null,
});

const dated = (at: Date | string, day: Intl.DateTimeFormat): Dated => {
  const date = new Date(at);
  return { label: day.format(date), iso: date.toISOString() };
};

/** The rows of the table, in the order the API gave them (oldest post first). */
export function courseNazirRows(
  list: Pick<CourseNazirsResponse, "items">,
  where: { t: Messages; day: Intl.DateTimeFormat; viewerId: string | null }
): CourseNazirRow[] {
  const { t, day, viewerId } = where;
  const unknown = t("CourseNazirs.unknownPerson");
  return list.items.map((item) => {
    const giver = personName(named(item.grantedBy), unknown);
    const held = item.permissions;
    return {
      id: item.id,
      userId: item.user.id,
      name: personName(named(item.user), unknown),
      email: item.user.email ?? null,
      codes: [...held],
      count:
        held.length > 0
          ? t("CourseNazirs.permissionCount", { count: held.length })
          : t("CourseNazirs.noPermissions"),
      permissionsLine:
        held.length > 0
          ? held.map((code) => permissionLabel(code, t)).join(" · ")
          : null,
      ends: item.endsAt
        ? dated(item.endsAt, day)
        : { label: t("CourseNazirs.never"), iso: null },
      giver: {
        name: giver,
        isYou: samePerson(item.grantedBy.id, viewerId),
        at: dated(item.grantedAt, day),
      },
      appointedLine: t("CourseNazirs.appointedBy", {
        name: giver,
        date: day.format(new Date(item.grantedAt)),
      }),
      isYou: samePerson(item.user.id, viewerId),
      mayEdit: item.mayEdit,
      mayEnd: item.mayEnd,
      appointees: list.items.filter(
        (other) =>
          other.id !== item.id && samePerson(other.grantedBy.id, item.user.id)
      ).length,
    };
  });
}

/**
 * The caller appoints but gives nothing: they hold `course_nazir.assign` by a
 * grant, not `permission.grant` by a role, so the person they appoint starts
 * with no permission and the dialog draws no box.
 */
export const appointsOnly = (
  list: Pick<CourseNazirsResponse, "mayAppoint" | "grantable">
): boolean => list.mayAppoint && list.grantable.length === 0;

/**
 * A box of the dialog. It is on for a code the caller may give, and for one
 * the post holds already: taking a code away is no gift, so a held code the
 * caller could not give can still be unticked (and ticked back).
 */
export function boxState(
  code: string,
  of: {
    grantable: readonly string[];
    held: readonly string[];
    chosen: readonly string[];
  }
): { enabled: boolean; ticked: boolean } {
  return {
    enabled: of.grantable.includes(code) || of.held.includes(code),
    ticked: of.chosen.includes(code),
  };
}

/** The codes the dialog sends: the ones ticked, in the catalog's order. */
export const chosenCodes = (
  catalog: readonly string[],
  chosen: readonly string[]
): string[] => catalog.filter((code) => chosen.includes(code));

/**
 * Why the person found cannot be appointed, before anything is sent: nobody
 * appoints themselves (the API answers SELF_GRANT_REFUSED to everyone but the
 * başnazım, who holds every code of the course without a post), and a person
 * holds one post per course (COURSE_NAZIR_EXISTS).
 */
export function pickProblem(
  person: Pick<PickedPerson, "id"> | null,
  of: Pick<CourseNazirsContext, "viewerId" | "holders">
): "self" | "already" | null {
  if (!person) return null;
  if (samePerson(person.id, of.viewerId)) return "self";
  return of.holders.some((holder) => samePerson(holder, person.id))
    ? "already"
    : null;
}

/**
 * The dialog's "Kaydet" on a post would change nothing: the same codes and
 * the same end. It then closes without a write, which would only add a line
 * to the audit log.
 */
export const unchangedPost = (
  row: Pick<CourseNazirRow, "codes" | "ends">,
  sent: { permissions: readonly string[]; endsAt: string | null }
): boolean =>
  sent.permissions.length === row.codes.length &&
  sent.permissions.every((code) => row.codes.includes(code)) &&
  (sent.endsAt === null || row.ends.iso === null
    ? sent.endsAt === row.ends.iso
    : new Date(sent.endsAt).getTime() === new Date(row.ends.iso).getTime());

/** The message key of a refused appointment, change or dismissal, from the code the API answered with. */
export function courseNazirErrorKey(code: string): string {
  switch (code) {
    case "SELF_GRANT_REFUSED":
      return "Problems.selfGrant";
    case "AUTHZ_FORBIDDEN":
    case "PERMISSION_NOT_GIVABLE":
      return "Problems.actionForbidden";
    case "PERMISSION_UNKNOWN":
      return "Problems.permissionUnknown";
    case "NAZIR_NOT_APPOINTED_BY_YOU":
      return "CourseNazirs.errors.notYours";
    case "GRANT_EXCEEDS_GIVER":
      return "CourseNazirs.errors.exceeds";
    case "GRANT_EXPIRY_INVALID":
      return "CourseNazirs.errors.expiryInvalid";
    case "COURSE_NAZIR_EXISTS":
      return "CourseNazirs.errors.exists";
    case "COURSE_NAZIR_NOT_FOUND":
      return "CourseNazirs.errors.gone";
    case "COURSE_NAZIR_UNKNOWN_ACCOUNT":
      return "CourseNazirs.errors.unknownAccount";
    case "COURSE_NAZIR_HOLDS_SEAT":
      return "CourseNazirs.errors.holdsSeat";
    case "COURSE_NAZIR_BARRED":
      return "CourseNazirs.errors.barred";
    case "GRANT_COURSE_INVALID":
      return "CourseNazirs.errors.hidden";
    case "DISMISS_SEAT_HANDED_ON":
      return "CourseNazirs.errors.hasAppointees";
    case "KEYCLOAK_ADMIN_UNAVAILABLE":
      return "CourseNazirs.errors.directory";
    default:
      return "Problems.actionGeneric";
  }
}

/** The refusals after which the dialog's post is not what it showed: it closes and the list is read again. */
export const listMoved = (code: string): boolean =>
  code === "COURSE_NAZIR_EXISTS" || code === "COURSE_NAZIR_NOT_FOUND";
