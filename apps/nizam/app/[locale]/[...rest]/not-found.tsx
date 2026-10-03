import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { getLocale } from "next-intl/server";
import { PageNotFound } from "~/components/errors/page-not-found";

/**
 * The boundary of the catch-all next to it: a path no page answers (a menu
 * entry for a screen not built yet, a mistyped address) is "Sayfa bulunamadı",
 * not the "izniniz yok" screen `[locale]/not-found.tsx` draws for a record
 * that is not there (MDRS-211). Being the nearer boundary, it catches the
 * catch-all's `notFound()` before that one does, inside the shell.
 */
export default async function RouteNotFound() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      <PageNotFound locale={await getLocale()} />
    </>
  );
}
