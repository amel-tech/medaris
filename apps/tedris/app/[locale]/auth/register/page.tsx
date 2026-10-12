import { getTranslations, setRequestLocale } from "next-intl/server";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { AuthEntry } from "~/features/auth/auth-entry";
import { homePath } from "~/lib/auth_pages";

/**
 * Opens Keycloak's registration form (`prompt=create`) — the page landing's
 * "Kayıt ol" links to (MDRS-101). A new account ends on Ana sayfa
 * (`/<locale>`), with no first-login step in between.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tedris.Auth");

  return (
    <>
      <PhoneChrome section={null} title={t("register")} />
      <AuthEntry intent="register" callbackUrl={homePath(locale)} />
    </>
  );
}
