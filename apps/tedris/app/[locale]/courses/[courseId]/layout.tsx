import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The course page keeps its shadcn body until its own design lands, but it now
 * hosts parts of the unified system: the application window (tedris/07) and the
 * preview banner and card (tedris/14). The system's stylesheet and faces load
 * with the segment, as the medrese and session pages do.
 */
export default function CourseLayout({ children }: { children: ReactNode }) {
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
