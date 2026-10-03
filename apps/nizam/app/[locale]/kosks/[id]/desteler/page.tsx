import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KoskDecksView } from "~/features/deck-review/components/kosk-decks-view";
import {
  getKoskForDecks,
  getManagedKoskDecks,
} from "~/features/deck-review/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskDecksPage");
  return { title: t("title") };
}

/**
 * Köşk desteleri (design nizam/30): the köşk's shared decks and the müderris
 * proposals waiting for an answer. A caller who is not one of the köşk's
 * nazıms gets the "Bu bölüm için izniniz yok" screen (nizam/06); a köşk that
 * is not there, the not-found screen; a failed read, a warning with "Yeniden dene".
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, decks] = await Promise.all([
    getKoskForDecks(id),
    getManagedKoskDecks(id),
  ]);
  if (decks === "forbidden" || kosk === "forbidden") forbidden();
  if (decks === "not-found" || kosk === "not-found") notFound();
  // A read that failed (the API down, a 5xx) is neither of those screens: the
  // view draws its warning with "Yeniden dene".
  const loaded = kosk && decks ? { kosk, decks } : null;

  return (
    <div className="mx-auto w-full max-w-[72rem] px-gutter py-8">
      <KoskDecksView
        koskId={id}
        koskName={loaded?.kosk.name ?? ""}
        initial={loaded?.decks ?? null}
      />
    </div>
  );
}
