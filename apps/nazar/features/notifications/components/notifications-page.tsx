import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { env } from "~/env";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { NotificationsList } from "./notifications-list";

/**
 * Bildirimler: the caller's own notifications, every type, as the bell and
 * the menu badge count them. The first page and the two tab counts are read
 * here; the API scopes both to the caller.
 */
export async function NotificationsPage() {
  const [t, me, read] = await Promise.all([
    getMessages("nazar.Notifications"),
    getViewer(),
    readOnce("the caller's notifications", async (api) => {
      const [first, counts] = await Promise.all([
        api.notifications.listNotifications({ status: "all" }),
        api.notifications.getNotificationCounts({}),
      ]);
      return { first, counts };
    }),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);

  return (
    <>
      <h1 className="mds-h1">{t("title")}</h1>
      {read.status !== "ok" ? (
        <PageProblem
          status={read.status}
          failed={{ title: t("loadFailedTitle"), text: t("loadFailed") }}
        />
      ) : (
        <NotificationsList
          initial={{
            items: read.data.first.items,
            nextCursor: read.data.first.nextCursor,
            unread: read.data.counts.unread,
            total: read.data.counts.total,
          }}
          tedrisUrl={env.TEDRIS_URL || null}
          timeZone={timeZone}
        />
      )}
    </>
  );
}

/** The page while the notifications are read: the shell stays, the rows are bars. */
export async function NotificationsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="4rem" />
      ))}
    </output>
  );
}
