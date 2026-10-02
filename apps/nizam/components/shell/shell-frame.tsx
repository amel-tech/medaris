"use client";

import { AppBar } from "@medaris/ui/mds/app-bar";
import { AppShell, Sidebar } from "@medaris/ui/mds/app-shell";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { Logo } from "@medaris/ui/mds/logo";
import { NavItem } from "@medaris/ui/mds/nav-item";
import { NavSection } from "@medaris/ui/mds/nav-section";
import { ScopePicker } from "@medaris/ui/mds/scope-picker";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { locales } from "~/lib/i18n/routing";
import {
  activeEntryId,
  currentKoskId,
  isBarePath,
  type ShellVariant,
  stripLocale,
  studentsPathAlias,
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
  };
}

/** Where the person row goes until the account page exists (nizam/47, a later package): the one place a sign-out is asked. */
const ACCOUNT_PATH = "/auth/signout";

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
  const activeId = activeEntryId(entries, studentsPathAlias(here));
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
                count={koskId ? i.counts?.[koskId] : undefined}
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
          href: `/${locale}/kosks/${k.id}`,
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
            model.variant === "none" ? undefined : (
              <a
                className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
                href={`/${locale}/bildirimler`}
                aria-label={model.labels.bell}
              >
                <Icon name="bell" />
              </a>
            )
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
