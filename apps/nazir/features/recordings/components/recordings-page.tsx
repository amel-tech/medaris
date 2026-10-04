import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { courseAccess } from "~/features/account/course-standing";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { recordingWeeks } from "../recordings";
import { RecordingsTable } from "./recordings-table";

/**
 * Ders kayıtları: the course's sessions by week with the recording each one
 * holds, and where staff add one by pasting its link (nothing is uploaded).
 * The course read is the page's probe: `GET /courses/:id` answers every
 * signed-in caller, and `contentLocked` says the caller does not hold
 * `view_details`. That is not a staff test: the müderris and the enrolled
 * talebe are not locked, a ders nazırı always is. A locked caller therefore
 * opens the page only when their permissions name `recording.manage` in this
 * course (`courseAccess`); otherwise it is the "Bu sayfaya izniniz yok" state,
 * as a 403 is on the other pages. An enrolled talebe is not locked, so the
 * page opens for them and the API refuses their write. The recordings are read
 * with the same caller: a caller without `view_details` is listed only the
 * PUBLIC ones, and a PROCESSING one has no link yet. Adding and changing are
 * the API's own check (`recording.manage`), and its refusal is worded from the
 * code.
 */
export async function RecordingsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course, recordings] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readOnce("the course's recordings", (api) =>
      api.lessons.listCourseRecordings({ id: courseId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const access =
    course.status === "ok"
      ? await courseAccess(course.data, courseId, ["recording.manage"])
      : null;
  const problem =
    course.status !== "ok"
      ? course.status
      : access !== "ok"
        ? access
        : recordings.status !== "ok"
          ? recordings.status
          : null;

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Recordings.title")}</h1>
        {course.status === "ok" ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("Recordings.subtitle", { name: course.data.title })}
          </p>
        ) : null}
        {problem === null ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("Recordings.note")}
          </p>
        ) : null}
      </header>
      {course.status !== "ok" || recordings.status !== "ok" || problem ? (
        <PageProblem
          status={problem === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("Recordings.loadFailedTitle"),
            text: t("Recordings.loadFailed"),
          }}
        />
      ) : (
        <RecordingsTable
          blocks={recordingWeeks(course.data, recordings.data)}
          closed={course.data.isClosed}
          locale={locale}
          timeZone={timeZone}
        />
      )}
    </>
  );
}

/** The page while the course is read: the shell stays, and the tables are bars. */
export async function RecordingsLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
