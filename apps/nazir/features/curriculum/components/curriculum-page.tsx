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
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { CurriculumEditor } from "./curriculum-editor";

/**
 * Müfredat of a course: its details, weeks and sessions as one form. The page
 * opens for a caller who holds `course.edit` or `session.manage` in this
 * course, read from `GET /courses/:id/my-permissions`; anyone else gets "Bu
 * sayfaya izniniz yok", and a permissions read that failed is the retry state.
 * The course read carries the links and agendas to those holders, so the form
 * is filled with what is stored. What the editor lets the caller change follows
 * what they hold (`CurriculumEditor`): saving is `course.edit`, and adding,
 * moving or hiding a session is `session.manage` as well. Saving is the API's
 * own check (`PUT /courses/:id`), and its refusal is worded from the code. The
 * editor is keyed by the course version, so reading the course again (after a
 * save, or after a conflict) starts a fresh form.
 */
export async function CurriculumPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course, permissions] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const gate = pageGate([course], permissions, PAGE_CODES.curriculum);

  if (course.status !== "ok" || permissions.status !== "ok" || gate !== "ok") {
    return (
      <>
        <header className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Curriculum.title")}</h1>
        </header>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("Curriculum.loadFailedTitle"),
            text: t("Curriculum.loadFailed"),
          }}
        />
      </>
    );
  }
  return (
    <CurriculumEditor
      key={course.data.version}
      course={course.data}
      can={{
        edit: holds(permissions.data, CODES.courseEdit),
        sessions: holds(permissions.data, CODES.sessionManage),
        hide: holds(permissions.data, CODES.weekHide),
      }}
      locale={locale}
      timeZone={timeZone}
    />
  );
}

/** The page while the course is read: the shell stays, and the form is bars. */
export async function CurriculumLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton height="10rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
