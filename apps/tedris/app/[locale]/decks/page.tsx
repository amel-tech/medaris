import {
  getDecks,
  getMyDecks,
  parseDeckFilter,
} from "~/features/flashcards/actions";
import { DecksPage } from "~/features/flashcards/components/decks-page";
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
    `/${locale}/decks${filterParam ? `?filter=${encodeURIComponent(filterParam)}` : ""}`
  );
  const [decks, myDecks] = await Promise.all([
    getDecks(filter),
    getMyDecks(filter),
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
