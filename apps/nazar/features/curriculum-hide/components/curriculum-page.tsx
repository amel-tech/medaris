import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { weekRows } from "../curriculum";
import { CurriculumList } from "./curriculum-list";

/**
 * Müfredat of a course (MDRS-143), the part that hides: its live weeks and
 * sessions with "Gizle" on each. Everything else the page says is read-only;
 * writing the syllabus is MDRS-123's editor, which absorbs this page. The API
 * decides who may hide (`week.hide`, or `session.manage` for a session), so the
 * page offers the buttons and a refusal is a notice, as the course's other
 * pages do.
 */
export async function CurriculumPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("CurriculumHide.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("CurriculumHide.intro")}
        </p>
      </header>
      {course.status !== "ok" ? (
        <PageProblem
          status={course.status}
          failed={{
            title: t("CurriculumHide.loadFailedTitle"),
            text: t("CurriculumHide.loadFailed"),
          }}
        />
      ) : (
        <CurriculumList
          courseId={courseId}
          weeks={weekRows(course.data.weeks, t, {
            locale,
            timeZone,
            now: new Date(),
          })}
        />
      )}
    </>
  );
}

/** The page while the course is read: the shell stays, and the weeks are bars. */
export async function CurriculumLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="6rem" />
      ))}
    </output>
  );
}
