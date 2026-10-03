import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isSignedIn } from "~/features/courses/public-reads";
import { DeckDetailPage } from "~/features/flashcards/components/deck-detail-page";
import { DeckPublicView } from "~/features/flashcards/components/deck-public-view";
import { DeckUnavailable } from "~/features/flashcards/components/deck-unavailable";
import { loadDeckPage } from "~/features/flashcards/deck-page-data";
import { readDeck } from "~/features/flashcards/reads";
import { inviteHrefs } from "~/lib/invite-hrefs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("tedris.Decks");
  const { id } = await params;
  const read = await readDeck(id).catch(() => null);
  return {
    title:
      read?.status === "ok"
        ? `${read.deck.title} | ${t("title")}`
        : `${t("title")} | Tedris`,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  // A visitor with no token reads a public deck (design tedris/32); a deck they
  // cannot read sends them to sign in and back, which says nothing about
  // whether it exists (MDRS-165).
  if (!(await isSignedIn())) {
    const read = await readDeck(id);
    if (read.status !== "ok") {
      redirect(
        `/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/decks/${id}`)}`
      );
    }
    return (
      <DeckPublicView
        deck={read.deck}
        cards={read.cards}
        signInHref={inviteHrefs(locale, `/decks/${id}`).signIn}
      />
    );
  }
  const data = await loadDeckPage(locale, id, `/decks/${id}`);
  if (data.kind === "unavailable") return <DeckUnavailable />;
  return (
    <DeckDetailPage
      deck={data.deck}
      cards={data.cards}
      isOwner={data.isOwner}
      inCollection={data.summaries.some(
        (d) => d.id === data.deck.id && d.inCollection
      )}
      ownDecks={data.summaries.filter((d) => d.isMine)}
    />
  );
}
