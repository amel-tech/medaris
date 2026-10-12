"use client";

import "@medaris/ui/medaris.css";
import { commonMessages } from "@medaris/i18n/common";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { ThemeScript } from "@medaris/ui/mds/theme-script";

/**
 * When the root layout itself threw: `error.tsx` does not cover the layout of
 * its own segment, so without this Next drew its bare English page. It
 * replaces the whole document, so it draws its own `<html>` (Turkish, left to
 * right, as Nazar is at launch) with the stylesheet and the faces, and it has
 * no next-intl provider: its words are the shared `common.globalError`, read
 * without one. "Yeniden dene" is Next's `retry`, which asks the server for
 * the layout again.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = commonMessages.tr.globalError;

  return (
    <html
      lang="tr"
      dir="ltr"
      data-app="nazar"
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
