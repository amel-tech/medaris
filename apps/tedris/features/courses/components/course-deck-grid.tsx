"use client";

import type {
  FlashcardResponse,
  ReviewRating,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDeckCards, rateFlashcard } from "../../flashcards/actions";
import { attempt } from "../../flashcards/attempt";
import type { CourseDeck } from "../course-decks-model";
import {
  markCard,
  ratingFor,
  retryMissed,
  type SelfTest,
  type SelfTestMark,
  startSelfTest,
  summarize,
} from "../self-test";
import { narrowTable, sigaLayout } from "../siga-table";
import { CourseSigaTable } from "./course-siga-table";
import { DeckFlipCard } from "./deck-flip-card";

type DeckCards = FlashcardResponse[] | "failed";

/**
 * The deck tab's cards: every card of one deck on one screen. A deck whose
 * cards carry their sîga is laid out as sîga tables (`sigaLayout`); any other
 * card sits in a free grid with a small gap, as many columns as the width
 * holds (two on a phone). The talebe picks the deck above when the course has
 * more than one.
 *
 * "Kendini sına" turns every card face down; a turned card asks "Bildim" or
 * "Bilemedim", each mark is rated through `rateFlashcard`, and when the round
 * is marked a summary offers the missed cards again. A round of missed cards
 * shows only the tables and rows that hold them. Focus is moved on purpose
 * whenever the control that had it goes away (a mark, a new round, the end),
 * and the summary is also written into a live region that is always there,
 * since a region that appears already filled is often not read out.
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
  const [turned, setTurned] = useState<Record<string, boolean>>({});
  const [test, setTest] = useState<SelfTest | null>(null);
  /** Marks whose rating did not reach the API, kept to send again. */
  const [unsaved, setUnsaved] = useState<Record<string, ReviewRating>>({});
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  // Bumped whenever the round or the deck changes: a rating that answers
  // after that belongs to a state the talebe has left.
  const generation = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);
  const hintId = useId();
  const deck = decks.find((candidate) => candidate.id === deckId) ?? decks[0];
  const cards = read[deck.id];
  const layout = useMemo(
    () => (Array.isArray(cards) ? sigaLayout(cards) : null),
    [cards]
  );

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

  useEffect(() => {
    if (!focus) return;
    const selector =
      focus.kind === "card"
        ? `[data-card-id="${CSS.escape(focus.id)}"]`
        : "[data-self-test-start]";
    sectionRef.current?.querySelector<HTMLElement>(selector)?.focus();
    setFocus(null);
  }, [focus]);

  const retry = () => {
    setRead(({ [deck.id]: _failed, ...rest }) => rest);
  };

  const reset = (next: SelfTest | null) => {
    generation.current += 1;
    setTurned({});
    setTest(next);
    setUnsaved({});
  };

  const pickDeck = (id: string) => {
    setDeckId(id);
    reset(null);
  };

  const begin = (next: SelfTest) => {
    reset(next);
    if (next.round[0]) setFocus({ kind: "card", id: next.round[0] });
  };

  const stop = () => {
    reset(null);
    setFocus({ kind: "start" });
  };

  const rate = async (cardId: string, rating: ReviewRating) => {
    const asked = generation.current;
    const result = await attempt(() => rateFlashcard(cardId, rating));
    if (asked !== generation.current) return;
    setUnsaved(({ [cardId]: _was, ...rest }) =>
      result.success ? rest : { ...rest, [cardId]: rating }
    );
  };

  const mark = (card: FlashcardResponse, value: SelfTestMark) => {
    setTest((was) => (was ? markCard(was, card.id, value) : was));
    // The buttons that had focus give way to the mark; the card keeps it.
    setFocus({ kind: "card", id: card.id });
    void rate(card.id, ratingFor(value));
  };

  const resend = () => {
    for (const [cardId, rating] of Object.entries(unsaved))
      void rate(cardId, rating);
  };

  const summary = test ? summarize(test) : null;
  const summaryText =
    test && summary?.done
      ? t("selfTestSummary", { known: summary.known, total: summary.total })
      : "";
  const inRound = (card: { id: string }) =>
    !test || test.round.includes(card.id);

  const renderCard = (card: FlashcardResponse, compact: boolean) => {
    if (!inRound(card)) return null;
    const given = test?.marks[card.id];
    return (
      <div className="flex grow flex-col gap-1">
        <DeckFlipCard
          card={card}
          compact={compact}
          turned={Boolean(turned[card.id])}
          onTurn={() =>
            setTurned((was) => ({ ...was, [card.id]: !was[card.id] }))
          }
          describedBy={hintId}
        />
        {test && given ? (
          <Badge
            className="self-start"
            variant={given === "known" ? "success" : "warning"}
          >
            {given === "known" ? t("selfTestKnown") : t("selfTestMissed")}
          </Badge>
        ) : test && turned[card.id] ? (
          <fieldset className="m-0 flex min-inline-0 flex-wrap gap-1 border-0 p-0">
            <legend className="mds-visually-hidden">{t("selfTestAsk")}</legend>
            <Button
              size="mini"
              variant="secondary"
              onClick={() => mark(card, "known")}
            >
              {t("selfTestKnew")}
            </Button>
            <Button
              size="mini"
              variant="outline"
              onClick={() => mark(card, "missed")}
            >
              {t("selfTestDidNotKnow")}
            </Button>
          </fieldset>
        ) : null}
      </div>
    );
  };

  const tables = layout
    ? layout.tables
        .map((table) =>
          test ? narrowTable<FlashcardResponse>(table, inRound) : table
        )
        .filter((table) => table !== null)
    : [];
  const restInPlay = layout ? layout.rest.filter(inRound) : [];

  return (
    <section
      ref={sectionRef}
      className="flex flex-col gap-4"
      aria-label={deck.title}
    >
      {decks.length > 1 ? (
        <ChoiceChips
          legend={t("deckGridPick")}
          options={decks.map((option) => ({
            value: option.id,
            label: <span dir="auto">{option.title}</span>,
          }))}
          value={deck.id}
          // A single-choice group can be emptied; the grid always shows one deck.
          onChange={(value) => value && pickDeck(value)}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mds-body-sm" id={hintId}>
          {test ? t("selfTestHint") : t("deckGridHint")}
        </p>
        {Array.isArray(cards) && cards.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="mds-caption mds-num" aria-live="polite">
              {summary
                ? t("selfTestProgress", {
                    marked: summary.marked,
                    total: summary.total,
                  })
                : t("deckGridCount", { count: cards.length })}
            </span>
            {test ? (
              <Button size="small" variant="ghost" onClick={stop}>
                {t("selfTestStop")}
              </Button>
            ) : (
              <Button
                size="small"
                variant="secondary"
                data-self-test-start=""
                onClick={() => begin(startSelfTest(cards.map((c) => c.id)))}
              >
                {t("selfTestStart")}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      <p className="mds-visually-hidden" aria-live="polite">
        {summaryText}
      </p>
      {Object.keys(unsaved).length > 0 ? (
        <Alert tone="error">
          <p>{t("selfTestSaveFailed")}</p>
          <Button size="small" variant="outline" onClick={resend}>
            {t("selfTestResend")}
          </Button>
        </Alert>
      ) : null}
      {test && summary?.done ? (
        <Alert tone={summary.missed.length === 0 ? "success" : "info"}>
          <p className="mds-num">{summaryText}</p>
          <div className="flex flex-wrap gap-2">
            {summary.missed.length > 0 ? (
              <Button size="small" onClick={() => begin(retryMissed(test))}>
                {t("selfTestRetry")}
              </Button>
            ) : null}
            <Button size="small" variant="outline" onClick={stop}>
              {t("selfTestFinish")}
            </Button>
          </div>
        </Alert>
      ) : null}
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
      ) : cards.length === 0 || !layout ? (
        <EmptyState>{t("deckGridEmpty")}</EmptyState>
      ) : (
        <>
          {tables.map((table) => (
            <CourseSigaTable
              key={`${table.kok}-${table.bab}-${table.kip}`}
              table={table}
              renderCard={(card) => renderCard(card, true)}
              onlyFilledRows={test !== null}
              emptyLabel={test ? t("selfTestNotInRound") : undefined}
            />
          ))}
          {restInPlay.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2 p-0">
              {restInPlay.map((card) => (
                <li key={card.id} className="flex flex-col">
                  {renderCard(card, false)}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
};

type FocusTarget = { kind: "card"; id: string } | { kind: "start" };
