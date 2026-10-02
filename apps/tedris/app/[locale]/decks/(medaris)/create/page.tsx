import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreateDeckPage } from "~/features/flashcards/components/create-deck-page";
import { requireAccessToken } from "~/lib/require-access-token";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Decks");
  return { title: `${t("create")} | Tedris` };
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAccessToken(`/${locale}/decks/create`);
  return <CreateDeckPage />;
}
