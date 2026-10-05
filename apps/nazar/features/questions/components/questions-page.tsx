import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { genitive } from "~/features/courses/courses";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getPortal } from "~/features/shell/reads";
import { findScope } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { QuestionsList } from "./questions-list";

/**
 * Sorular of a course (MDRS-150): what the talebe asked on its sessions,
 * those still waiting first, with the people who may answer them: the
 * müderris, and a ders nazırı the müderris gave "Talebelerin sorularını gör
 * ve yanıtla". The API is the check: it lists the questions to whoever holds
 * `question.answer` in the course and refuses everyone else, so a 403 is a
 * notice and nothing of the list is drawn. The first page is read here; the
 * rest comes with "Daha fazla göster".
 */
export async function QuestionsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, portal, questions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    getPortal(),
    readOnce("the course's questions", (api) =>
      api.lessons.listCourseQuestions({ id: courseId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const courseName =
    (portal.status === "ok"
      ? findScope(portal.scopes, "ders", courseId)?.name
      : undefined) ?? "";

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Questions.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {courseName
            ? t("Questions.subtitle", {
                name: courseName,
                nameGenitive: genitive(courseName, locale),
              })
            : t("Questions.subtitleUnnamed")}
        </p>
      </header>
      {questions.status !== "ok" ? (
        <PageProblem
          status={questions.status}
          failed={{
            title: t("Questions.loadFailedTitle"),
            text: t("Questions.loadFailed"),
          }}
        />
      ) : (
        <QuestionsList
          courseId={courseId}
          initial={questions.data.items}
          initialCursor={questions.data.nextCursor}
          timeZone={timeZone}
        />
      )}
    </>
  );
}

/** The page while the questions are read: the shell stays, and the cards are bars. */
export async function QuestionsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2].map((card) => (
        <Skeleton key={card} height="8rem" />
      ))}
    </output>
  );
}
