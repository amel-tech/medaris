"use client";

import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { htmlLangDir } from "~/lib/i18n/direction";

/**
 * `lang` describes the text actually drawn (MDRS-217). Until this copy is
 * translated it is Turkish whatever the URL says, so the document is
 * `tr`/`ltr`; deriving it from the path would mark Turkish text as Arabic on
 * `/ar/*`. Translating it, then deriving lang/dir from the path, is a
 * follow-up to MDRS-217.
 */
const { lang, dir } = htmlLangDir("tr");

/**
 * Design tedris/40 when the app shell itself threw (the root layout, or
 * `[locale]/layout.tsx`): no top bar, no providers, so no translations either.
 * It replaces the whole document, hence its own `<html>`; the copy is the
 * launch language, Turkish.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang={lang} dir={dir}>
      <body>
        <link rel="stylesheet" href={textFontsHref} precedence="default" />
        <SystemState
          className="font-ui"
          title="Bir şeyler ters gitti"
          action={
            <Button variant="secondary" onClick={() => reset()}>
              Yeniden dene
            </Button>
          }
        >
          Sunucuya ulaşılamadı. İnternet bağlantını denetleyip yeniden dene.
        </SystemState>
      </body>
    </html>
  );
}
