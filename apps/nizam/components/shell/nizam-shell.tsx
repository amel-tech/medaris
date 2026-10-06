import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  getMyAssignments,
  getMyPermissionCodes,
} from "~/features/assignments/reads";
import {
  getManagedKosks,
  getPendingEnrollments,
} from "~/features/kosks/actions";
import { bellLabel } from "~/features/notifications/notification-view";
import { getUnreadNotificationCount } from "~/features/notifications/reads";
import { auth } from "~/lib/auth_options";
import {
  filterByPermissions,
  navGroups,
  roleLabelKey,
  shellVariant,
} from "~/lib/shell-nav";
import { ShellFrame, type ShellModel } from "./shell-frame";

type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** The most köşks one nazım's scope picker lists; tedrisat caps a page at this many. */
const MAX_KOSKS = 50;

/**
 * The Nizam shell around every page (nizam 03, 31, 50-52, 57): the sidebar and,
 * below 768, the AppBar with its menu sheet, drawn for whoever is signed in and
 * filtered by their roles. It reads the roles and the köşks they manage here,
 * on the server, and hands the client frame plain data with every sentence
 * already in the viewer's language. A visitor without a session gets the page
 * alone: the sign-in screens are not part of the app.
 */
export async function NizamShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    return (
      <>
        {children}
        {footer}
      </>
    );
  }

  const [t, me] = await Promise.all([
    getTranslations("nizam.Shell") as unknown as Promise<Messages>,
    getMyAssignments(),
  ]);
  const variant = shellVariant(me);
  // The bell's name and the menu badge say how many are unread; a person with
  // no menu has no bell to name.
  const unread = variant === "none" ? 0 : await getUnreadNotificationCount();

  const kosks =
    variant === "kosk"
      ? (await getManagedKosks(1, MAX_KOSKS)).items.map((k) => ({
          id: k.id,
          name: k.name,
        }))
      : [];
  // A badge per köşk: the menu follows the köşk in the path, and the counts
  // are read for all of them so switching needs no second trip.
  const applications: Record<string, number> = {};
  await Promise.all(
    kosks.map(async (k) => {
      applications[k.id] = (await getPendingEnrollments(k.id)).length;
    })
  );

  // A Medaris nazımı sees only the sections their permissions open (nizam 05).
  const held = variant === "medaris" ? await getMyPermissionCodes() : null;
  const groups = filterByPermissions(navGroups(variant), held).map((group) => ({
    id: group.id,
    label: t(`groups.${group.id}`),
    items: group.items.map((item) => ({
      id: item.id,
      label: t(`items.${item.label}`),
      path: item.path,
      icon: item.icon,
      counts: item.countKey === "applications" ? applications : undefined,
      count: item.countKey === "notifications" ? unread : undefined,
      countLabel: item.countLabel ? t(`countLabels.${item.countLabel}`) : "",
    })),
  }));

  const model: ShellModel = {
    variant,
    groups,
    kosks,
    user: {
      name: session.user.name ?? session.user.email ?? "",
      role: t(`roles.${roleLabelKey(variant, me)}`),
    },
    labels: {
      appName: t("appName"),
      menu: t("menu"),
      nav: t("nav"),
      close: t("close"),
      switchKosk: t("switchKosk"),
      userLink: t("userLink"),
      bell: bellLabel(unread, {
        plain: t("bell"),
        unread: (count) => t("bellUnread", { count }),
      }),
      kosk: t("roles.kosk"),
      themeDark: t("themeDark"),
      languageMenu: t("languageMenu"),
      themeLight: t("themeLight"),
    },
  };

  return (
    <ShellFrame model={model} footer={footer}>
      {children}
    </ShellFrame>
  );
}
