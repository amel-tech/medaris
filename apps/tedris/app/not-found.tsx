import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { SystemState } from "@medaris/ui/mds/system-state";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
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
 * Design tedris/38 outside `[locale]`: a URL with an unsupported locale prefix
 * reaches the root boundary, which has no layout, no providers and no
 * translations, so it speaks the launch language (Turkish) and draws its own
 * document. Plain link, no client code: nothing here needs a handler.
 */
export default function RootNotFound() {
  return (
    <html lang={lang} dir={dir} data-theme="light" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={textFontsHref} precedence="default" />
        <SystemState
          className="font-ui"
          title="Sayfa bulunamadı"
          action={
            <a className="mds-btn mds-btn--regular mds-btn--secondary" href="/">
              Ana sayfaya dön
            </a>
          }
        >
          Aradığın sayfa yok ya da artık burada değil. Adresi kontrol et ya da
          ana sayfadan devam et.
        </SystemState>
      </body>
    </html>
  );
}
