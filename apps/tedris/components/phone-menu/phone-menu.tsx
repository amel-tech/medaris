"use client";

import { AppBar } from "@medaris/ui/mds/app-bar";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Logo } from "@medaris/ui/mds/logo";
import { NavItem } from "@medaris/ui/mds/nav-item";
import { ThemeToggle } from "@medaris/ui/mds/theme-toggle";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "~/lib/i18n/navigation";
import { inviteHrefs } from "~/lib/invite-hrefs";

/**
 * The phone menu of a signed-out visitor (design tedris/45, canvas rule 18):
 * the 56 px bar with the menu button, the mark, the page's name and the way
 * in, and the sheet it opens with Keşfet, then Giriş yap and Kayıt ol at the
 * block-end. A visitor has no Ana sayfa: everything on it is personal, so
 * `/home` sends them to Keşfet (MDRS-256). No Derslerim, Programım or Desteler,
 * no scope picker and no "Çıkış yap": there is nobody to sign out. A signed-in
 * visitor gets the other sheet (design tedris/44).
 *
 * Drawn below 768 only; the kit's CSS hides the bar above that and closes an
 * open sheet when the window widens.
 */
export function PhoneMenu({ title }: { title?: string } = {}) {
  const t = useTranslations("tedris");
  const locale = useLocale();
  const pathname = usePathname();
  const hrefs = inviteHrefs(locale, pathname === "/" ? "/home" : pathname);

  return (
    <AppBar
      logo={<Logo size="sm" wordmark />}
      title={title ?? t("PhoneMenu.discover")}
      menuLabel={t("PhoneMenu.menu")}
      navLabel={t("PhoneMenu.navLabel")}
      closeLabel={t("PhoneMenu.close")}
      actions={
        <>
          <ThemeToggle
            darkLabel={t("PhoneMenu.themeDark")}
            lightLabel={t("PhoneMenu.themeLight")}
          />
          <a
            className="mds-btn mds-icon-btn mds-btn--large mds-btn--ghost"
            href={hrefs.signIn}
            aria-label={t("PhoneMenu.signIn")}
          >
            <Icon name="signIn" />
          </a>
        </>
      }
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="ghost" fullWidth href={hrefs.signIn}>
            {t("PhoneMenu.signIn")}
          </Button>
          <Button variant="secondary" fullWidth href={hrefs.register}>
            {t("PhoneMenu.register")}
          </Button>
        </div>
      }
    >
      <NavItem href={`/${locale}/discover`} active>
        {t("PhoneMenu.discover")}
      </NavItem>
    </AppBar>
  );
}
