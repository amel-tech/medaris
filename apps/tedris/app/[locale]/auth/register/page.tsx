import { setRequestLocale } from "next-intl/server";
import { AuthEntry } from "~/features/auth/auth-entry";
import { postSignInPage } from "~/lib/auth_pages";

/**
 * Opens Keycloak's registration form (`prompt=create`) — the page landing's
 * "Kayıt ol" links to (MDRS-101). A new account always ends on `/start`.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthEntry intent="register" callbackUrl={`/${locale}${postSignInPage}`} />
  );
}
