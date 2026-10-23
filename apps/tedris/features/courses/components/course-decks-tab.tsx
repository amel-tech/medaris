"use client";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Progress } from "@medaris/ui/mds/progress";
import { useLocale, useTranslations } from "next-intl";
import { percentOf } from "../../flashcards/deck-model";
import {
  type CourseDeck,
  deckRowStatus,
  otherDecks,
  pickFeaturedDeck,
} from "../course-decks-model";

/**
 * The "Ders destesi" tab of the course page, for an enrolled talebe: the deck to
 * study first as a featured card, and the course's other decks under it, each
 * row one link to its deck page.
 */
export const CourseDecksTab = ({
  decks,
  course,
  now,
}: {
  decks: CourseDeck[];
  course: Pick<CourseDetailResponse, "weeks">;
  /** The instant the tab is drawn at: the celse on air is read from it. */
  now: number;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const featured = pickFeaturedDeck(decks, course, now);
  const others = otherDecks(decks, featured);

  return (
    <div className="flex flex-col gap-section">
      {featured ? (
        <FeaturedDeck
          deck={featured.deck}
          thisWeek={featured.reason === "thisWeek"}
          studyHref={`/${locale}/decks/study/${featured.deck.id}`}
        />
      ) : null}
      {others.length > 0 ? (
        <section className="flex flex-col gap-3">
          {featured ? <p className="mds-eyebrow">{t("deckOthers")}</p> : null}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {others.map((deck) => (
              <li key={deck.id}>
                <DeckRow deck={deck} href={`/${locale}/decks/${deck.id}`} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

const FeaturedDeck = ({
  deck,
  thisWeek,
  studyHref,
}: {
  deck: CourseDeck;
  thisWeek: boolean;
  studyHref: string;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const parts = [
    deck.dueCount > 0 ? t("deckFeaturedDue", { count: deck.dueCount }) : null,
    deck.newCount > 0 ? t("deckFeaturedNew", { count: deck.newCount }) : null,
  ].filter((part) => part !== null);

  return (
    <section
      aria-label={deck.title}
      className="flex flex-col gap-4 rounded-[var(--radius-surface)] border-[length:var(--border-width-thick)] border-[color:var(--border-brand-default)] bg-[var(--background-neutral-surface)] p-5"
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar entity decorative name={deck.title} size="lg" />
        <div className="flex min-inline-0 grow basis-48 flex-col gap-1">
          <p className="mds-eyebrow">
            {thisWeek ? t("deckFeaturedThisWeek") : t("deckFeaturedNext")}
            {deck.weekNumber !== null ? (
              <>
                <span className="mds-sep" aria-hidden="true">
                  ·
                </span>
                {t("deckWeek", { number: deck.weekNumber })}
              </>
            ) : null}
          </p>
          <h3 className="mds-h3" dir="auto">
            {deck.title}
          </h3>
          <p className="mds-body-sm mds-num">
            {parts.length > 0 ? parts.join(" · ") : t("deckFeaturedNone")}
          </p>
        </div>
        <Button
          href={studyHref}
          aria-label={t("deckStudyLabel", { title: deck.title })}
        >
          {t("deckStudy")}
        </Button>
      </div>
      <Progress
        value={percentOf(deck.masteredCount, deck.cardCount)}
        label={t("deckProgress", {
          total: deck.cardCount,
          mastered: Math.min(deck.masteredCount, deck.cardCount),
        })}
        showValue
        locale={locale}
      />
    </section>
  );
};

const DeckRow = ({ deck, href }: { deck: CourseDeck; href: string }) => {
  const t = useTranslations("tedris.CoursePage");
  const status = deckRowStatus(deck);

  return (
    <Card
      density="compact"
      href={href}
      title={
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar entity decorative name={deck.title} size="sm" />
          <span className="min-inline-0" dir="auto">
            {deck.title}
          </span>
        </span>
      }
      action={
        status === "done" ? (
          <Badge variant="success">{t("deckRowDone")}</Badge>
        ) : status === "due" ? (
          <Badge variant="warning">
            {t("deckRowDue", { count: deck.dueCount })}
          </Badge>
        ) : (
          <Badge variant="secondary">{t("deckRowStart")}</Badge>
        )
      }
    >
      {deck.weekNumber !== null ? (
        <p className="mds-caption">
          {t("deckWeek", { number: deck.weekNumber })}
        </p>
      ) : null}
    </Card>
  );
};
