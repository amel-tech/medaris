import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountPage } from "~/features/account/components/account-page";
import { PortalUnavailable } from "~/features/shell/components/portal-layout";
import { getPortal } from "~/features/shell/reads";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nazir.Account");
  return { title: t("pageTitle") };
}

/** Hesap ve ayarlar (nazir 20), under the shell of the remembered scope. */
export default async function Page() {
  const portal = await getPortal();
  // The layout has already answered an unreadable portal; this narrows the type.
  if (portal.status !== "ok") return <PortalUnavailable />;
  return <AccountPage portal={portal} />;
}
