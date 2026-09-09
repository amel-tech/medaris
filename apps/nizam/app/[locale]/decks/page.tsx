import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { env } from "~/env";
import Decks from "~/features/decks/components/decks";
import { getAccessToken } from "~/lib/auth_options";

export default async function DeckCardsPage() {
  const accessToken = await getAccessToken();

  const { decks } = await createServerTedrisatAPIs(
    accessToken,
    env.TEDRISAT_API_BASE_URL
  );

  const result = await decks.getAllFlashcardDecks();

  return <Decks decks={result} />;
}
