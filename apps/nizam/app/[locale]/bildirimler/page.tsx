import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getMyAssignments } from "~/features/assignments/reads";
import { NotificationsPage } from "~/features/notifications/components/notifications-page";
import { getNotificationsOverview } from "~/features/notifications/reads";
import { shellVariant } from "~/lib/shell-nav";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.NotificationsPage");
  return { title: t("title") };
}

/**
 * Bildirimler (design nizam/37 and nizam/46, MDRS-179): the caller's own
 * notifications. A person with no management role gets the "Bu bölüm için
 * izniniz yok" screen (nizam/06), as every page of this app does; when the
 * roles cannot be read the page is let through, because the API scopes every
 * read to the caller anyway.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await getMyAssignments();
  const variant = shellVariant(me);
  if (me && variant === "none") forbidden();
  const overview = await getNotificationsOverview();

  return (
    <NotificationsPage
      initial={
        overview && {
          items: overview.first.items,
          nextCursor: overview.first.nextCursor,
          counts: overview.counts,
        }
      }
      scope={variant === "kosk" ? "kosk" : "platform"}
      now={new Date().toISOString()}
    />
  );
}
