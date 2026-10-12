import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { FileErrorNotice } from "~/features/files/components/file-error-notice";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { homeworkSessions } from "../homework";
import { HomeworkList } from "./homework-list";

/**
 * Ödevler of a course (MDRS-290): what talebe handed in on its celses, a
 * table per celse in programme order, with a filter for one celse. The page
 * opens for a holder of `submission.read` in this course (the müderris, the
 * köşk nazımı and the başmüderris by their role, a ders nazırı by grant),
 * read from `GET /courses/:id/my-permissions`; the menu shows it to them
 * alone, and anyone who opens it by its address gets "Bu sayfaya izniniz
 * yok". A permissions read that failed is the retry state.
 *
 * The homework is read with the same caller (`GET /courses/:id/submissions`),
 * which tedrisat refuses to anyone else. Each file is a plain link to this
 * app's route, which streams it from tedrisat as an attachment; tedrisat
 * writes each such download to the audit log. Times are on the course's
 * clock, as a celse's are for the course team.
 */
export async function HomeworkPage({ courseId }: { courseId: string }) {
  const [t, locale, course, permissions, submissions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the course's homework", (api) =>
      api.submissions.listCourseSubmissions({ id: courseId })
    ),
  ]);
  const gate = pageGate([course], permissions, PAGE_CODES.homework);
  const problem =
    gate !== "ok"
      ? gate
      : submissions.status !== "ok"
        ? submissions.status
        : null;
  const name = course.status === "ok" ? course.data.title : "";

  return (
    <>
      <FileErrorNotice />
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Homework.title")}</h1>
        {name ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("Homework.subtitle", { name })}
          </p>
        ) : null}
      </header>
      {course.status !== "ok" || submissions.status !== "ok" || problem ? (
        <PageProblem
          status={problem === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("Homework.loadFailedTitle"),
            text: t("Homework.loadFailed"),
          }}
        />
      ) : (
        <HomeworkList
          courseId={courseId}
          sessions={homeworkSessions(course.data, submissions.data.items)}
          locale={locale}
          courseTimeZone={resolveTimeZone(
            course.data.timeZone,
            DEFAULT_TIME_ZONE
          )}
        />
      )}
    </>
  );
}

/** The page while the homework is read: the shell stays, and the tables are bars. */
export async function HomeworkLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton width="16rem" height="2.5rem" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
