import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import type { ReactNode } from "react";

/**
 * The sign-in, registration, error and sign-out pages are on the unified
 * design system (MDRS-156), so the system's stylesheet and faces load with
 * this segment. Each page mounts `PhoneChrome` itself, with its own phone-bar
 * title; the chrome hides the app's old header and tab row.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
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
