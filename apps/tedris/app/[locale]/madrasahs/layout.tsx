import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The medrese pages are the first tedris screens on the unified design system
 * (MDRS-157). The rest of the app is still on the shadcn kit, so the system's
 * stylesheet and its faces load here, with the segment, until the shell moves.
 */
export default function MadrasahsLayout({ children }: { children: ReactNode }) {
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
