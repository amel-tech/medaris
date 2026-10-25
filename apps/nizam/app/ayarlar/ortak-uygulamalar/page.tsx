import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PartnersView } from "~/features/partners/components/partners-view";
import { getPartners } from "~/features/partners/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.PartnersPage");
  return { title: t("title") };
}

/**
 * Ortak uygulamalar (partner enrollments): the partner applications and the
 * köşks each works with. tedrisat answers anyone but the başnazım and a
 * Medaris nazımı holding `platform.partner_manage` 403, which shows the "Bu
 * bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page() {
  const partners = await getPartners();
  if (partners === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[72rem] px-gutter py-8">
      <PartnersView initial={partners} />
    </div>
  );
}
