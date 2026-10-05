import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import type { ReactNode } from "react";
import "@medaris/ui/medaris.css";

/**
 * The privacy notice sits outside `[locale]` (MDRS-102): its address must not
 * change with the visitor's language, and it is Turkish for everyone. The
 * middleware's matcher leaves the path alone, so next-intl never rewrites it.
 * The shell is the one `[locale]/layout.tsx` gives every landing page
 * (MDRS-151, MDS-LAY-03).
 */
export default function PrivacyNoticeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="tr"
      dir="ltr"
      data-app="landing"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={textFontsHref} />
      </head>
      <body className="relative min-block-screen bg-neutral-page font-ui text-body leading-body text-neutral-default">
        {children}
      </body>
    </html>
  );
}
