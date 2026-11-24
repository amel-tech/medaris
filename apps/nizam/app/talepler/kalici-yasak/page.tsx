import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PermanentBansView } from "~/features/permanent-bans/components/permanent-bans-view";
import { getPendingPermanentBans } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.PermanentBansPage");
  return { title: t("title") };
}

/**
 * Kalıcı yasak talepleri (design nizam/45, MDRS-194): the requests a lower
 * kademe opened for a ban to become a platform ban. The menu entry has always
 * pointed at `/talepler/kalici-yasak`, so the page lives there. tedrisat
 * answers anyone but the başnazım and a Medaris nazımı holding
 * `platform.ban_account` 403, which shows the "Bu bölüm için izniniz yok"
 * screen (nizam/06).
 */
export default async function Page() {
  const requests = await getPendingPermanentBans();
  if (requests === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      <PermanentBansView initial={requests === "not-found" ? null : requests} />
    </div>
  );
}
