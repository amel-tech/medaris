import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getHostingRights } from "~/features/hosting/reads";
import { getKoskById } from "~/features/kosks/actions";
import { getKoskNazims } from "~/features/kosks/admin-reads";
import {
  KoskSettings,
  KoskSettingsUnavailable,
} from "~/features/kosks/components/kosk-settings";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskSettings");
  return { title: t("title") };
}

/**
 * Köşk ayarları, Genel (design nizam/24): the köşk's details, visibility,
 * policies and "Köşkü gizle", for its nazımları and the başnazım. Anyone else,
 * or a köşk that is not there, gets the "Bu bölüm için izniniz yok" screen
 * (nizam/06): the 403 and the 404 look the same on purpose. The nazımları list
 * is read first because its route asks for the same right as the edit does,
 * and it gives the tab its number; the hosting list gives the other.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, nazims, rights] = await Promise.all([
    getKoskById(id),
    getKoskNazims(id),
    getHostingRights(id),
  ]);

  if (nazims === "not-found") notFound();
  if (nazims === "forbidden") forbidden();
  // Both reads failing means the API is down: say so in place, not as a
  // missing right. A köşk that did not read while the list did is gone.
  if (!kosk && nazims !== null) notFound();
  if (!kosk) {
    return (
      <div className="mx-auto w-full max-w-[72rem]">
        <KoskSettingsUnavailable />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <KoskSettings
        kosk={kosk}
        nazimCount={Array.isArray(nazims) ? nazims.length : undefined}
        hostingCount={Array.isArray(rights) ? rights.length : undefined}
      />
    </div>
  );
}
