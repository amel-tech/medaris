import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  type CardFact,
  type DeckFact,
  decksHref,
  type WeekOption,
} from "../decks";
import { DeckDetailScreen } from "./deck-detail-screen";

/**
 * A deck's page: its cards (the front face is Arabic, the back the Turkish or
 * the translation), the card dialog, the Excel import, and the deck's own
 * settings. Opens for `deck.manage_course` in the course; the API decides
 * every write.
 */
export async function DeckDetailPage({
  courseId,
  deckId,
}: {
  courseId: string;
  deckId: string;
}) {
  const [t, course, permissions, decks, cards] = await Promise.all([
    getMessages("nazar.Decks"),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
    readOnce("the course's decks", (api) =>
      api.courses.getCourseDecksManage({ id: courseId })
    ),
    readOnce("the deck's cards", (api) =>
      api.cards.getFlashcardByDeckId({ deckId })
    ),
  ]);
  const gate = pageGate([course, decks, cards], permissions, PAGE_CODES.decks);
  if (
    gate !== "ok" ||
    course.status !== "ok" ||
    decks.status !== "ok" ||
    cards.status !== "ok"
  ) {
    return (
      <PageProblem
        status={gate === "forbidden" ? "forbidden" : "failed"}
        failed={{ title: t("loadFailedTitle"), text: t("loadFailed") }}
      />
    );
  }
  const deck: DeckFact | undefined = decks.data.find((d) => d.id === deckId);
  if (!deck) notFound();
  const weeks: WeekOption[] = course.data.weeks.map((week) => ({
    id: week.id,
    weekNumber: week.weekNumber,
    title: week.title,
  }));
  const cardFacts: CardFact[] = cards.data.map((card) => ({
    id: card.id,
    type: card.type as CardFact["type"],
    contentFront: card.contentFront,
    contentBack: card.contentBack,
  }));

  return (
    <>
      <Link href={decksHref(courseId)} className="mds-body-sm">
        ← {t("backToDecks")}
      </Link>
      <header className="flex max-inline-measure items-center gap-4">
        <CoverPattern seed={deck.id} size="xs" label={undefined} />
        <div className="flex flex-col gap-1">
          <h1 className="mds-h1" lang="auto">
            {deck.title}
          </h1>
          <p className="mds-body-sm text-neutral-muted">
            {deck.draft ? t("draftState") : t("published")}
          </p>
        </div>
      </header>
      <DeckDetailScreen
        courseId={courseId}
        deck={deck}
        cards={cardFacts}
        weeks={weeks}
      />
    </>
  );
}
