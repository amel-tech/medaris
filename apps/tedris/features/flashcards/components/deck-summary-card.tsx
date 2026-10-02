"use client";

import type { FlashcardDeckSummaryResponse } from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Progress } from "@medaris/ui/mds/progress";
import { useLocale, useTimeZone } from "next-intl";
import type { ReactNode } from "react";
import { dayAndMonth, kindOf, percentOf } from "../deck-model";

/** The card's words, written by the page that owns them. */
export interface DeckCardLabels {
  cards: (count: number) => string;
  cardType: (kind: "VOCABULARY" | "HADEETH") => string;
  completed: (done: number, total: number) => string;
  /** Desteler's own list only */
  due?: (count: number) => string;
  /** Desteler's collection only */
  added?: (count: number) => string;
  requested?: (when: string) => string;
  muderris: (name: string) => string;
}

export interface DeckSummaryCardProps {
  deck: FlashcardDeckSummaryResponse;
  /** the page's words: the Desteler list's or Keşfet's */
  labels: DeckCardLabels;
  /** the caller wrote this deck (Desteler's own list): "N kart tekrar bekliyor", "istendi" */
  own?: boolean;
  /** the status or kind badge beside the name; each page chooses which, if any */
  badge?: ReactNode;
  /** the footer's right-hand side; Desteler gives "Çalış", Keşfet the collection controls */
  actions: ReactNode;
  /** show the caller's progress bar (Keşfet leaves it out of decks they have not touched) */
  showProgress?: boolean;
}

/**
 * One deck in a list (design tedris/25, 26): its tile and name, its status or
 * where it comes from, the description, the caller's progress, and a footer
 * with the card count and kind. The name is the card's one link, to the deck's
 * page; the footer's buttons stay separate tab stops.
 */
export function DeckSummaryCard({
  deck,
  labels,
  own = false,
  badge,
  actions,
  showProgress = true,
}: DeckSummaryCardProps) {
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const pct = percentOf(deck.masteredCount, deck.cardCount);

  // Where a deck of somebody else's belongs: the course and its müderris, or the köşk or medrese.
  const context = deck.contextTitle
    ? [
        deck.contextTitle,
        deck.muderrisName ? labels.muderris(deck.muderrisName) : null,
      ]
    : null;

  return (
    <Card
      className="flex grow flex-col min-inline-0"
      href={`/decks/${deck.id}`}
      title={
        <span className="flex items-center gap-3">
          <Avatar entity decorative name={deck.title} />
          <span>{deck.title}</span>
        </span>
      }
      action={badge}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span>
            {labels.cards(deck.cardCount)}
            <span className="mds-sep" aria-hidden="true">
              ·
            </span>
            {labels.cardType(kindOf(deck))}
            {own &&
            labels.requested &&
            deck.publishStatus === "PENDING" &&
            deck.publishRequestedAt ? (
              <>
                <span className="mds-sep" aria-hidden="true">
                  ·
                </span>
                {labels.requested(
                  dayAndMonth(
                    new Date(deck.publishRequestedAt),
                    locale,
                    timeZone
                  )
                )}
              </>
            ) : null}
          </span>
          {actions}
        </div>
      }
    >
      <div className="flex grow flex-col gap-4">
        {context ? (
          <p className="mds-card__body" dir="auto">
            {context[0]}
            {context[1] ? (
              <>
                <span className="mds-sep" aria-hidden="true">
                  ·
                </span>
                {context[1]}
              </>
            ) : null}
          </p>
        ) : null}
        {deck.description ? (
          <p className="mds-card__body" dir="auto">
            {deck.description}
          </p>
        ) : null}
        <span className="grow" />
        {showProgress && deck.cardCount > 0 ? (
          <div className="flex flex-col gap-2">
            <Progress
              value={pct}
              label={labels.completed(deck.masteredCount, deck.cardCount)}
              showValue
              locale={locale}
            />
            {own && labels.due && deck.dueCount > 0 ? (
              <p className="mds-caption">{labels.due(deck.dueCount)}</p>
            ) : null}
            {!own && labels.added && deck.addedSinceCollectedCount > 0 ? (
              <p className="mds-caption">
                {labels.added(deck.addedSinceCollectedCount)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** "Çalış": the deck's study page. A link, named for the deck it belongs to. */
export function StudyButton({
  deckId,
  label,
  accessibleLabel,
}: {
  deckId: string;
  label: string;
  accessibleLabel: string;
}) {
  return (
    <Button
      href={`/decks/study/${deckId}`}
      variant="outline"
      size="small"
      aria-label={accessibleLabel}
    >
      {label}
    </Button>
  );
}
