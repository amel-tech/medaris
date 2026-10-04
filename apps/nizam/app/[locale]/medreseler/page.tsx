import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getMyAssignments,
  getMyPermissionCodes,
} from "~/features/assignments/reads";
import { MadrasahsView } from "~/features/madrasahs/components/madrasahs-view";
import {
  madrasahAbilities,
  searchFromParam,
  statusFromParam,
} from "~/features/madrasahs/present";
import { getMadrasahDirectory } from "~/features/madrasahs/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.MadrasahsPage");
  return { title: t("title") };
}

/**
 * Medreseler (design nizam/07): every medrese on the platform, for the Medaris
 * başnazımı and a Medaris nazımı holding `platform.madrasah_create`,
 * `platform.madrasah_edit` or `platform.head_muderris_manage` — the codes the
 * menu shows it for. tedrisat answers anyone else 403, which shows the "Bu
 * bölüm için izniniz yok" screen (nizam/06). A nazım sees only the buttons
 * their permissions open (MDRS-108). The filter is in the URL: `?durum=`
 * (etkin, pasif, gizli) and `?q=`.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ durum?: string | string[]; q?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const status = statusFromParam(query.durum);
  const q = searchFromParam(query.q);
  const [directory, me, held] = await Promise.all([
    getMadrasahDirectory({ status, q }),
    getMyAssignments(),
    getMyPermissionCodes(),
  ]);
  if (directory === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <MadrasahsView
        directory={directory}
        status={status}
        q={q}
        can={madrasahAbilities(me, held)}
      />
    </div>
  );
}
