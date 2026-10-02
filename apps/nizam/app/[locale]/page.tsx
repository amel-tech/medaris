import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { landingFor } from "~/features/assignments/landing";
import { getMyAssignments } from "~/features/assignments/reads";

// Per caller: who they are decides where they land.
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const me = await getMyAssignments();
  // Someone whose roles are all the medrese's and the course's has no work in
  // Nizam (design nizam/04). A failed read keeps the page they asked for.
  if (me && landingFor(me) === "nazir") {
    redirect(`/${locale}/nazir-yonlendirme`);
  }

  const t = await getTranslations("common");
  return <div>{t("welcome")}</div>;
}
