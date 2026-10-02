"use client";

import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";

/**
 * Design tedris/40 when the app shell itself threw (the root layout, or
 * `[locale]/layout.tsx`): no top bar, no providers, so no translations either.
 * It replaces the whole document, hence its own `<html>`; the copy is the
 * launch language, Turkish.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="tr" dir="ltr">
      <body>
        <link rel="stylesheet" href={textFontsHref} precedence="default" />
        <SystemState
          className="font-ui"
          title="Bir şeyler ters gitti"
          action={<Button onClick={() => reset()}>Yeniden dene</Button>}
        >
          Sunucuya ulaşılamadı. İnternet bağlantını denetleyip yeniden dene.
        </SystemState>
      </body>
    </html>
  );
}
