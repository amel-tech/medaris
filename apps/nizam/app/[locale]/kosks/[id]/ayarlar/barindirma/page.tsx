import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HostingView } from "~/features/hosting/components/hosting-view";
import { getHostingRights, getMadrasahOptions } from "~/features/hosting/reads";
import { getKoskById } from "~/features/kosks/actions";
import { getKoskNazims } from "~/features/kosks/admin-reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.HostingPage");
  return { title: t("title") };
}

/**
 * Barındırma hakları (design nizam/26, with nizam/27's dialog): the medreses
 * that may open courses in this köşk, for its nazımları, the başnazım and a
 * Medaris nazımı holding `platform.hosting_grant`. The other settings tabs are
 * left out when the nazımları list answers 403 (MDRS-137): that route asks for
 * the köşk's own settings right, which a Medaris nazımı holding only
 * `platform.hosting_grant` lacks. A failed read keeps them. Anyone else, or a
 * köşk that is not there, gets the "Bu bölüm için izniniz yok" screen
 * (nizam/06): the 403 and the 404 look the same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, rights, madrasahs, nazims] = await Promise.all([
    getKoskById(id),
    getHostingRights(id),
    getMadrasahOptions(),
    getKoskNazims(id),
  ]);

  if (rights === "not-found") notFound();
  if (rights === "forbidden") forbidden();
  // A köşk that did not read while the rights did is gone; with both failing
  // the API is down, and the page says so in place (spec §3) rather than
  // passing it off as a missing permission.
  if (!kosk && rights !== null) notFound();

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <HostingView
        koskId={id}
        koskName={kosk?.name ?? ""}
        rights={rights}
        madrasahs={madrasahs}
        settingsTabs={nazims !== "forbidden"}
      />
    </div>
  );
}
