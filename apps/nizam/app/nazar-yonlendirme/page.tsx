import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { env } from "~/env";
import { NazarRedirectPage } from "~/features/assignments/components/nazar-redirect-page";
import { landingFor, taskRows } from "~/features/assignments/landing";
import { getMyAssignments } from "~/features/assignments/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.NazarRedirectPage");
  return { title: t("title") };
}

/**
 * Bu işler Nazar'da (design nizam/04). Only for someone whose roles are the
 * medrese's and the course's; a nazım, or a person with no role, is sent to
 * the home page.
 */
export default async function Page() {
  const me = await getMyAssignments();

  if (me && landingFor(me) !== "nazar") redirect(`/`);

  return (
    <NazarRedirectPage
      rows={me ? taskRows(me.assignments) : null}
      failed={me === null}
      nazarUrl={env.NAZAR_URL || null}
      retryHref={`/nazar-yonlendirme`}
    />
  );
}
