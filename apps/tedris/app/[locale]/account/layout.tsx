import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";

/**
 * The account page is on the unified design system (MDRS-169) while the rest
 * of tedris is still on the shadcn kit, so the system's stylesheet and faces
 * load here, with the segment, until the shell moves — the arrangement the
 * medrese and notification pages already use.
 */
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("tedris.PhoneMenu");
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      <PhoneChrome section={null} title={t("account")} />
      {children}
    </>
  );
}
