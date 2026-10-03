import type {
  AssignmentResponse,
  DashboardApplicationResponse,
  DashboardSessionResponse,
} from "@medaris/services/tedrisat";
import type { BadgeVariant } from "@medaris/ui/mds/badge";
import { resolveMeetingPlatform } from "@medaris/utils";
import { BADGE_VARIANT, scopeBadge } from "~/features/account/assignments-view";
import type { Scope } from "~/features/shell/scope";
import { scopeOption } from "~/features/shell/scope-option";
import { shortDay } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";

/**
 * The Pano (nazir 01) as rules: the greeting and the numbers in it, the scope
 * cards, the rows of the two tables, the counters that follow a decision, and
 * which refusal says what. Pure on purpose, so that the page and the tables
 * have nothing to decide.
 */

// ---- the greeting ---------------------------------------------------------------------

/**
 * "Selâmün aleyküm, {Ad} Hoca. Önümüzdeki 7 günde {n} celse var; {m} başvuru
 * onayınızı bekliyor." The numbers are the lengths the dashboard sends: the
 * sessions of the next seven days and every pending application, which the
 * tables below show (the applications table shows the newest 50). Without a
 * given name there is no "{Ad} Hoca", and without the numbers (the dashboard
 * could not be read) there is only the greeting.
 */
export function greetingOf(
  givenName: string | null | undefined,
  counts: { sessions: number; applications: number } | null,
  t: Messages
): string {
  const name = givenName?.trim();
  const hello = name ? t("Pano.greeting", { name }) : t("Pano.greetingBare");
  return counts ? `${hello} ${t("Pano.summary", counts)}` : hello;
}

// ---- the scope cards ------------------------------------------------------------------

export interface CourseCard {
  id: string;
  title: string;
  href: string;
  /** null when the API sent nothing about the course */
  state: { label: string; variant: BadgeVariant } | null;
  /** "Müderris · dersin imamı" */
  role: string;
  /** "Nûruosmaniye Köşkü · 35 talebe"; null with no course info */
  footer: string | null;
}

/**
 * A card for every course the caller holds a scope in. The state is the one
 * "Görevleriniz" uses (hidden wins over published and draft), and the köşk and
 * the number of talebe come from the assignment's course.
 */
export function courseCards(
  scopes: readonly Scope[],
  assignments: readonly AssignmentResponse[],
  t: Messages,
  locale: string
): CourseCard[] {
  const numbers = new Intl.NumberFormat(locale);
  const words = {
    role: (role: string) => t(`Roles.${role}`),
    imam: t("Shell.imam"),
  };
  return scopes
    .filter((scope) => scope.kind === "ders")
    .map((scope) => {
      const held = assignments.find(
        (a) =>
          a.scopeType === "course" &&
          a.scopeId?.toLowerCase() === scope.id.toLowerCase() &&
          a.course
      );
      const info = held?.course;
      const badge = held ? scopeBadge(held) : null;
      return {
        id: scope.id,
        title: scope.name,
        href: `/ders/${encodeURIComponent(scope.id)}`,
        state: badge
          ? {
              label: t(`Account.scopeBadge.${badge}`),
              variant: BADGE_VARIANT[badge],
            }
          : null,
        role: scopeOption(scope, words).summary.join(" · "),
        footer: info
          ? t("Pano.students", {
              kosk: info.koskName,
              count: numbers.format(info.studentCount),
            })
          : null,
      };
    });
}

// ---- the sessions ---------------------------------------------------------------------

export interface SessionRow {
  key: string;
  courseId: string;
  title: string;
  /** "Hafta 2 · Fatih Köşkü" */
  meta: string;
  /** "3 Eki Cmt 19:00" */
  time: { label: string; iso: string };
  /** the platform the host names; null when the celse has no link yet */
  platform: { id: string; host: string } | null;
  /** the course's own page for the celseler, while the caller holds a scope there */
  editHref: string | null;
}

/** "3 Eki Cmt 19:00": the day, the month, the weekday and the time, in the viewer's zone. */
export const sessionTime = (
  at: Date,
  where: { locale: string; timeZone: string }
): string =>
  new Intl.DateTimeFormat(where.locale, {
    timeZone: where.timeZone,
    day: "numeric",
    month: "short",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

/**
 * The sessions of the next seven days, in the order the API sends them (the
 * soonest first). The platform is resolved from the host by `resolveMeetingPlatform`
 * and never picked by hand; no link is ever sent, only its host.
 */
export function sessionRows(
  items: readonly DashboardSessionResponse[],
  t: Messages,
  where: { locale: string; timeZone: string; held: ReadonlySet<string> }
): SessionRow[] {
  return items.map((item) => {
    const at = new Date(item.scheduledAt);
    return {
      key: item.lessonId,
      courseId: item.courseId,
      title: item.courseTitle,
      meta: [
        t("Pano.sessions.week", { number: item.weekNumber }),
        item.koskName,
      ].join(" · "),
      time: { label: sessionTime(at, where), iso: at.toISOString() },
      platform: item.meetingHost
        ? {
            id: resolveMeetingPlatform(item.meetingHost).id,
            host: item.meetingHost,
          }
        : null,
      editHref: where.held.has(item.courseId.toLowerCase())
        ? `/ders/${encodeURIComponent(item.courseId)}/celseler`
        : null,
    };
  });
}

// ---- the applications -----------------------------------------------------------------

export interface ApplicationRow {
  key: string;
  courseId: string;
  userId: string;
  name: string;
  courseTitle: string;
  at: { label: string; iso: string };
  /** only the course's müderris, the köşk's nazım and the sistem yöneticisi may decide */
  mayDecide: boolean;
}

export function applicationRows(
  items: readonly DashboardApplicationResponse[],
  t: Messages,
  where: { locale: string; timeZone: string; now: Date }
): ApplicationRow[] {
  return items.map((item) => ({
    key: `${item.courseId}:${item.userId}`,
    courseId: item.courseId,
    userId: item.userId,
    name: item.studentName ?? item.studentEmail ?? t("Nazirs.unknownPerson"),
    courseTitle: item.courseTitle,
    at: {
      label: shortDay(new Date(item.appliedAt), where.now, where),
      iso: new Date(item.appliedAt).toISOString(),
    },
    mayDecide: item.viewerMayDecide,
  }));
}

/**
 * The counter above the applications ("3 başvuru · 2 derste") once some have
 * been decided on this page and the dashboard has not been read again. When the
 * rows are every application the courses are counted from the rows left; when
 * the dashboard held more than it lists they cannot be, and the dashboard's
 * number stands, never above the number of applications.
 */
export function pendingCounts(
  pending: { total: number; courses: number },
  rows: ReadonlyArray<Pick<ApplicationRow, "key" | "courseId">>,
  removed: ReadonlySet<string>
): { count: number; courses: number } {
  const count = Math.max(0, pending.total - removed.size);
  const complete = pending.total === rows.length;
  return {
    count,
    courses: complete
      ? new Set(
          rows.filter((row) => !removed.has(row.key)).map((row) => row.courseId)
        ).size
      : Math.min(pending.courses, count),
  };
}

/** The message key of a refused decision, from the code the API answered with. */
export function decisionErrorKey(code: string): string {
  switch (code) {
    case "ENROLLMENT_NOT_FOUND":
    case "ENROLLMENT_STATE_CONFLICT":
      return "Pano.applications.errors.gone";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}

/** Whether the answer means the application is no longer waiting, so it leaves the list. */
export const applicationGone = (code: string): boolean =>
  code === "ENROLLMENT_NOT_FOUND" || code === "ENROLLMENT_STATE_CONFLICT";
