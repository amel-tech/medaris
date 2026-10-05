import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeckRequestsView } from "~/features/deck-review/components/deck-requests-view";
import { getPendingDeckRequests } from "~/features/deck-review/reads";
import { getMe } from "~/features/kosks/actions";

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
 * the başnazım and a Medaris nazımı holding `platform.deck_publish` 403, which
 * shows the "Bu bölüm için izniniz yok" screen (nizam/06). Taking a published
 * deck back is the başnazım's alone, so only he is shown the button.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ secili?: string | string[] }>;
}) {
  const { locale } = await params;
  const { secili } = await searchParams;
  setRequestLocale(locale);
  const [requests, me] = await Promise.all([getPendingDeckRequests(), getMe()]);
  if (requests === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      <DeckRequestsView
        initial={requests === "not-found" ? null : requests}
        initialSelectedId={typeof secili === "string" ? secili : null}
        isBasnazim={me?.roles.systemAdmin === true}
      />
    </div>
  );
}
