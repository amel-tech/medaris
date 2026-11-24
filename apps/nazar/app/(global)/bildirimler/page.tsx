import type { Metadata } from "next";
import { NotificationsPage } from "~/features/notifications/components/notifications-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Notifications");
  return { title: t("title") };
}

/** Bildirimler: the caller's own notifications; the bell and the menu badge count the unread. */
export default function Page() {
  return <NotificationsPage />;
}
