"use client";

import type { FlashcardResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import { getDeckCards } from "../../flashcards/actions";
import { attempt } from "../../flashcards/attempt";
import { isArabic } from "../../flashcards/deck-model";
import type { CourseDeck } from "../course-decks-model";

type DeckCards = FlashcardResponse[] | "failed";

const LATIN = /[A-Za-zÀ-ɏ]/;

/**
 * The deck tab's card grid: every card of one deck on one screen, a small gap
 * between them, as many columns as the width holds (two on a phone). A card is
 * a button that turns over to its back and back again; the talebe picks the
 * deck above the grid when the course has more than one.
 *
 * A deck's cards are read when it is first shown and kept for the rest of the
 * visit, so going back to a deck does not ask again.
 */
export const CourseDeckGrid = ({
  decks,
  initialDeckId,
}: {
  decks: CourseDeck[];
  /** The deck the grid opens on: the featured one (`gridDeckId`). */
  initialDeckId: string;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const [deckId, setDeckId] = useState(initialDeckId);
  const [read, setRead] = useState<Record<string, DeckCards>>({});
  const hintId = useId();
  const deck = decks.find((candidate) => candidate.id === deckId) ?? decks[0];
  const cards = read[deck.id];

  const load = useCallback(async (id: string) => {
    const result = await attempt(() => getDeckCards(id));
    setRead((was) => ({
      ...was,
      [id]: result.success ? result.data : "failed",
    }));
  }, []);

  useEffect(() => {
    if (read[deck.id] === undefined) void load(deck.id);
  }, [deck.id, read, load]);

  const retry = () => {
    setRead(({ [deck.id]: _failed, ...rest }) => rest);
  };

  return (
    <section className="flex flex-col gap-4" aria-label={deck.title}>
      {decks.length > 1 ? (
        <ChoiceChips
          legend={t("deckGridPick")}
          options={decks.map((option) => ({
            value: option.id,
            label: <span dir="auto">{option.title}</span>,
          }))}
          value={deck.id}
          // A single-choice group can be emptied; the grid always shows one deck.
          onChange={(value) => value && setDeckId(value)}
        />
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="mds-body-sm" id={hintId}>
          {t("deckGridHint")}
        </p>
        {Array.isArray(cards) ? (
          <span className="mds-caption mds-num">
            {t("deckGridCount", { count: cards.length })}
          </span>
        ) : null}
      </div>
      {cards === undefined ? (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2"
          aria-busy="true"
        >
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} height="7.5rem" />
          ))}
        </div>
      ) : cards === "failed" ? (
        <Alert tone="error">
          <p>{t("deckGridFailed")}</p>
          <Button size="small" variant="outline" onClick={retry}>
            {t("deckGridRetry")}
          </Button>
        </Alert>
      ) : cards.length === 0 ? (
        <EmptyState>{t("deckGridEmpty")}</EmptyState>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 p-0">
          {cards.map((card) => (
            <li key={card.id}>
              <FlipCard card={card} describedBy={hintId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * One card that turns over on a press: the front first, the back after. The
 * face turned away is hidden from assistive technology, so the button's name
 * is always the side in view; `aria-pressed` says which one that is.
 *
 * Both faces sit in the same grid cell rather than on top of each other by
 * absolute position, so the card is as tall as its longer face and a long
 * answer is never cut off or scrolled inside a button.
 */
const FlipCard = ({
  card,
  describedBy,
}: {
  card: FlashcardResponse;
  describedBy: string;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const [turned, setTurned] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={turned}
      aria-describedby={describedBy}
      onClick={() => setTurned((was) => !was)}
      className="group block size-full cursor-pointer rounded-[var(--radius-surface)] border-0 bg-transparent p-0 perspective-[60rem]"
    >
      <span
        className={[
          "grid size-full min-block-[7.5rem] transform-3d [transition:transform_calc(var(--duration-base)*2)_var(--ease-standard)]",
          turned ? "rotate-y-180" : "",
        ].join(" ")}
      >
        <Face
          side={t("deckGridFront")}
          text={card.contentFront}
          hidden={turned}
        />
        <Face
          side={t("deckGridBack")}
          text={card.contentBack}
          hidden={!turned}
          back
        />
      </span>
    </button>
  );
};

const Face = ({
  side,
  text,
  hidden,
  back = false,
}: {
  /** "Ön yüz" / "Arka yüz": read before the text, and shown in the corner. */
  side: string;
  text: string;
  hidden: boolean;
  back?: boolean;
}) => {
  // A face all in Arabic script sets as an Arabic block; a Latin text that
  // quotes an Arabic word keeps its own direction (`dir="auto"`), so the
  // Latin words do not run right to left.
  const arabic = isArabic(text) && !LATIN.test(text);
  return (
    <span
      aria-hidden={hidden}
      className={[
        "flex flex-col gap-1 rounded-[var(--radius-surface)] border p-3 text-start backface-hidden [grid-area:1/1]",
        back
          ? "rotate-y-180 border-brand-default bg-brand-subtle"
          : "border-neutral-subtle bg-neutral-surface group-hover:bg-neutral-hover",
      ].join(" ")}
    >
      <span className="mds-caption">{side}</span>
      <span className="flex grow items-center justify-center">
        {arabic ? (
          <span
            className="font-arabic text-center text-[1.25rem] leading-[1.9]"
            dir="rtl"
            lang="ar"
          >
            {text}
          </span>
        ) : (
          <span
            className="mds-body-sm text-center text-neutral-default"
            dir="auto"
          >
            {text}
          </span>
        )}
      </span>
    </span>
  );
};
