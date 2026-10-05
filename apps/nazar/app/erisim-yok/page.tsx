import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NoAccessPage } from "~/features/access/no-access-page";
import { PortalUnavailable } from "~/features/shell/components/portal-layout";
import { getPortal } from "~/features/shell/reads";

export async function generateMetadata(): Promise<Metadata> {
  // The tab names the verdict only when there is one: an unreadable portal is a retry state.
  const portal = await getPortal();
  if (portal.status === "unavailable") {
    const shell = await getTranslations("nazar.Shell");
    return { title: shell("loadFailedTitle") };
  }
  const t = await getTranslations("nazar.NoAccess");
  return { title: t("title") };
}

/**
 * Nazır 02. Only a person whose roles were read and came back without a
 * medrese or a course sees it: someone who has a scope is sent on, and a read
 * that failed is a retry state, never this verdict.
 */
export default async function Page() {
  const portal = await getPortal();
  if (portal.status === "unavailable") return <PortalUnavailable />;
  if (portal.scopes.length > 0) redirect("/");
  return <NoAccessPage person={portal.person} roles={portal.roles} />;
}
