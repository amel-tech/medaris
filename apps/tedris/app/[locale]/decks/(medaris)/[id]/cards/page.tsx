import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ForbiddenState } from "~/features/errors/system-page";
import { DeckCardsPage } from "~/features/flashcards/components/deck-cards-page";
import { DeckUnavailable } from "~/features/flashcards/components/deck-unavailable";
import { loadDeckPage } from "~/features/flashcards/deck-page-data";
import { readDeck } from "~/features/flashcards/reads";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("tedris.Decks");
  const { id } = await params;
  const read = await readDeck(id).catch(() => null);
  return {
    title:
      read?.status === "ok"
        ? `${t("tableCaption", { title: read.deck.title })} | Tedris`
        : "Tedris",
  };
}

/**
 * The card list (design tedris/29) is the author's. Every write control on it
 * would answer 403 for anyone else, so a reader who can see the deck is told
 * so up front (design tedris/39) instead of being shown controls that cannot
 * work; the cards they may read are on the deck's own page (design tedris/31).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const data = await loadDeckPage(locale, id, `/decks/${id}/cards`);
  if (data.kind === "unavailable") return <DeckUnavailable />;
  if (!data.isOwner) {
    return <ForbiddenState deck={{ id, name: data.deck.title }} />;
  }
  return <DeckCardsPage deck={data.deck} cards={data.cards} />;
}
