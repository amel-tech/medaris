import Link from "next/link";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { sarfRootFacts } from "../../sarf/sarf";
import { boardFact } from "../board";
import { BoardEditor } from "./board-editor";

/**
 * Ders tahtası of one session: the canvas the müderris teaches on, kept so
 * the talebe finds it on the session's page. The page opens for
 * `session.manage` in the course; anyone else gets "Bu sayfaya izniniz yok".
 * The roots of the course's sarf page come with it, to lay a table of; a
 * failed read of those only empties that picker.
 */
export async function BoardPage({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const [t, course, permissions, board, roots] = await Promise.all([
    getMessages("nazar.Board"),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the session's board", (api) =>
      api.lessons.getLessonBoard({ id: lessonId })
    ),
    readOnce("the course's sarf roots", (api) =>
      api.courses.listCourseSarfRoots({ id: courseId })
    ),
  ]);
  const gate = pageGate([course, board], permissions, PAGE_CODES.board);
  const session =
    course.status === "ok"
      ? course.data.weeks
          .flatMap((week) => week.lessons)
          .find((lesson) => lesson.id === lessonId)
      : undefined;
  if (gate !== "ok" || board.status !== "ok" || !session) {
    return (
      <>
        <h1 className="mds-h1">{t("title")}</h1>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{ title: t("loadFailedTitle"), text: t("loadFailed") }}
        />
      </>
    );
  }

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <p className="mds-body-sm">
          <Link href={`/ders/${courseId}/celseler`}>{t("back")}</Link>
        </p>
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          <bdi>{session.title}</bdi>
        </p>
      </header>
      <BoardEditor
        lessonId={lessonId}
        board={boardFact(board.data)}
        roots={roots.status === "ok" ? sarfRootFacts(roots.data) : []}
      />
    </>
  );
}
