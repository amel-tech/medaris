"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { LocaleMenu } from "@medaris/ui/mds/locale-switcher";
import { Logo } from "@medaris/ui/mds/logo";
import { NavItem } from "@medaris/ui/mds/nav-item";
import { ThemeToggle } from "@medaris/ui/mds/theme-toggle";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "~/lib/i18n/navigation";
import { locales } from "~/lib/i18n/routing";
import { inviteHrefs } from "~/lib/invite-hrefs";
import { type Section, sectionOf } from "./member-phone-menu";

/**
 * The top bar at 768 and up, as every Tedris screen of the canvas draws it:
 * the Medaris wordmark, the five places (Ana sayfa, Keşfet, Derslerim,
 * Programım, Desteler), then the bell and the person's initials as the way to
 * Hesap. A visitor gets Keşfet, then Giriş yap and Kayıt ol: Ana sayfa is
 * personal, so `/home` sends a visitor to Keşfet and the bar does not offer it
 * (MDRS-256). Below 768 the phone AppBar takes its place.
 *
 * `section` overrides the place worked out from the address, for the pages
 * whose place depends on who is looking (a course page is Derslerim's for its
 * talebe and Keşfet's for everyone else).
 */
export function DesktopBar({
  signedIn,
  name = "",
  section: sectionProp,
}: {
  signedIn: boolean;
  name?: string;
  section?: Section;
}) {
  const t = useTranslations("tedris.PhoneMenu");
  const locale = useLocale();
  const pathname = usePathname();
  const section =
    sectionProp !== undefined
      ? sectionProp
      : signedIn
        ? sectionOf(pathname)
        : "discover";
  const hrefs = inviteHrefs(locale, pathname === "/" ? "/home" : pathname);

  const item = (key: Exclude<Section, null>, href: string, label: string) => (
    <NavItem href={`/${locale}${href}`} active={section === key}>
      {label}
    </NavItem>
  );

  return (
    <header
      data-system-chrome
      className="sticky inset-bs-0 z-[2] flex block-topbar items-center gap-6 px-gutter bg-neutral-surface border-be border-neutral-subtle font-ui max-md:hidden"
    >
      <a
        href={`/${locale}/${signedIn ? "home" : "discover"}`}
        aria-label={t("homeLabel")}
        aria-current={section === "home" ? "page" : undefined}
      >
        <Logo wordmark />
      </a>
      <nav aria-label={t("navLabel")} className="flex items-center gap-1">
        {signedIn ? item("home", "/home", t("home")) : null}
        {item("discover", "/discover", t("discover"))}
        {signedIn ? (
          <>
            {item("courses", "/my-courses", t("courses"))}
            {item("schedule", "/schedule", t("schedule"))}
            {item("decks", "/decks", t("decks"))}
          </>
        ) : null}
      </nav>
      <div className="ms-auto flex items-center gap-2">
        <LocaleMenu
          locale={locale}
          locales={locales}
          label={t("languageMenu")}
        />
        <ThemeToggle darkLabel={t("themeDark")} lightLabel={t("themeLight")} />
        {signedIn ? (
          <>
            <a
              className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
              href={`/${locale}/notifications`}
              aria-label={t("notifications")}
            >
              <Icon name="bell" />
            </a>
            {/* The bell's ghost icon button, not `.mds-nav-user`: that is the
                sidebar's footer row, with a top border, padding and a hover
                fill as tall as the bar. */}
            <a
              className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
              href={`/${locale}/account`}
            >
              <Avatar name={name} size="sm" decorative />
              <span className="mds-visually-hidden">{t("account")}</span>
            </a>
          </>
        ) : (
          <>
            <Button variant="ghost" href={hrefs.signIn}>
              {t("signIn")}
            </Button>
            <Button variant="secondary" href={hrefs.register}>
              {t("register")}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
