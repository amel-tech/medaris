import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { NewExamForm } from "./new-exam-form";

/** "Sınavlar" of a course (MDRS-299): its online exams, and "Yeni sınav". Opens with `exam.prepare`. */
export async function ExamsPage({ courseId }: { courseId: string }) {
  const [t, exams, permissions] = await Promise.all([
    getMessages("nazar"),
    readOnce("the course's online exams", (api) =>
      api.onlineExams.listOnlineExams({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([exams], permissions, PAGE_CODES.exams);
  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("OnlineExams.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("OnlineExams.intro")}
        </p>
      </header>
      {exams.status !== "ok" || gate !== "ok" ? (
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("OnlineExams.loadFailedTitle"),
            text: t("OnlineExams.loadFailed"),
          }}
        />
      ) : (
        <>
          <NewExamForm courseId={courseId} />
          {exams.data.length === 0 ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("OnlineExams.none")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {exams.data.map((exam) => (
                <li key={exam.id}>
                  <a
                    className="mds-link"
                    href={`/ders/${courseId}/sinavlar/${exam.id}`}
                  >
                    {exam.title}
                  </a>{" "}
                  <span className="mds-body-sm text-neutral-muted">
                    {t("OnlineExams.questionCount", {
                      count: exam.questionCount,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

export async function ExamsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="2rem" />
      ))}
    </output>
  );
}
