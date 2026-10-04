import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { privacyNoticeUrl } from "@medaris/utils";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { env } from "~/env";
import { getMyProfile } from "~/features/account/reads";
import { KoskApplicationPage } from "~/features/kosk-application/components/kosk-application-page";
import { getAccountTranslations } from "~/lib/i18n/loose";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getAccountTranslations("KoskApplication");
  return { title: `${t("title")} | Tedris` };
}

/** "Köşk açma başvurusu" (design tedris/37, MDRS-166), linked from Keşfet. */
export default async function Page() {
  const t = await getAccountTranslations("KoskApplication");
  const locale = await getLocale();
  // The account's address pre-fills the form; a failed read leaves it empty to type.
  const profile = await getMyProfile();

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-col gap-4">
        <Breadcrumb
          label={t("trail")}
          items={[
            { label: t("breadcrumbDiscover"), href: `/${locale}/discover` },
            { label: t("title") },
          ]}
        />
        <header className="flex max-w-[48rem] flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="mds-body">{t("subtitle")}</p>
        </header>
      </div>
      <KoskApplicationPage
        email={profile?.email ?? ""}
        privacyNoticeHref={privacyNoticeUrl(env.LANDING_URL)}
      />
    </main>
  );
}
