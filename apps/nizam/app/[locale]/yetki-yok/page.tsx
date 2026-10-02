import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { NoRolePage } from "~/features/assignments/components/no-role-page";
import { landingFor } from "~/features/assignments/landing";
import { getMyAssignments } from "~/features/assignments/reads";
import { auth } from "~/lib/auth_options";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.NoRole");
  return { title: t("title") };
}

/**
 * Yönetim yetkiniz yok (design nizam/03): the whole page for an account that
 * has no role at all. `/` sends such an account here; anyone who does hold a
 * role is sent back to `/`, which knows where they belong.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [me, session] = await Promise.all([getMyAssignments(), auth()]);

  if (me && landingFor(me) !== "none") redirect(`/${locale}`);

  return (
    <NoRolePage
      email={session?.user?.email ?? null}
      tedrisUrl={env.TEDRIS_URL || null}
      failed={me === null}
      retryHref={`/${locale}/yetki-yok`}
    />
  );
}
