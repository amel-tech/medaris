"use client";

import type {
  FlashcardDeckResponse,
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { countCards } from "../deck-model";
import { DeckEditDialog } from "./deck-edit-dialog";
import { DeckHeader } from "./deck-header";
import { DeckOwnerOverview } from "./deck-owner-overview";
import { DeckReaderView } from "./deck-reader-view";

export interface DeckDetailPageProps {
  deck: FlashcardDeckResponse;
  cards: FlashcardResponse[];
  isOwner: boolean;
  /** the caller has the deck in their collection */
  inCollection: boolean;
  /** the caller's own decks, for "Kendi desteme kopyala" */
  ownDecks: FlashcardDeckSummaryResponse[];
  /** the route `/decks/[id]/edit`: the edit dialog is open over the page */
  editing?: boolean;
}

/**
 * `/decks/[id]` (design tedris/28 for the author, 31 for anyone else who may
 * read the deck). Which of the two is the viewer's relation to the deck, not a
 * flag a client could set: the API refuses the author's writes to everyone
 * else regardless of what is drawn here.
 */
export function DeckDetailPage({
  deck,
  cards,
  isOwner,
  inCollection,
  ownDecks,
  editing = false,
}: DeckDetailPageProps) {
  const t = useTranslations("tedris.Decks");
  if (!isOwner) {
    return (
      <DeckReaderView
        deck={deck}
        cards={cards}
        inCollection={inCollection}
        ownDecks={ownDecks}
      />
    );
  }
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <DeckHeader
        deck={deck}
        isOwner
        cardCount={countCards(cards).total}
        tab="overview"
        actions={
          <Button
            href={`/decks/study/${deck.id}`}
            size="large"
            iconLeft={<Icon name="play" />}
          >
            {t("study")}
          </Button>
        }
      />
      <DeckOwnerOverview deck={deck} cards={cards} />
      {editing ? <DeckEditDialog deck={deck} open /> : null}
    </main>
  );
}
