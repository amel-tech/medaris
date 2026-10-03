import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isSignedIn } from "~/features/courses/public-reads";
import { DeckUnavailable } from "~/features/flashcards/components/deck-unavailable";
import { StudySession } from "~/features/flashcards/components/study-session";
import { readDeck, readStudyRound } from "~/features/flashcards/reads";
import { anonymousRound } from "~/features/flashcards/study-model";
import { inviteHrefs } from "~/lib/invite-hrefs";

// Different for every caller and read at request time: the queue is the
// caller's own progress.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedrisLearn.Study");
  return { title: `${t("title")} | Tedris` };
}

/**
 * Çalışma (design tedris/30) for a talebe, and the same screen for a visitor
 * with no token on a public deck (design tedris/32): the visitor's round is the
 * deck's first cards and nothing is written. A deck a visitor cannot read is
 * not a 404 for them: they are sent to sign in and come back, as for every
 * page behind the middleware, which tells nothing about whether it exists.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const here = `/decks/study/${id}`;
  const decks = await getTranslations("tedris.Decks");
  const discover = await getTranslations("tedris.PhoneMenu");

  if (!(await isSignedIn())) {
    const read = await readDeck(id);
    if (read.status !== "ok") {
      redirect(
        `/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}${here}`)}`
      );
    }
    const cards = anonymousRound(read.cards);
    return (
      <StudySession
        deck={{ id: read.deck.id, title: read.deck.title }}
        cards={cards}
        dueCount={0}
        newCount={cards.length}
        signedIn={false}
        root={{ label: discover("discover"), href: "/discover" }}
        signInHref={inviteHrefs(locale, here).signIn}
      />
    );
  }

  const read = await readStudyRound(id);
  if (read.status === "missing") notFound();
  if (read.status === "forbidden") return <DeckUnavailable />;
  return (
    <StudySession
      deck={{ id: read.deck.id, title: read.deck.title }}
      cards={read.round.cards}
      dueCount={read.round.dueCount}
      newCount={read.round.newCount}
      signedIn
      root={{ label: decks("title"), href: "/decks" }}
    />
  );
}
