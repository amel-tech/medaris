import DeckCards from "~/features/decks/components/cards";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";

export default async function DeckCardsPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id } = await params;

  const API = await tedrisatApi();

  // Any other failure still reaches Next's error page, as before; a refused
  // token goes to sign-in.
  const [deck, cards] = await Promise.all([
    API.decks.getFlashcardDeckById({ id }),
    API.cards.getFlashcardByDeckId({ deckId: id }),
  ]).catch(async (error) => {
    await passOnSignIn(error);
    throw error;
  });

  return <DeckCards deck={deck} cards={cards || []} />;
}
