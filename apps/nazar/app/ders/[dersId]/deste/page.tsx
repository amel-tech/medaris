import type { Metadata } from "next";
import { DecksPage } from "~/features/decks/components/decks-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Decks");
  return { title: t("title") };
}

/** Ders desteleri of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <DecksPage courseId={dersId} />;
}
