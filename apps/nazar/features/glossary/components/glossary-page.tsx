import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { GlossaryScreen } from "./glossary-screen";

/**
 * Lügat of a course: the terms its müderris defines for it. The page opens
 * for `course.edit` in the course, read from `GET /courses/:id/my-permissions`;
 * anyone else gets "Bu sayfaya izniniz yok". The API decides every write.
 */
export async function GlossaryPage({ courseId }: { courseId: string }) {
  const [t, permissions, terms] = await Promise.all([
    getMessages("nazar.Glossary"),
    readCoursePermissions(courseId),
    readOnce("the course's glossary", (api) =>
      api.courses.listCourseTerms({ id: courseId })
    ),
  ]);
  const gate = pageGate([terms], permissions, PAGE_CODES.glossary);
  if (gate !== "ok" || terms.status !== "ok") {
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
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="mds-body-sm text-neutral-muted">{t("summary")}</p>
      </header>
      <GlossaryScreen
        courseId={courseId}
        terms={terms.data.map((term) => ({
          id: term.id,
          term: term.term,
          arabic: term.arabic,
          lexicalMeaning: term.lexicalMeaning,
          technicalMeaning: term.technicalMeaning,
          example: term.example,
        }))}
      />
    </>
  );
}
