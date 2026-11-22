import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { ExamEditor } from "./exam-editor";

/** One online exam's draft (MDRS-299): the course's topics and the exam's questions. */
export async function ExamPage({
  courseId,
  examId,
}: {
  courseId: string;
  examId: string;
}) {
  const [t, draft, permissions] = await Promise.all([
    getMessages("nazar"),
    readOnce("the online exam", (api) =>
      api.onlineExams.getOnlineExamDraft({ examId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([draft], permissions, PAGE_CODES.exams);
  if (draft.status !== "ok" || gate !== "ok") {
    return (
      <>
        <h1 className="mds-h1">{t("OnlineExams.title")}</h1>
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
        <a className="mds-link mds-body-sm" href={`/ders/${courseId}/sinavlar`}>
          {t("OnlineExams.backToList")}
        </a>
        <h1 className="mds-h1">{draft.data.title}</h1>
      </header>
      <ExamEditor
        key={draft.data.version}
        courseId={courseId}
        draft={draft.data}
      />
    </>
  );
}

export async function ExamLoading() {
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
