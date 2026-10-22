import type { Metadata } from "next";
import { DeckDetailPage } from "~/features/decks/components/deck-detail-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Decks");
  return { title: t("title") };
}

/** One deck of a course: its cards and settings. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string; desteId: string }>;
}) {
  const { dersId, desteId } = await params;
  return <DeckDetailPage courseId={dersId} deckId={desteId} />;
}
