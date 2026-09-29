import {
  getDecks,
  getMyDecks,
  parseDeckFilter,
} from "~/features/flashcards/actions";
import { ExploreDecksPage } from "~/features/flashcards/components/explore-decks-page";
import { requireAccessToken } from "~/lib/require-access-token";
import { subjectOf } from "~/lib/token-subject";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { locale } = await params;
  const { filter: filterParam } = await searchParams;
  const filter = await parseDeckFilter(filterParam);

  const accessToken = await requireAccessToken(
    `/${locale}/decks/explore${filterParam ? `?filter=${encodeURIComponent(filterParam)}` : ""}`
  );
  const [decks, userDecks] = await Promise.all([
    getDecks(filter),
    getMyDecks("all"),
  ]);

  const userDeckIds = new Set((userDecks ?? []).map((deck) => deck.id));

  return (
    <ExploreDecksPage
      initialDecks={decks}
      userDeckIds={Array.from(userDeckIds)}
      filter={filter}
      currentUserId={subjectOf(accessToken)}
    />
  );
}
