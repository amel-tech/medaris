import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { PlanForm } from "./plan-form";

/**
 * "Celse planla": one session, or a weekly repeat, made in one go. The course
 * is read for its name. The page opens for a holder of `session.manage` in
 * this course, which is what the two calls it makes ask (see `SessionsPage`);
 * the zone the times are typed in starts as the viewer's own.
 */
export async function PlanPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course, permissions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([course], permissions, PAGE_CODES.plan);

  if (course.status !== "ok" || gate !== "ok") {
    return (
      <>
        <header className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("SessionPlan.title")}</h1>
        </header>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("SessionPlan.loadFailedTitle"),
            text: t("SessionPlan.loadFailed"),
          }}
        />
      </>
    );
  }
  return (
    <PlanForm
      courseId={courseId}
      courseTitle={course.data.title}
      locale={locale}
      timeZone={resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE)}
    />
  );
}

/** The page while the course is read: the shell stays, and the form is bars. */
export async function PlanLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton height="2.5rem" />
      <Skeleton height="12rem" />
    </output>
  );
}
