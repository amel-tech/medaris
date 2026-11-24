import { Skeleton } from "@medaris/ui/mds/skeleton";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { boardOf } from "../evaluation";
import { EvaluationBoard } from "./evaluation-board";

/**
 * "Değerlendirme" of a course (MDRS-248): its talebe marked on the homework
 * recited to the müderris. The page opens for a holder of `session.manage`
 * in this course (the müderris by role, a ders nazırı by grant), read from
 * `GET /courses/:id/my-permissions`; the menu shows it to them alone, and
 * anyone who opens it by its address gets "Bu sayfaya izniniz yok". The
 * board is read with the same caller (`GET /courses/:id/evaluations`), which
 * tedrisat refuses to anyone else.
 */
export async function EvaluationPage({ courseId }: { courseId: string }) {
  const [t, course, permissions, board] = await Promise.all([
    getMessages("nazar"),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the course's evaluation board", (api) =>
      api.evaluations.getEvaluationBoard({ id: courseId })
    ),
  ]);
  const gate = pageGate([course], permissions, PAGE_CODES.evaluation);
  const problem =
    gate !== "ok" ? gate : board.status !== "ok" ? board.status : null;
  const name = course.status === "ok" ? course.data.title : "";

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Evaluation.title")}</h1>
        {name ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("Evaluation.subtitle", { name })}
          </p>
        ) : null}
      </header>
      {board.status !== "ok" || problem ? (
        <PageProblem
          status={problem === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("Evaluation.loadFailedTitle"),
            text: t("Evaluation.loadFailed"),
          }}
        />
      ) : (
        <EvaluationBoard initial={boardOf(board.data)} courseId={courseId} />
      )}
    </>
  );
}

/** The page while the board is read: the shell stays, and the rows are bars. */
export async function EvaluationLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
