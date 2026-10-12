"use client";

import "@medaris/ui/medaris.css";
import { commonMessages } from "@medaris/i18n/common";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import { usePathname } from "next/navigation";
import { hasLocale } from "next-intl";
import { htmlLangDir } from "~/lib/i18n/direction";
import { routing } from "~/lib/i18n/routing";

/**
 * When the shell itself threw: the locale layout, or `NizamShell`, whose
 * reads run before any page. It replaces the whole document, so it draws its
 * own `<html>` with the stylesheet and the faces, and it has no next-intl
 * provider: its words are the shared `common.globalError`, read without one,
 * in the language of the address, which also gives `lang` and `dir`
 * (MDRS-230). It follows the viewer's theme like every page (light unless
 * they chose dark). "Yeniden dene" is Next's `retry`, which asks the server
 * for the shell again.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const segment = usePathname()?.split("/")[1];
  const locale = hasLocale(routing.locales, segment)
    ? segment
    : routing.defaultLocale;
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
