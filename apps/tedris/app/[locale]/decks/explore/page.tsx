import {
  getDecks,
  getMyDecks,
  parseDeckFilter,
} from "~/features/flashcards/actions";
import { ExploreDecksPage } from "~/features/flashcards/components/explore-decks-page";
import { auth } from "~/lib/auth_options";
import { subjectOf } from "~/lib/token-subject";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filter = await parseDeckFilter(filterParam);

  const [decks, userDecks, session] = await Promise.all([
    getDecks(filter),
    getMyDecks("all"),
    auth(),
  ]);

  const userDeckIds = new Set((userDecks ?? []).map((deck) => deck.id));

  return (
    <ExploreDecksPage
      initialDecks={decks}
      userDeckIds={Array.from(userDeckIds)}
      filter={filter}
      currentUserId={subjectOf(session?.accessToken)}
    />
  );
}
