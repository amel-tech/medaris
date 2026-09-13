import {
  getDecks,
  getMyDecks,
  parseDeckFilter,
} from "~/features/flashcards/actions";
import { DecksPage } from "~/features/flashcards/components/decks-page";
import { auth } from "~/lib/auth_options";
import { subjectOf } from "~/lib/token-subject";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filter = await parseDeckFilter(filterParam);

  const [decks, myDecks, session] = await Promise.all([
    getDecks(filter),
    getMyDecks(filter),
    auth(),
  ]);

  return (
    <DecksPage
      decks={decks}
      myDecks={myDecks}
      filter={filter}
      currentUserId={subjectOf(session?.accessToken)}
    />
  );
}
