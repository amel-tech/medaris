import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import {
  CODES,
  holds,
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
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
 * took out of it. The page opens for a caller who holds the roster
 * (`course.staff_read`) or an enrollment permission in this course, from
 * `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya izniniz
 * yok", a permissions read that failed is the retry state, and the roster is
 * read for neither. Each button is drawn for its own code (`EnrolmentsTabs`)
 * and the API still decides every write. A read of the enrolments that fails
 * or is refused is the page's state. The removed list and the course are side
 * reads: without the list its tab says so, without the course the name comes
 * from the portal's scope.
 */
export async function EnrolmentsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, portal, course, permissions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    getPortal(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([], permissions, PAGE_CODES.students);
  const [enrolments, removed] =
    gate === "ok"
      ? await Promise.all([
          readOnce("the course's enrolments", (api) =>
            api.courses.getCourseEnrollments({ id: courseId })
          ),
          readOnce("the course's removed talebe", (api) =>
            api.courses.getRemovedEnrollments({ id: courseId })
          ),
        ])
      : [null, null];
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
  const held = permissions.status === "ok" ? permissions.data : null;
  const problem =
    gate !== "ok"
      ? gate
      : enrolments === null || enrolments.status === "ok"
        ? null
        : enrolments.status;

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
      {problem !== null || enrolments?.status !== "ok" ? (
        <PageProblem
          status={problem === "forbidden" ? "forbidden" : "failed"}
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
          can={{
            decide: held !== null && holds(held, CODES.enrollmentDecide),
            complete: held !== null && holds(held, CODES.enrollmentComplete),
            remove: held !== null && holds(held, CODES.enrollmentRemove),
          }}
          lists={listsOf(enrolments.data, t, where)}
          removed={
            removed?.status === "ok"
              ? removedRows(removed.data, t, where)
              : null
          }
        />
      )}
    </>
  );
}

/** The page while the enrolments are read: the shell stays, and the table is bars. */
export async function EnrolmentsLoading() {
  const t = await getMessages("nazar.Shell");
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
