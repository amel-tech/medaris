"use client";

import "@medaris/ui/medaris.css";
import { commonMessages } from "@medaris/i18n/common";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { readLocaleCookie } from "@medaris/ui/lib/locale-preference";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import { htmlLangDir } from "~/lib/i18n/direction";
import { locales, routing } from "~/lib/i18n/routing";

/**
 * When the shell itself threw: the locale layout, or `NizamShell`, whose
 * reads run before any page. It replaces the whole document, so it draws its
 * own `<html>` with the stylesheet and the faces, and it has no next-intl
 * provider: its words are the shared `common.globalError`, read without one,
 * in the viewer's language (the `medaris-locale` cookie, MDRS-248), which
 * also gives `lang` and `dir` (MDRS-230). It follows the viewer's theme like every page (light unless
 * they chose dark). "Yeniden dene" is Next's `retry`, which asks the server
 * for the shell again.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const locale =
    readLocaleCookie(
      typeof document === "undefined" ? "" : document.cookie,
      locales
    ) ?? routing.defaultLocale;
  const { lang, dir } = htmlLangDir(locale);
  const t = commonMessages[locale].globalError;

  return (
    <html
      lang={lang}
      dir={dir}
      data-app
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <link rel="stylesheet" href={textFontsHref} precedence="default" />
        <SystemState
          className="font-ui"
          title={t.title}
          action={
            <Button variant="secondary" onClick={() => retry()}>
              {t.retry}
            </Button>
          }
        >
          {t.text}
        </SystemState>
      </body>
    </html>
  );
}
