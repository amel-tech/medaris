import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getPortal } from "~/features/shell/reads";
import { findScope } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { listsOf, removedRows } from "../enrolments";
import { EnrolmentsTabs } from "./enrolments-tabs";

/**
 * Talebeler of a course: the applications waiting for a decision first, then
 * the enrolled, the ones who completed the course and the ones the course team
 * took out of it. The enrolments are the page's probe: `GET /courses/:id/
 * enrollments` answers 403 to whoever does not hold the roster, and that is the
 * "Bu sayfaya izniniz yok" state. The removed list and the course are side
 * reads: without the list its tab says so, without the course the name comes
 * from the portal's scope.
 */
export async function EnrolmentsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, portal, enrolments, removed, course] =
    await Promise.all([
      getMessages("nazir"),
      getLocale(),
      getViewer(),
      getPortal(),
      readOnce("the course's enrolments", (api) =>
        api.courses.getCourseEnrollments({ id: courseId })
      ),
      readOnce("the course's removed talebe", (api) =>
        api.courses.getRemovedEnrollments({ id: courseId })
      ),
      readOnce("the course", (api) =>
        api.courses.getCourseById({ id: courseId })
      ),
    ]);
  const where = {
    locale,
    timeZone: resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE),
    now: new Date(),
  };
  const courseName =
    (course.status === "ok"
      ? course.data.title
      : portal.status === "ok"
        ? findScope(portal.scopes, "ders", courseId)?.name
        : undefined) ?? "";

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("CourseStudents.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {courseName
            ? t("CourseStudents.subtitle", { course: courseName })
            : t("CourseStudents.subtitleUnnamed")}
        </p>
      </header>
      {enrolments.status !== "ok" ? (
        <PageProblem
          status={enrolments.status}
          failed={{
            title: t("CourseStudents.loadFailedTitle"),
            text: t("CourseStudents.loadFailed"),
          }}
        />
      ) : (
        <EnrolmentsTabs
          courseId={courseId}
          courseName={courseName}
          requiresApproval={
            course.status === "ok" ? course.data.requiresApproval : null
          }
          lists={listsOf(enrolments.data, t, where)}
          removed={
            removed.status === "ok" ? removedRows(removed.data, t, where) : null
          }
        />
      )}
    </>
  );
}

/** The page while the enrolments are read: the shell stays, and the table is bars. */
export async function EnrolmentsLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton height="2.5rem" />
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
