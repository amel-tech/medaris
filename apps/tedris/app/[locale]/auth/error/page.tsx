import { setRequestLocale } from "next-intl/server";
import { AuthEntry } from "~/features/auth/auth-entry";
import { postSignInPage } from "~/lib/auth_pages";

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

  return (
    <AuthEntry
      intent="signin"
      callbackUrl={`/${locale}${postSignInPage}`}
      error={error || "Default"}
    />
  );
}
