"use client";

import { AppBar } from "@medaris/ui/mds/app-bar";
import { Icon } from "@medaris/ui/mds/icon";
import { Logo } from "@medaris/ui/mds/logo";
import { NavItem } from "@medaris/ui/mds/nav-item";
import { NavSection } from "@medaris/ui/mds/nav-section";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { activeItemId, type MenuSection, pageTitle } from "../nav";

/**
 * The menu items of one scope, marked by the address the viewer is on. A
 * client component for that one reason: a layout does not re-render on a
 * navigation, so only `usePathname` knows the current page.
 */
export function PortalNav({ sections }: { sections: MenuSection[] }) {
  const active = activeItemId(sections, usePathname());
  return (
    <>
      {sections.map((section) => (
        <Fragment key={section.id}>
          <NavSection>{section.label}</NavSection>
          {section.items.map((item) => (
            <NavItem
              key={item.id}
              href={item.href}
              icon={<Icon name={item.icon} size="sm" />}
              count={item.count}
              countLabel={item.countLabel}
              active={item.id === active}
            >
              {item.label}
            </NavItem>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export interface PortalAppBarProps {
  sections: MenuSection[];
  /** the picker and the user row, the same as the sidebar's */
  scope?: ReactNode;
  footer: ReactNode;
  /** names the bell, with the unread count when there is one; absent when there is no bell (nazir 02) */
  bellLabel?: string;
  /** titles for the addresses outside the menu, and the app's name for the rest */
  outside: Array<{ path: string; title: string }>;
  appName: string;
  labels: { menu: string; nav: string; close: string };
}

/**
 * The bar below 768 and its nav sheet (nazir 21, 22). The title follows the
 * page the way the active item does; the one action is the bell, a link with
 * no visible number (canvas rule 10).
 */
export function PortalAppBar({
  sections,
  scope,
  footer,
  bellLabel,
  outside,
  appName,
  labels,
}: PortalAppBarProps) {
  const pathname = usePathname();
  return (
    <AppBar
      title={pageTitle(sections, pathname, outside, appName)}
      logo={<Logo app="nazir" size="sm" />}
      scope={scope}
      footer={footer}
      menuLabel={labels.menu}
      navLabel={labels.nav}
      closeLabel={labels.close}
      actions={
        bellLabel ? (
          <a
            href="/bildirimler"
            className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
            aria-label={bellLabel}
          >
            <Icon name="bell" />
          </a>
        ) : undefined
      }
    >
      {sections.length > 0 ? <PortalNav sections={sections} /> : null}
    </AppBar>
  );
}
