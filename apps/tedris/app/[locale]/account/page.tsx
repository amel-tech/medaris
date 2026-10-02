import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RolesSection } from "~/features/account/components/roles-section";
import { RolesSectionSkeleton } from "~/features/account/components/roles-section-skeleton";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.AccountPage");
  return { title: t("pageTitle") };
}

/**
 * Hesap (design tedris/34, 43). This package carries the "Görevlerin ve
 * izinlerin" section of 43; the personal-information, time-zone, calendar and
 * sign-out blocks are screen 34's and arrive with it.
 */
export default async function Page() {
  const t = await getTranslations("tedris.AccountPage");
  return (
    <div className="mx-auto flex max-w-[80rem] flex-col gap-section px-gutter py-8">
      <header className="flex flex-col gap-1">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <p className="mds-reading">{t("pageSubtitle")}</p>
      </header>
      <Suspense fallback={<RolesSectionSkeleton />}>
        <RolesSection />
      </Suspense>
    </div>
  );
}
