import { redirect } from "next/navigation";

/**
 * `/start` used to be where a sign-in that named no page ended, choosing the
 * first-login screen (B1) or `/learning` (MDRS-101). There is no such step any
 * more: a sign-in lands on the page it named, or on Ana sayfa (`/<locale>`,
 * `pages.afterSignIn` in lib/auth.ts). The address stays, as a redirect to Ana
 * sayfa, for a bookmark or a sign-in round trip that was already under way.
 */
export default async function StartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
