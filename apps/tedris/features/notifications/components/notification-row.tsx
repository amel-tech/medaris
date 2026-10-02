"use client";

import type { NotificationResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { Menu } from "@medaris/ui/mds/menu";
import Link from "next/link";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import {
  type DayGroupKey,
  describeNotification,
  formatRowTime,
  notificationHref,
  notificationIcon,
} from "../notification-view";

/**
 * One notification: icon, title (a link when it leads somewhere), sentence,
 * "source · time", the "Yeni" badge while unread, and the "…" menu. The link
 * and the menu both mark it read; the page owns what that does.
 */
export function NotificationRow({
  notification: n,
  group,
  onRead,
}: {
  notification: NotificationResponse;
  group: DayGroupKey;
  onRead: (n: NotificationResponse) => void;
}) {
  const t = useTranslations("tedris.NotificationsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const href = notificationHref(n);
  const unread = n.readAt === null;
  const text = describeNotification(n, {
    t: (key, values) => t(key as never, values as never),
    locale,
    timeZone,
  });
  const time = formatRowTime(n.createdAt, group, locale, timeZone);

  return (
    <li
      className="flex items-start gap-3 pbs-3 pbe-3 [&:not(:first-child)]:border-bs border-neutral-subtle"
      data-unread={unread || undefined}
    >
      <Icon
        name={notificationIcon(n.type)}
        className="mbs-1 text-neutral-muted"
      />
      <div className="flex min-inline-0 flex-1 flex-col gap-1">
        <p className="mds-body-sm">
          {href ? (
            <Link href={href} onClick={() => unread && onRead(n)}>
              <strong>{text.title}</strong>
            </Link>
          ) : (
            <strong>{text.title}</strong>
          )}
        </p>
        {text.body ? <p className="mds-body-sm">{text.body}</p> : null}
        <p className="mds-caption">
          {text.source ? (
            <>
              <bdi>{text.source}</bdi>
              <span className="mds-sep" aria-hidden="true">
                ·
              </span>
            </>
          ) : null}
          <time dateTime={n.createdAt.toISOString()}>{time}</time>
        </p>
      </div>
      {unread ? <Badge variant="info">{t("new")}</Badge> : null}
      {unread ? (
        <Menu
          label={t("menuLabel", { title: text.title })}
          icon={<Icon name="more" />}
          items={[
            {
              value: "read",
              label: t("menuMarkRead"),
              onSelect: () => onRead(n),
            },
          ]}
        />
      ) : null}
    </li>
  );
}
