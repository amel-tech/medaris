import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DeckDetailPage } from "~/features/flashcards/components/deck-detail-page";
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
        ? `${read.deck.title} | ${t("title")}`
        : `${t("title")} | Tedris`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const data = await loadDeckPage(locale, id, `/decks/${id}`);
  if (data.kind === "unavailable") return <DeckUnavailable />;
  return (
    <DeckDetailPage
      deck={data.deck}
      cards={data.cards}
      isOwner={data.isOwner}
      inCollection={data.summaries.some(
        (d) => d.id === data.deck.id && d.inCollection
      )}
      ownDecks={data.summaries.filter((d) => d.isMine)}
    />
  );
}
