import {
  createServerTedrisatAPIs,
  type FlashcardDeckResponse,
  ResponseError,
} from "@medaris/services/tedrisat";
import { notFound, redirect } from "next/navigation";
import { env } from "~/env";
import { ForbiddenState } from "~/features/errors/system-page";
import { DeckUnavailable } from "~/features/flashcards/components/deck-unavailable";
import { requireAccessToken } from "~/lib/require-access-token";
import { subjectOf } from "~/lib/token-subject";

/**
 * Editing a deck (design tedris/39). Only the author edits: the author is sent
 * on to the deck page, where its details are edited; anyone else who can read
 * the deck gets the "you cannot view this page" state, naming the deck and the
 * rule. A deck the caller may not read at all is `DeckUnavailable`, the same
 * copy as a missing one, so a private deck's existence is not leaked
 * (MDRS-43, AC-4).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const token = await requireAccessToken(`/${locale}/decks/${id}/edit`);

  let deck: FlashcardDeckResponse;
  try {
    const { decks } = await createServerTedrisatAPIs(
      token,
      env.TEDRISAT_API_BASE_URL
    );
    deck = await decks.getFlashcardDeckById({ id });
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 403) return <DeckUnavailable />;
      if (error.response.status === 404) notFound();
    }
    throw error;
  }

  const userId = subjectOf(token);
  if (userId && deck.authorId === userId) redirect(`/${locale}/decks/${id}`);

  return <ForbiddenState deck={{ id, name: deck.title }} />;
}
