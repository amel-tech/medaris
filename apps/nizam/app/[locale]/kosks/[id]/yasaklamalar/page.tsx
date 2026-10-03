import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BansView } from "~/features/bans/components/bans-view";
import { getKoskBans } from "~/features/bans/reads";
import { getKoskById, getMe } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.BansPage");
  return { title: t("title") };
}

/**
 * Yasaklamalar (design nizam/42): the bans placed in this köşk, for its nazım
 * and the başnazım. Anyone else, or a köşk that is not there, gets the "Bu
 * bölüm için izniniz yok" screen (nizam/06): the 403 and the 404 look the
 * same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, bans, me] = await Promise.all([
    getKoskById(id),
    getKoskBans(id),
    getMe(),
  ]);

  if (!kosk || bans === "not-found") notFound();
  if (bans === "forbidden") forbidden();

  const t = await getTranslations("nizam.BansPage");
  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <BansView
        koskId={kosk.id}
        koskName={kosk.name}
        initial={bans}
        viewerId={me?.id ?? null}
        viewerRoleLabel={t(
          me?.roles.systemAdmin ? "roles.SYSTEM_ADMIN" : "roles.KOSK_NAZIM"
        ).toLocaleLowerCase(locale)}
      />
    </div>
  );
}
