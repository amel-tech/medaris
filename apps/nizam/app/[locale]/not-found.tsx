import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { getLocale } from "next-intl/server";
import { NoAccess } from "~/components/errors/no-access";

/**
 * A record `notFound()` was called for shows the same "Bu bölüm için izniniz
 * yok" screen as a section the account may not open (nizam 06): which ids
 * exist is not for the page to tell. A path no route answers does not land
 * here: `[...rest]/not-found.tsx` catches it first and says "Sayfa bulunamadı"
 * (MDRS-211). The stylesheet and faces load here, with the screen, until the
 * shell moves to the unified design system.
 */
export default async function NotFound() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      <NoAccess locale={await getLocale()} />
    </>
  );
}
