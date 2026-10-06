import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The session page is on the unified design system (MDRS-158), as the medrese
 * pages are (MDRS-157): the system's faces load with the segment until the
 * shell moves; its stylesheet is part of app/tedris.css (MDRS-281).
 */
export default function LessonsLayout({ children }: { children: ReactNode }) {
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
