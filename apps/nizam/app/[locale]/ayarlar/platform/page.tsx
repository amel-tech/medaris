import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PoliciesView } from "~/features/platform-admin/components/policies-view";
import { getPlatformSettings } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.PlatformSettingsPage");
  return { title: t("title") };
}

/**
 * Platform ayarları (design nizam/19). The menu entry has always pointed at
 * `/ayarlar/platform`, so the page lives there rather than at the `/ayarlar`
 * the spec suggested. tedrisat answers anyone but the başnazım and a Medaris
 * nazımı holding "Platform politikalarını değiştir" 403, which shows the "Bu
 * bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const settings = await getPlatformSettings();
  if (settings === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[72rem] px-gutter py-8">
      <PoliciesView initial={settings === "not-found" ? null : settings} />
    </div>
  );
}
