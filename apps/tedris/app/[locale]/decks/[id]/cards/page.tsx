import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import { DeckCardsPage } from "~/features/flashcards/components/deck-cards-page";
import { requireAccessToken } from "~/lib/require-access-token";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const token = await requireAccessToken();
  const API = await createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL);

  const cards = await API.cards.getFlashcardByDeckId({ deckId: id });

  return <DeckCardsPage deckId={id} flashcards={cards || []} />;
}
