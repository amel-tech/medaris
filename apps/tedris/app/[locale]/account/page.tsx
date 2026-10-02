import { SystemState } from "@medaris/ui/mds/system-state";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AccountSettings } from "~/features/account/components/account-settings";
import { RolesSection } from "~/features/account/components/roles-section";
import { RolesSectionSkeleton } from "~/features/account/components/roles-section-skeleton";
import { getMyProfile } from "~/features/account/reads";
import { getAccountTranslations } from "~/lib/i18n/loose";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.AccountPage");
  return { title: t("pageTitle") };
}

/**
 * Hesap (design tedris/34, 43): the personal-information, time-zone, calendar
 * and sign-out cards (MDRS-166) above the "Görevlerin ve izinlerin" section
 * (MDRS-169), which only a person with a role sees.
 */
export default async function Page() {
  const t = await getTranslations("tedris.AccountPage");
  const tp = await getAccountTranslations("AccountProfile");
  const profile = await getMyProfile();
  return (
    <div className="mx-auto flex max-w-[80rem] flex-col gap-section px-gutter py-8">
      <header className="flex flex-col gap-1">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <p className="mds-reading">{t("pageSubtitle")}</p>
      </header>
      {profile ? (
        <AccountSettings
          givenName={profile.givenName ?? ""}
          familyName={profile.familyName ?? ""}
          email={profile.email ?? ""}
          timeZone={profile.timeZone ?? null}
        />
      ) : (
        <SystemState shell headingLevel={2} title={tp("profileFailedTitle")}>
          {tp("profileFailed")}
        </SystemState>
      )}
      <Suspense fallback={<RolesSectionSkeleton />}>
        <RolesSection />
      </Suspense>
    </div>
  );
}
