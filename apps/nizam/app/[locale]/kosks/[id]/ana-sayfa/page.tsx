import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KoskHome } from "~/features/dashboard/components/kosk-home";
import { getKoskDashboard } from "~/features/dashboard/reads";
import { LoadFailed } from "~/features/kosks/components/load-failed";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.Dashboard");
  return { title: t("title") };
}

/**
 * A köşk nazımı's home page (design nizam/02): the numbers, the week's celse,
 * the newest applications and the müderrisler of one köşk. The route is the
 * köşk's, so the menu follows it and "Köşk değiştir" keeps the page. A köşk
 * the viewer does not manage, or one that is not there, is the "Bu bölüm için
 * izniniz yok" screen (nizam/06): the 403 and the 404 look the same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const dashboard = await getKoskDashboard(id);
  if (dashboard === "forbidden" || dashboard === "not-found") forbidden();

  if (dashboard === null) {
    const t = await getTranslations("nizam.Dashboard");
    return (
      <div className="mx-auto w-full max-w-[80rem]">
        <LoadFailed
          title={t("loadFailedTitle")}
          message={t("loadFailed")}
          retry={t("retry")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <KoskHome data={dashboard} nowIso={new Date().toISOString()} />
    </div>
  );
}
