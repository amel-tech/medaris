import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The archive screens of MDRS-173 are Nizam pages on the unified design
 * system. The shell around them is still the shadcn one, so the system's
 * stylesheet and faces load with the segment until the shell moves.
 */
export default function ArchiveLayout({ children }: { children: ReactNode }) {
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
