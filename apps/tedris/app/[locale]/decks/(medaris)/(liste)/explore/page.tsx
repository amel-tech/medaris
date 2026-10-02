import type { FlashcardType } from "@medaris/services/tedrisat";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExploreDecksPage } from "~/features/flashcards/components/explore-decks-page";
import { getDeckExplore } from "~/features/flashcards/reads";
import { requireAccessToken } from "~/lib/require-access-token";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Decks");
  return { title: `${t("explore")} | Tedris` };
}

const TYPES: Record<string, FlashcardType> = {
  VOCABULARY: "VOCABULARY",
  HADEETH: "HADEETH",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { locale } = await params;
  const { type } = await searchParams;
  // A `?type=` that is not one of the two kinds is no filter at all.
  const cardType = TYPES[Array.isArray(type) ? (type[0] ?? "") : (type ?? "")];
  await requireAccessToken(
    `/${locale}/decks/explore${cardType ? `?type=${cardType}` : ""}`
  );
  return (
    <ExploreDecksPage
      data={await getDeckExplore(cardType)}
      cardType={cardType ?? null}
    />
  );
}
