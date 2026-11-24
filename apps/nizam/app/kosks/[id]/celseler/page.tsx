import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { KoskSessionsView } from "~/features/kosk-lists/components/kosk-sessions-view";
import { pageOf, sessionTabOf } from "~/features/kosk-lists/present";
import { getKoskSessions } from "~/features/kosk-lists/reads";
import { getKoskById } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskLists");
  return { title: t("sessions.title") };
}

/**
 * Celseler for the whole köşk (MDRS-211, the menu of nizam/52): every course's
 * live sessions, upcoming or past (`?sekme=gecmis`), a page at a time
 * (`?sayfa=`). For the köşk's nazım and the başnazım; anyone else gets the
 * "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab = sessionTabOf(query.sekme);
  const [kosk, data] = await Promise.all([
    getKoskById(id),
    getKoskSessions(id, tab, pageOf(query.sayfa)),
  ]);

  if (!kosk || data === "not-found") notFound();
  if (data === "forbidden") forbidden();

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <KoskSessionsView
        koskId={kosk.id}
        koskName={kosk.name}
        tab={tab}
        data={data}
      />
    </div>
  );
}
