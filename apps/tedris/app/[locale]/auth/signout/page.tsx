import { getTranslations, setRequestLocale } from "next-intl/server";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { SignOutConfirm } from "~/features/auth/sign-out-confirm";

/** `pages.signOut` (MDRS-101). */
export default async function SignOutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tedris.Auth");

  return (
    <>
      <PhoneChrome section={null} title={t("signOutConfirm")} />
      <SignOutConfirm />
    </>
  );
}
