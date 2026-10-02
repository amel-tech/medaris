"use client";

import type { NotificationResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
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
 * One notification: icon, title (a link when it leads somewhere), the "Yeni"
 * badge while unread, the sentence, "source · time", and "Okundu say". The
 * link and the button both mark it read; the page owns what that does.
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
  const t = useTranslations("nizam.NotificationsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const href = notificationHref(n);
  const unread = n.readAt === null;
  const text = describeNotification(n, {
    t: (key, values) => t(key as never, values as never),
  });
  const time = formatRowTime(n.createdAt, group, locale, timeZone);

  const title = (
    <strong className={href ? "underline" : undefined}>{text.title}</strong>
  );

  return (
    <li
      className="flex items-start gap-3 py-3 px-4 max-md:flex-wrap [&:not(:first-child)]:border-bs border-neutral-subtle"
      data-testid="notification-row"
      data-type={n.type}
      data-unread={unread || undefined}
    >
      <Icon
        name={notificationIcon(n.type)}
        className="mbs-1 text-neutral-muted"
      />
      <div className="flex min-inline-0 flex-1 flex-col gap-1">
        <p className="mds-body-sm flex flex-wrap items-center gap-2">
          {href ? (
            <Link
              href={`/${locale}${href}`}
              onClick={() => unread && onRead(n)}
              className="text-[color:var(--text-brand-default)]"
            >
              {title}
            </Link>
          ) : (
            title
          )}
          {unread ? <Badge variant="info">{t("new")}</Badge> : null}
        </p>
        {text.body ? <p className="mds-body-sm">{text.body}</p> : null}
        <p className="mds-caption">
          {text.source ? (
            <>
              <bdi>{text.source}</bdi>
              <span className="mds-sep" aria-hidden="true">
                {" · "}
              </span>
            </>
          ) : null}
          <time dateTime={n.createdAt.toISOString()}>{time}</time>
        </p>
      </div>
      {unread ? (
        <div className="max-md:basis-full max-md:ps-9">
          <Button
            variant="ghost"
            size="small"
            onClick={() => onRead(n)}
            aria-label={t("markReadLabel", { title: text.title })}
          >
            {t("markRead")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
