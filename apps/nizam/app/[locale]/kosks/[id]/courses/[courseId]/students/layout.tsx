import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The ban windows opened from the roster (MDRS-177) are unified-kit dialogs.
 * The page around them is still the shadcn one, so the system's stylesheet and
 * faces load with the segment until the roster moves to the new design.
 */
export default function StudentsLayout({ children }: { children: ReactNode }) {
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
