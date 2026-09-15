import {
  getDecks,
  getMyDecks,
  parseDeckFilter,
} from "~/features/flashcards/actions";
import { DecksPage } from "~/features/flashcards/components/decks-page";
import { getAccessToken } from "~/lib/auth_options";
import { subjectOf } from "~/lib/token-subject";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: filterParam } = await searchParams;
  const filter = await parseDeckFilter(filterParam);

  const [decks, myDecks, accessToken] = await Promise.all([
    getDecks(filter),
    getMyDecks(filter),
    getAccessToken(),
  ]);

  return (
    <DecksPage
      decks={decks}
      myDecks={myDecks}
      filter={filter}
      currentUserId={subjectOf(accessToken)}
    />
  );
}
