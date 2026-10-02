import { BellIcon } from "@medaris/icons/ssr";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { bellLabel } from "~/features/notifications/notification-view";
import { getUnreadNotificationCount } from "~/features/notifications/reads";

/**
 * The header bell (MDRS-167): a link to `/notifications` whose accessible name
 * says how many are unread — "Bildirimler, 3 okunmamış", or just
 * "Bildirimler" for none (canvas rule 10). The count is not drawn.
 */
export const UserNotifications = async () => {
  const t = await getTranslations("tedris.UserNotifications");
  const unread = await getUnreadNotificationCount();
  return (
    <Link
      href="/notifications"
      aria-label={bellLabel(unread, (key, values) =>
        t(key as never, values as never)
      )}
    >
      <BellIcon size={24} className="text-primary" />
    </Link>
  );
};
