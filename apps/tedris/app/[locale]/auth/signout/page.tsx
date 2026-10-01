import { setRequestLocale } from "next-intl/server";
import { SignOutConfirm } from "~/features/auth/sign-out-confirm";

/** `pages.signOut` (MDRS-101). */
export default async function SignOutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <SignOutConfirm />;
}
