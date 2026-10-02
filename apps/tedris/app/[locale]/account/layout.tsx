import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The account page is on the unified design system (MDRS-169) while the rest
 * of tedris is still on the shadcn kit, so the system's stylesheet and faces
 * load here, with the segment, until the shell moves — the arrangement the
 * medrese and notification pages already use.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      {children}
    </>
  );
}
