import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeckRequestsView } from "~/features/deck-review/components/deck-requests-view";
import { getPendingDeckRequests } from "~/features/deck-review/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.DeckRequestsPage");
  return { title: t("title") };
}

/**
 * Deste yayın istekleri (design nizam/16): the members' requests to make a
 * deck public. The menu entry has always pointed at
 * `/talepler/deste-yayin-istekleri`, so the page lives there rather than at
 * the `/deste-yayin-istekleri` the spec suggested. tedrisat answers anyone but
 * the başnazım 403, which shows the "Bu bölüm için izniniz yok" screen
 * (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const requests = await getPendingDeckRequests();
  if (requests === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      <DeckRequestsView initial={requests === "not-found" ? null : requests} />
    </div>
  );
}
