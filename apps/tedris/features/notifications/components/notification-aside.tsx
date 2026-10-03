"use client";

import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";

/**
 * "Neler bildirilir": the kinds of news the list carries, static. The design's
 * e-mail sentence and "E-posta tercihleri" button are left out on purpose:
 * e-mail needs SMTP, which MDRS-167 does not have (spec tedris/36, class C
 * part).
 */
const ITEMS: Array<{
  icon: IconName;
  title: string;
  text?: string;
}> = [
  { icon: "check", title: "applicationResult", text: "applicationResultText" },
  { icon: "ban", title: "removed", text: "removedText" },
  { icon: "lock", title: "accessRemoved", text: "accessRemovedText" },
  { icon: "clock", title: "rescheduled" },
  { icon: "close", title: "cancelled" },
  { icon: "video", title: "added" },
  { icon: "kosk", title: "kosk", text: "koskText" },
  { icon: "cards", title: "deck", text: "deckText" },
];

export function NotificationAside() {
  const t = useTranslations("tedris.NotificationsPage.aside");
  return (
    <aside className="mds-card flex flex-col gap-4 p-card">
      <h2 className="mds-h3">{t("title")}</h2>
      <ul className="flex flex-col">
        {ITEMS.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3 pbs-3 pbe-3 [&:not(:first-child)]:border-bs border-neutral-subtle"
          >
            <Icon name={item.icon} className="mbs-1 text-neutral-muted" />
            <div className="flex flex-col gap-1">
              <p className="mds-body-sm">{t(item.title as never)}</p>
              {item.text ? (
                <p className="mds-caption">{t(item.text as never)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
