import { AuthEntry } from "~/features/auth/auth-entry";

/** `pages.error` (MDRS-101): NextAuth's error codes, in the visitor's language. */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <AuthEntry callbackUrl="/" error={error || "Default"} />;
}
