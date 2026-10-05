"use client";

import { AppBar } from "@medaris/ui/mds/app-bar";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Icon } from "@medaris/ui/mds/icon";
import { LocaleMenu } from "@medaris/ui/mds/locale-switcher";
import { Logo } from "@medaris/ui/mds/logo";
import { NavItem } from "@medaris/ui/mds/nav-item";
import { ThemeToggle } from "@medaris/ui/mds/theme-toggle";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "~/lib/i18n/navigation";
import { locales } from "~/lib/i18n/routing";

export type Section =
  | "home"
  | "discover"
  | "courses"
  | "schedule"
  | "decks"
  | null;

const SECTION_PREFIXES: [Section, RegExp][] = [
  ["home", /^\/(home)?$/],
  ["discover", /^\/(discover|kosks|madrasahs)(\/|$)/],
  ["courses", /^\/(my-courses|learning\/my-courses)(\/|$)/],
  ["schedule", /^\/schedule(\/|$)/],
  ["decks", /^\/decks(\/|$)/],
];

/** Which of the five nav items the page belongs to; a köşk or medrese page is Keşfet's. */
export const sectionOf = (pathname: string): Section =>
  SECTION_PREFIXES.find(([, re]) => re.test(pathname))?.[0] ?? null;

/**
 * The phone menu of a signed-in talebe (design tedris/44, canvas rule 18): the
 * 56 px bar, and the sheet it opens with Ana sayfa, Keşfet, Derslerim,
 * Programım and Desteler, and the person at the block-end as the way to
 * Hesap. "Çıkış yap" is not here: it lives in the account page (design
 * tedris/16 is its confirmation). The Dialog, its focus on the close button and
 * its closing when the window passes 768 px are the kit's `AppBar`.
 */
export function MemberPhoneMenu({
  name,
  section: sectionProp,
  title: titleProp,
}: {
  name: string;
  /** the place, when the address alone cannot tell it (a course page) */
  section?: Section;
  /** the bar's name, when it is the page's own (a course or a celse) */
  title?: string;
}) {
  const t = useTranslations("tedris.PhoneMenu");
  const locale = useLocale();
  const pathname = usePathname();
  const section = sectionProp !== undefined ? sectionProp : sectionOf(pathname);
  const title =
    titleProp ??
    (section === "discover"
      ? t("discover")
      : section === "courses"
        ? t("courses")
        : section === "schedule"
          ? t("schedule")
          : section === "decks"
            ? t("decks")
            : t("home"));

  const item = (key: Exclude<Section, null>, href: string, label: string) => (
    <NavItem href={`/${locale}${href}`} active={section === key}>
      {label}
    </NavItem>
  );

  return (
    <AppBar
      logo={<Logo size="sm" wordmark />}
      title={title}
      menuLabel={t("menu")}
      navLabel={t("navLabel")}
      closeLabel={t("close")}
      actions={
        <>
          <LocaleMenu
            locale={locale}
            locales={locales}
            label={t("languageMenu")}
          />
          <ThemeToggle
            darkLabel={t("themeDark")}
            lightLabel={t("themeLight")}
          />
          <a
            className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
            href={`/${locale}/notifications`}
            aria-label={t("notifications")}
          >
            <Icon name="bell" />
          </a>
        </>
      }
      footer={
        <a
          className="mds-nav-user"
          href={`/${locale}/account`}
          aria-label={t("accountLabel", { name })}
        >
          <Avatar name={name} decorative />
          <span className="mds-nav-user__text">
            <span className="mds-nav-user__name" dir="auto">
              {name}
            </span>
            <span className="mds-nav-user__role">{t("roleTalebe")}</span>
          </span>
          <Icon name="chevronRight" size="sm" />
        </a>
      }
    >
      {item("home", "/home", t("home"))}
      {item("discover", "/discover", t("discover"))}
      {item("courses", "/my-courses", t("courses"))}
      {item("schedule", "/schedule", t("schedule"))}
      {item("decks", "/decks", t("decks"))}
    </AppBar>
  );
}
