import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AllBansView } from "~/features/bans/components/all-bans-view";
import { getAllBans } from "~/features/bans/reads";
import { getMe } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.BansPage");
  return { title: t("title") };
}

/**
 * Yasaklamalar for Medaris administration (design nizam/48): every köşk's
 * bans. The menu entry has always pointed at `/yasaklamalar`, so the page
 * lives there rather than at the `/bans` the spec suggested. tedrisat answers
 * anyone but the başnazım and a Medaris nazımı 403, which shows the "Bu bölüm
 * için izniniz yok" screen (nizam/06).
 */
export default async function Page() {
  const [bans, me] = await Promise.all([getAllBans(), getMe()]);
  if (bans === "forbidden") forbidden();

  const [t, locale] = await Promise.all([
    getTranslations("nizam.BansPage"),
    getLocale(),
  ]);
  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <AllBansView
        initial={bans}
        viewerId={me?.id ?? null}
        viewerRoleLabel={t(
          me?.roles.systemAdmin ? "roles.SYSTEM_ADMIN" : "roles.MEDARIS_NAZIM"
        ).toLocaleLowerCase(locale)}
      />
    </div>
  );
}
