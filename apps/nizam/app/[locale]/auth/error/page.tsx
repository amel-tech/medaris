import { setRequestLocale } from "next-intl/server";
import { AuthEntry } from "~/features/auth/auth-entry";

/** `pages.error` (MDRS-101): NextAuth's error codes, in the visitor's language. */
export default async function AuthErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  setRequestLocale(locale);

  return <AuthEntry callbackUrl={`/${locale}`} error={error || "Default"} />;
}
