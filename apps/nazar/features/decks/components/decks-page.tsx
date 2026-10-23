import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Progress } from "@medaris/ui/mds/progress";
import Link from "next/link";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  coverInitials,
  type DeckFact,
  deckHref,
  deckTotals,
  masteredPercent,
  type WeekOption,
} from "../decks";
import { DecksActions } from "./decks-actions";

/**
 * Ders desteleri of a course: the decks with their card count, their week, the
 * share of the enrolled talebe who mastered them, and the drafts talebe do not
 * see yet. The page opens for `deck.manage_course` in the course, read from
 * `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya izniniz yok".
 * The API decides every write.
 */
export async function DecksPage({ courseId }: { courseId: string }) {
  const [t, course, permissions, decks] = await Promise.all([
    getMessages("nazar.Decks"),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the course's decks", (api) =>
      api.courses.getCourseDecksManage({ id: courseId })
    ),
  ]);
  const gate = pageGate([course, decks], permissions, PAGE_CODES.decks);
  if (gate !== "ok") {
    return (
      <>
        <h1 className="mds-h1">{t("title")}</h1>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("loadFailedTitle"),
            text: t("loadFailed"),
          }}
        />
      </>
    );
  }
  if (decks.status !== "ok" || course.status !== "ok") {
    return (
      <>
        <h1 className="mds-h1">{t("title")}</h1>
        <PageProblem
          status="failed"
          failed={{ title: t("loadFailedTitle"), text: t("loadFailed") }}
        />
      </>
    );
  }
  const facts: DeckFact[] = decks.data;
  const weeks: WeekOption[] = course.data.weeks.map((week) => ({
    id: week.id,
    weekNumber: week.weekNumber,
    title: week.title,
  }));
  const totals = deckTotals(facts);

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("summary", {
            decks: totals.decks,
            cards: totals.cards,
            students: totals.students,
          })}
        </p>
      </header>
      <DecksActions
        courseId={courseId}
        decks={facts.map((deck) => ({ id: deck.id, title: deck.title }))}
        weeks={weeks}
      />
      {facts.length === 0 ? (
        <EmptyState>
          <p className="mds-h3">{t("emptyTitle")}</p>
          <p>{t("emptyBody")}</p>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
          {facts.map((deck) => {
            const percent = masteredPercent(deck.masteredRatio);
            return (
              <li key={deck.id}>
                <Link
                  href={deckHref(courseId, deck.id)}
                  className={
                    deck.draft
                      ? "flex flex-col gap-3 rounded-md border border-dashed border-neutral-muted p-4"
                      : "flex flex-col gap-3 rounded-md border border-neutral-muted p-4"
                  }
                >
                  <CoverPattern
                    seed={deck.id}
                    size="sm"
                    label={coverInitials(deck.title)}
                    labelLang={undefined}
                  />
                  <span className="mds-h4" lang="auto">
                    {deck.title}
                  </span>
                  <span className="mds-body-sm text-neutral-muted">
                    {[
                      t("cardCount", { count: deck.cardCount }),
                      deck.cardType === "HADEETH"
                        ? t("typeHadeeth")
                        : t("typeVocabulary"),
                      deck.weekNumber !== null
                        ? t("week", { week: deck.weekNumber })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {deck.draft ? (
                    <span className="mds-body-sm">
                      <strong>{t("draft")}</strong> · {t("draftNote")}
                    </span>
                  ) : (
                    <>
                      <Progress
                        value={percent}
                        label={t("mastered", { percent })}
                        labelHidden
                      />
                      <span className="mds-body-sm">
                        {t("mastered", { percent })}
                      </span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
