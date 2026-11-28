import Link from "next/link";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { TeacherNoteEditor } from "./teacher-note-editor";

/**
 * Ders notu of one session: the Markdown text the müderris writes for it,
 * which the talebe reads on the session's page. The page opens for
 * `session.manage` in the course; anyone else gets "Bu sayfaya izniniz yok".
 */
export async function TeacherNotePage({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const [t, course, permissions, note] = await Promise.all([
    getMessages("nazar.TeacherNote"),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the session's note", (api) =>
      api.lessons.getLessonTeacherNote({ id: lessonId })
    ),
  ]);
  const gate = pageGate([course, note], permissions, PAGE_CODES.teacherNote);
  const session =
    course.status === "ok"
      ? course.data.weeks
          .flatMap((week) => week.lessons)
          .find((lesson) => lesson.id === lessonId)
      : undefined;
  if (gate !== "ok" || note.status !== "ok" || !session) {
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
        <p className="mds-body-sm text-neutral-muted">{t("summary")}</p>
      </header>
      <TeacherNoteEditor lessonId={lessonId} note={note.data.body} />
    </>
  );
}
