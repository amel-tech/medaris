import { SystemState } from "@medaris/ui/mds/system-state";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountSettings } from "~/features/account/components/account-settings";
import { RolesSection } from "~/features/account/components/roles-section";
import { getAccountRoles, getMyProfile } from "~/features/account/reads";
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
  // Both reads at once; the loading skeleton stands in until they are done.
  const [profile, roles] = await Promise.all([
    getMyProfile(),
    getAccountRoles(),
  ]);
  // Canvas 43 names the roles in the subtitle; canvas 34, with none, does not.
  const hasRoles = (roles?.assignments.length ?? 0) > 0;
  return (
    <div className="mx-auto flex max-w-[80rem] flex-col gap-section px-gutter py-8">
      <header className="flex flex-col gap-1">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <p className="mds-body">
          {t(hasRoles ? "pageSubtitleRoles" : "pageSubtitle")}
        </p>
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
      <RolesSection />
    </div>
  );
}
