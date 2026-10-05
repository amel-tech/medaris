import type { AssignmentResponse } from "@medaris/services/tedrisat";
import type { BadgeVariant } from "@medaris/ui/mds/badge";
import type { Messages } from "~/lib/i18n/messages";

/** One line of "Görevleriniz", already worded and dated, so the table has nothing to translate. */
export interface AssignmentRow {
  id: string;
  role: string;
  isImam: boolean;
  scopeTitle: string | null;
  scopeBadge: { label: string; variant: BadgeVariant; hidden: boolean } | null;
  scopeMeta: string[];
  grantor: string;
  grantedAt: { label: string; iso: string };
  expires: { label: string; iso: string | null };
}

export type ScopeBadge = "active" | "published" | "draft" | "hidden";

/** The badge beside a scope: a course's state (hidden wins over published and draft), "Etkin" for the rest. */
export const scopeBadge = (
  assignment: Pick<AssignmentResponse, "scopeName" | "course">
): ScopeBadge | null => {
  const course = assignment.course;
  if (course) {
    if (course.hidden) return "hidden";
    return course.status === "PUBLISHED" ? "published" : "draft";
  }
  return assignment.scopeName ? "active" : null;
};

/** The second line of the scope cell: the köşk, then the medrese, when there is one. */
export const scopeMeta = (
  assignment: Pick<AssignmentResponse, "course">
): string[] =>
  [assignment.course?.koskName, assignment.course?.madrasahName].filter(
    (part): part is string => Boolean(part)
  );

const SCOPE_ORDER: Readonly<Record<string, number>> = {
  platform: 0,
  kosk: 1,
  madrasah: 2,
  course: 3,
};

/** The list the table shows: the medrese roles first, then the courses; the platform's and the köşk's last. */
export function sortAssignments<
  T extends Pick<AssignmentResponse, "scopeType">,
>(assignments: readonly T[]): T[] {
  const rank = (type: string) => {
    if (type === "madrasah") return 0;
    if (type === "course") return 1;
    return 2 + (SCOPE_ORDER[type] ?? 9);
  };
  return [...assignments].sort((a, b) => rank(a.scopeType) - rank(b.scopeType));
}

/**
 * The note under the table: true when the person holds neither a medrese
 * nazırlığı nor a ders nazırlığı ("Medrese nazırlığınız ya da ders nazırlığınız
 * yok."), whatever else they hold.
 */
export const lacksNazirRoles = (
  assignments: ReadonlyArray<Pick<AssignmentResponse, "role">>
): boolean =>
  !assignments.some(
    (a) => a.role === "MEDRESE_NAZIR" || a.role === "DERS_NAZIR"
  );

export const BADGE_VARIANT: Readonly<Record<ScopeBadge, BadgeVariant>> = {
  active: "secondary",
  published: "primary",
  draft: "outline",
  hidden: "ghost",
};

/**
 * The rows of "Görevleriniz": each assignment worded, dated in the viewer's
 * zone (`day`), and its grantor named ("Kendiniz" when they gave it to
 * themselves).
 */
export function assignmentRows(
  assignments: readonly AssignmentResponse[],
  t: Messages,
  day: Intl.DateTimeFormat
): AssignmentRow[] {
  return sortAssignments(assignments).map((a) => {
    const badge = scopeBadge(a);
    const grantedAt = new Date(a.grantedAt);
    return {
      id: a.id,
      role: t(`Roles.${a.role}`),
      isImam: a.isImam,
      scopeTitle: a.scopeName ?? null,
      scopeBadge: badge
        ? {
            label: t(`Account.scopeBadge.${badge}`),
            variant: BADGE_VARIANT[badge],
            hidden: badge === "hidden",
          }
        : null,
      scopeMeta: scopeMeta(a),
      grantor: a.grantedBySelf
        ? t("Account.self")
        : (a.grantedBy.displayName ?? t("Account.unknownPerson")),
      grantedAt: { label: day.format(grantedAt), iso: grantedAt.toISOString() },
      expires: a.expiresAt
        ? {
            label: day.format(new Date(a.expiresAt)),
            iso: new Date(a.expiresAt).toISOString(),
          }
        : { label: t("Account.noExpiry"), iso: null },
    };
  });
}
