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
import { recordingWeeks } from "../recordings";
import { RecordingsTable } from "./recordings-table";

/**
 * Ders kayıtları: the course's sessions by week with the recording each one
 * holds, and where staff add one by pasting its link (nothing is uploaded).
 * The page opens for a caller who holds `recording.manage` in this course,
 * read from `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya
 * izniniz yok", and a permissions read that failed is the retry state. That
 * one code is also what "Kayıt ekle" and "Düzenle" ask of the API, so the
 * table draws both for everyone it is shown to. The recordings are read with
 * the same caller, who holds `recording.manage` and is listed every recording
 * of the course, whatever its visibility; a PROCESSING one has no link yet.
 * The API still decides every write, and its refusal is worded from the code.
 */
export async function RecordingsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, course, permissions, recordings] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the course's recordings", (api) =>
      api.lessons.listCourseRecordings({ id: courseId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const gate = pageGate([course], permissions, PAGE_CODES.recordings);
  const problem =
    gate !== "ok"
      ? gate
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
