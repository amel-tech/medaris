import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InactiveView } from "~/features/inactive-scopes/components/inactive-view";
import { getInactiveScopes } from "~/features/inactive-scopes/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.InactivePage");
  return { title: t("title") };
}

/**
 * Pasif kapsamlar (design nizam/14): the köşks, medreses and courses with no
 * manager, for the Medaris başnazımı and a Medaris nazımı who may manage them.
 * tedrisat answers anyone else 403, which shows the "Bu bölüm için izniniz
 * yok" screen (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const scopes = await getInactiveScopes();
  if (scopes === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <InactiveView scopes={scopes} />
    </div>
  );
}
