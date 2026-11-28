import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { KoskRecordingsView } from "~/features/kosk-lists/components/kosk-recordings-view";
import { pageOf } from "~/features/kosk-lists/present";
import { getKoskRecordings } from "~/features/kosk-lists/reads";
import { getKoskById } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskLists");
  return { title: t("recordings.title") };
}

/**
 * Ders kayıtları for the whole köşk (MDRS-211, the menu of nizam/52): every
 * course's recordings by course and week, a page at a time (`?sayfa=`). For the
 * köşk's nazım and the başnazım; anyone else gets the "Bu bölüm için izniniz
 * yok" screen (nizam/06).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const [kosk, data] = await Promise.all([
    getKoskById(id),
    getKoskRecordings(id, pageOf(query.sayfa)),
  ]);

  // The list is what decides: a köşk read that failed leaves only the name
  // empty, as on Başvurular.
  if (data === "not-found") notFound();
  if (data === "forbidden") forbidden();

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <KoskRecordingsView
        koskId={kosk?.id ?? id}
        koskName={kosk?.name ?? ""}
        data={data}
      />
    </div>
  );
}
