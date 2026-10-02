import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DecksPage } from "~/features/flashcards/components/decks-page";
import { getDeckSummaries } from "~/features/flashcards/reads";
import { requireAccessToken } from "~/lib/require-access-token";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Decks");
  return { title: `${t("title")} | Tedris` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAccessToken(`/${locale}/decks`);
  return <DecksPage decks={await getDeckSummaries()} />;
}
