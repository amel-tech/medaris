import Decks from "~/features/decks/components/decks";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

export default async function DeckCardsPage() {
  const { decks } = await tedrisatApi();

  // Any other failure still reaches Next's error page, as before; a refused
  // token goes to sign-in.
  const result = await decks.getAllFlashcardDecks().catch(async (error) => {
    await passOnSignIn(error);
    throw error;
  });

  return <Decks decks={result} />;
}
