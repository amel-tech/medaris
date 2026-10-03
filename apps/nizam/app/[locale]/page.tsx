import { Button } from "@medaris/ui/mds/button";
import { Logo } from "@medaris/ui/mds/logo";
import { SystemState } from "@medaris/ui/mds/system-state";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { landingFor } from "~/features/assignments/landing";
import { getMyAssignments } from "~/features/assignments/reads";
import { auth } from "~/lib/auth_options";

// Per caller: who they are decides where they land.
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("common");

  // `/` is open to every visitor; without a session the shell is not drawn
  // and the way in is the sign-in button.
  const session = await auth();
  if (!session?.user) {
    const a = await getTranslations("nizam.Auth");
    return (
      <SystemState
        logo={<Logo app="nizam" size="lg" wordmark />}
        title={t("welcome")}
        action={<Button href={`/${locale}/auth/signin`}>{a("signIn")}</Button>}
      />
    );
  }

  const me = await getMyAssignments();
  if (me) {
    const landing = landingFor(me);
    // Someone whose roles are all the medrese's and the course's has no work in
    // Nizam (design nizam/04); someone with no role at all has none either
    // (design nizam/03). A failed read keeps the page they asked for.
    if (landing === "nazir") redirect(`/${locale}/nazir-yonlendirme`);
    if (landing === "none") redirect(`/${locale}/yetki-yok`);
  }

  return <div>{t("welcome")}</div>;
}
