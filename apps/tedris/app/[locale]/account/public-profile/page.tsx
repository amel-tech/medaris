import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { SystemState } from "@medaris/ui/mds/system-state";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getMyPublicProfile } from "~/features/account/reads";
import { PUBLIC_PROFILE_ENABLED } from "~/features/public-profile/availability";
import { PublicProfilePage } from "~/features/public-profile/components/public-profile-page";
import { getAccountTranslations } from "~/lib/i18n/loose";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getAccountTranslations("PublicProfile");
  return { title: `${t("title")} | Tedris` };
}

/**
 * "Herkese açık profil" (design tedris/35, MDRS-166), under Hesap. Hidden for
 * now (MDRS-141): a 404 before anything is read.
 */
export default async function Page() {
  if (!PUBLIC_PROFILE_ENABLED) notFound();
  const t = await getAccountTranslations("PublicProfile");
  const locale = await getLocale();
  const profile = await getMyPublicProfile();

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-col gap-4">
        <Breadcrumb
          label={t("trail")}
          items={[
            { label: t("breadcrumbAccount"), href: `/${locale}/account` },
            { label: t("title") },
          ]}
        />
        <header className="flex max-w-[48rem] flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="mds-body">{t("subtitle")}</p>
        </header>
      </div>
      {profile ? (
        <PublicProfilePage profile={profile} />
      ) : (
        <SystemState shell headingLevel={2} title={t("loadFailedTitle")}>
          {t("loadFailed")}
        </SystemState>
      )}
    </main>
  );
}
