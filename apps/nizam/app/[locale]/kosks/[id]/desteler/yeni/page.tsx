import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KoskDeckForm } from "~/features/deck-review/components/kosk-deck-form";
import { LoadFailed } from "~/features/deck-review/components/load-failed";
import {
  getKoskForDecks,
  getManagedKoskDecks,
} from "~/features/deck-review/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskDeckForm");
  return { title: t("title") };
}

/**
 * Köşk destesi aç (design nizam/35). With `?oneri=<id>` the form opens filled
 * in from that proposal, and opening the deck accepts it; an id that is not a
 * waiting proposal of this köşk is ignored and the form opens empty. Reading
 * the köşk's decks is the permission check: anyone who is not a nazım of the
 * köşk gets the 403 screen.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ oneri?: string | string[] }>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const [kosk, decks] = await Promise.all([
    getKoskForDecks(id),
    getManagedKoskDecks(id),
  ]);
  if (decks === "forbidden" || kosk === "forbidden") forbidden();
  if (decks === "not-found" || kosk === "not-found") notFound();
  if (!kosk || !decks) {
    const t = await getTranslations("nizam.KoskDeckForm");
    return (
      <div className="mx-auto w-full max-w-[72rem] px-gutter py-8">
        <LoadFailed
          title={t("loadFailedTitle")}
          body={t("loadFailed")}
          retryLabel={t("retry")}
        />
      </div>
    );
  }

  const wanted = typeof query.oneri === "string" ? query.oneri : null;
  const proposal = wanted
    ? (decks.proposals.find((p) => p.id === wanted) ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-[72rem] px-gutter py-8">
      <KoskDeckForm
        koskId={id}
        koskName={kosk.name}
        studentCount={kosk.studentCount}
        proposal={proposal}
      />
    </div>
  );
}
