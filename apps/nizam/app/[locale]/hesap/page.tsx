import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountPage } from "~/features/account/components/account-page";
import { getAccountData } from "~/features/account/reads";
import { auth } from "~/lib/auth_options";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.AccountPage");
  return { title: t("pageTitle") };
}

/**
 * Hesap ve ayarlar (design nizam/36, 47, MDRS-179). Open to anyone signed in,
 * whatever their roles: a person with none sees an empty task list and still
 * has their e-mail, time zone and "Çıkış yap". A failed read says so in an
 * Alert with a way to retry; nothing here is guessed.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [data, session, t] = await Promise.all([
    getAccountData(),
    auth(),
    getTranslations("nizam.AccountPage"),
  ]);

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-section">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button href={`/${locale}/hesap`} variant="outline" size="small">
            {t("retry")}
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <AccountPage
      data={data}
      sessionName={session?.user?.name ?? session?.user?.email ?? ""}
    />
  );
}
