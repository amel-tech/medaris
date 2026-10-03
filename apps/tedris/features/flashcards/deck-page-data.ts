import type {
  FlashcardDeckResponse,
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { notFound } from "next/navigation";
import { requireAccessToken } from "~/lib/require-access-token";
import { subjectOf } from "~/lib/token-subject";
import { getDeckSummaries, readDeck } from "./reads";

export type DeckPageData =
  | { kind: "unavailable" }
  | {
      kind: "ok";
      deck: FlashcardDeckResponse;
      cards: FlashcardResponse[];
      isOwner: boolean;
      /** the decks list, read only for a reader (who needs "in my collection" and a copy target) */
      summaries: FlashcardDeckSummaryResponse[];
    };

/**
 * What every deck page needs, decided once (MDRS-164): sign-in first, then the
 * deck with its cards and the caller's progress. A deck that is not there (or
 * a private one of somebody else's, which the API answers the same way) is the
 * not-found page; a 403 is "unavailable". Whether the viewer wrote the deck is
 * read off the token for display only: the API re-derives the caller and
 * refuses a stranger's write whatever the page drew.
 */
export async function loadDeckPage(
  locale: string,
  id: string,
  path: string
): Promise<DeckPageData> {
  const token = await requireAccessToken(`/${locale}${path}`);
  const read = await readDeck(id);
  if (read.status === "missing") notFound();
  if (read.status === "forbidden") return { kind: "unavailable" };
  const viewer = subjectOf(token);
  const isOwner = viewer !== undefined && read.deck.authorId === viewer;
  return {
    kind: "ok",
    deck: read.deck,
    cards: read.cards,
    isOwner,
    summaries: isOwner ? [] : ((await getDeckSummaries()) ?? []),
  };
}
