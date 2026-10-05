"use client";

import { AppBar } from "@medaris/ui/mds/app-bar";
import { AppShell, Sidebar } from "@medaris/ui/mds/app-shell";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { LocaleMenu } from "@medaris/ui/mds/locale-switcher";
import { Logo } from "@medaris/ui/mds/logo";
import { NavItem } from "@medaris/ui/mds/nav-item";
import { NavSection } from "@medaris/ui/mds/nav-section";
import { ScopePicker } from "@medaris/ui/mds/scope-picker";
import { ThemeToggle } from "@medaris/ui/mds/theme-toggle";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { locales } from "~/lib/i18n/routing";
import {
  activeEntryId,
  coursePathAlias,
  currentKoskId,
  isBarePath,
  type ShellVariant,
  stripLocale,
} from "~/lib/shell-nav";

export interface ShellModel {
  variant: ShellVariant;
  groups: {
    id: string;
    label: string;
    items: {
      id: string;
      label: string;
      /** before the locale; `:kosk` stands for the köşk in scope */
      path: string;
      icon: IconName;
      /** badge numbers per köşk id, for the items whose badge follows the scope */
      counts?: Record<string, number>;
      /** a badge that does not follow the scope (the unread notifications) */
      count?: number;
      countLabel: string;
    }[];
  }[];
  /** the köşks of a köşk nazımı, for the scope picker */
  kosks: { id: string; name: string }[];
  user: { name: string; role: string };
  labels: {
    appName: string;
    menu: string;
    nav: string;
    close: string;
    switchKosk: string;
    userLink: string;
    bell: string;
    kosk: string;
    themeDark: string;
    languageMenu: string;
    themeLight: string;
  };
}

/** A köşk's home page, `/kosks/:id/ana-sayfa`. */
const HOME_OF_KOSK = /^\/kosks\/[^/]+\/ana-sayfa\/?$/;

/** Where the person row goes: "Hesap ve ayarlar" (nizam/36, 47), where "Çıkış yap" asks its one confirmation. */
const ACCOUNT_PATH = "/hesap";

/**
 * The client half of the shell: it knows the page the viewer is on, so it
 * marks the nav item (`aria-current`), follows the köşk in the path for a
 * köşk nazımı, and names the AppBar after the page. The sidebar and the phone
 * sheet are drawn from the same items.
 */
export function ShellFrame({
  model,
  footer,
  children,
}: {
  model: ShellModel;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const here = stripLocale(pathname, locales);
  if (isBarePath(here)) {
    return (
      <>
        {children}
        {footer}
      </>
    );
  }
  const koskId =
    model.variant === "kosk"
      ? currentKoskId(
          here,
          model.kosks.map((k) => k.id)
        )
      : null;
  const kosk = model.kosks.find((k) => k.id === koskId) ?? null;

  const resolve = (path: string) =>
    `/${locale}${path.replace(":kosk", koskId ?? "")}`.replace(/\/$/, "") ||
    `/${locale}`;

  // A köşk's menu without a köşk has nowhere to point: leave those items out.
  const groups = model.groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => koskId || !i.path.includes(":kosk")),
    }))
    .filter((g) => g.items.length > 0);

  const entries = groups.flatMap((g) =>
    g.items.map((i) => ({
      id: `${g.id}.${i.id}`,
      path: i.path.replace(":kosk", koskId ?? ""),
    }))
  );
  const activeId = activeEntryId(entries, coursePathAlias(here));
  const activeItem = groups
    .flatMap((g) => g.items.map((i) => ({ key: `${g.id}.${i.id}`, item: i })))
    .find((e) => e.key === activeId)?.item;

  const nav =
    groups.length === 0
      ? null
      : groups.map((g) => (
          <Fragment key={g.id}>
            <NavSection>{g.label}</NavSection>
            {g.items.map((i) => (
              <NavItem
                key={i.id}
                href={resolve(i.path)}
                linkComponent={Link}
                icon={<Icon name={i.icon} size="sm" />}
                active={activeId === `${g.id}.${i.id}`}
                count={i.count ?? (koskId ? i.counts?.[koskId] : undefined)}
                countLabel={i.countLabel}
              >
                {i.label}
              </NavItem>
            ))}
          </Fragment>
        ));

  const scope =
    kosk && model.variant === "kosk" ? (
      <ScopePicker
        current={{ value: kosk.id, label: kosk.name, href: "" }}
        options={model.kosks.map((k) => ({
          value: k.id,
          label: k.name,
          // on a köşk's home page the switch keeps the page (nizam 02)
          href: HOME_OF_KOSK.test(here)
            ? `/${locale}/kosks/${k.id}/ana-sayfa`
            : `/${locale}/kosks/${k.id}`,
        }))}
        caption={model.labels.kosk}
        actionLabel={model.labels.switchKosk}
      />
    ) : undefined;

  const account = (
    <a className="mds-nav-user" href={`/${locale}${ACCOUNT_PATH}`}>
      <Avatar name={model.user.name} decorative />
      <span className="mds-nav-user__text">
        <span className="mds-nav-user__name">
          <bdi>{model.user.name}</bdi>
        </span>
        <span className="mds-nav-user__role">{model.user.role}</span>
      </span>
      <span className="mds-visually-hidden">, {model.labels.userLink}</span>
      <Icon name="chevronRight" size="sm" />
    </a>
  );

  // The language menu sits beside the theme switch, in the sidebar's tools
  // and in the app bar (MDRS-275).
  const themeToggle = (
    <span className="flex items-center">
      <LocaleMenu
        locale={locale}
        locales={locales}
        label={model.labels.languageMenu}
      />
      <ThemeToggle
        darkLabel={model.labels.themeDark}
        lightLabel={model.labels.themeLight}
      />
    </span>
  );

  const brand = (size: "sm" | "md") => (
    <a href={`/${locale}`} className="no-underline">
      <Logo app="nizam" size={size} wordmark />
    </a>
  );

  return (
    <AppShell
      density="compact"
      sidebar={
        <Sidebar
          brand={brand("md")}
          tools={themeToggle}
          scope={scope}
          footer={account}
          navLabel={model.labels.nav}
        >
          {nav}
        </Sidebar>
      }
      appBar={
        <AppBar
          title={activeItem?.label ?? model.labels.appName}
          logo={brand("sm")}
          scope={scope}
          footer={account}
          menuLabel={model.labels.menu}
          navLabel={model.labels.nav}
          closeLabel={model.labels.close}
          actions={
            <>
              {themeToggle}
              {model.variant === "none" ? null : (
                <a
                  className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
                  href={`/${locale}/bildirimler`}
                  aria-label={model.labels.bell}
                >
                  <Icon name="bell" />
                </a>
              )}
            </>
          }
        >
          {nav}
        </AppBar>
      }
    >
      {children}
      {footer}
    </AppShell>
  );
}
