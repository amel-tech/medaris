import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { ResultsView } from "./results-view";

/**
 * One published online exam's results (MDRS-299, nazar.exams.results): read
 * by those who prepare the course's exams (`exam.prepare`; the owner,
 * 22 Nov 2026), released by those who hold `session.manage`.
 */
export async function ResultsPage({
  courseId,
  examId,
}: {
  courseId: string;
  examId: string;
}) {
  const [t, results, permissions] = await Promise.all([
    getMessages("nazar"),
    readOnce("the online exam's results", (api) =>
      api.onlineExams.getOnlineExamResults({ examId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([results], permissions, PAGE_CODES.exams);
  const back = (
    <a className="mds-link mds-body-sm" href={`/ders/${courseId}/sinavlar`}>
      {t("OnlineExams.backToList")}
    </a>
  );
  if (results.status !== "ok" || gate !== "ok") {
    return (
      <>
        <header className="flex max-inline-measure flex-col gap-1">
          {back}
          <h1 className="mds-h1">{t("ExamResults.title")}</h1>
        </header>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("OnlineExams.loadFailedTitle"),
            text: t("OnlineExams.loadFailed"),
          }}
        />
      </>
    );
  }
  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        {back}
        <h1 className="mds-h1">
          {t("ExamResults.heading", { title: results.data.exam.title })}
        </h1>
      </header>
      <ResultsView initial={results.data} />
    </>
  );
}

export async function ResultsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="16rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="6rem" />
      ))}
    </output>
  );
}
