import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { TalebeAnswersView } from "./talebe-answers-view";

/**
 * One talebe's answers on an online exam (MDRS-299), opened from a row of the
 * results page. The owner, 22 Nov 2026: "sınav sonuçlarında talebeye tıklayıp
 * hangi soruya ne cevap verdiğini ayrıca görebilmek lazım". Read by those who
 * prepare the course's exams (`exam.prepare`), as the results are.
 */
export async function TalebeAnswersPage({
  courseId,
  examId,
  userId,
}: {
  courseId: string;
  examId: string;
  userId: string;
}) {
  const [t, answers, permissions] = await Promise.all([
    getMessages("nazar"),
    readOnce("a talebe's answers on the online exam", (api) =>
      api.onlineExams.getOnlineExamTalebeAnswers({ examId, userId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([answers], permissions, PAGE_CODES.exams);
  const back = (
    <a
      className="mds-link mds-body-sm"
      href={`/ders/${courseId}/sinavlar/${examId}/sonuclar`}
    >
      {t("ExamAnswers.backToResults")}
    </a>
  );
  if (answers.status !== "ok" || gate !== "ok") {
    return (
      <>
        <header className="flex max-inline-measure flex-col gap-1">
          {back}
          <h1 className="mds-h1">{t("ExamAnswers.title")}</h1>
        </header>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("ExamAnswers.loadFailedTitle"),
            text: t("ExamAnswers.loadFailed"),
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
          {t("ExamAnswers.heading", {
            name: answers.data.name ?? t("ExamResults.unnamed"),
          })}
        </h1>
        <p className="mds-body-sm text-neutral-muted">
          {answers.data.exam.title}
        </p>
      </header>
      <TalebeAnswersView answers={answers.data} />
    </>
  );
}

export async function TalebeAnswersLoading() {
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
