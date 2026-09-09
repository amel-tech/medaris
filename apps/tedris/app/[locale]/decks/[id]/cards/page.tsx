import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import { DeckCardsPage } from "~/features/flashcards/components/deck-cards-page";
import { getAccessToken } from "~/lib/auth_options";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const token = await getAccessToken();
  const API = await createServerTedrisatAPIs(token, env.TEDRISAT_API_BASE_URL);

  const cards = await API.cards.getFlashcardByDeckId({ deckId: id });

  return <DeckCardsPage deckId={id} flashcards={cards || []} />;
}
