import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { CurriculumEditor } from "./curriculum-editor";

/**
 * Müfredat of a course: its details, weeks and sessions as one form. The
 * course read is the page's probe: `GET /courses/:id` answers every signed-in
 * caller, but strips the programme's content (links, agendas) from anyone who
 * is not course staff, and says so with `contentLocked`; that is the "Bu
 * sayfaya izniniz yok" state here, as a 403 is on the other pages. Saving is
 * the API's own check (`PUT /courses/:id`), and its refusal is worded from the
 * code. The editor is keyed by the course version, so reading the course again
 * (after a save, or after a conflict) starts a fresh form.
 */
export async function CurriculumPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const problem =
    course.status !== "ok"
      ? course.status
      : course.data.contentLocked
        ? "forbidden"
        : null;

  if (course.status !== "ok" || problem !== null) {
    return (
      <>
        <header className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Curriculum.title")}</h1>
        </header>
        <PageProblem
          status={problem === "forbidden" ? "forbidden" : "failed"}
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
