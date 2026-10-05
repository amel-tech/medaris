import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ClientProviders } from "~/components/providers/client-providers";
import "@medaris/ui/medaris.css";

export const metadata: Metadata = {
  title: { default: "Medaris Nazır", template: "%s · Medaris Nazır" },
  description: "Medrese ve ders görevlilerinin portalı.",
};

// MDRS-183: the unified design system (design-system/medaris-unified). The
// root attributes are MDS-LAY-03: Nazır is Turkish only at launch, so `lang`
// and `dir` are fixed. Management pages put `data-density="compact"` on their
// own `<main>`; the shell does it, not this layout. The page is light until the
// viewer picks dark with the shell's toggle (`data-theme="light"`, ThemeScript,
// suppressHydrationWarning).
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="tr"
      dir="ltr"
      data-app="nazir"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        {/* The faces by <link> with preconnect, as the system's readme asks
            for in production, rather than the @import in tokens/fonts.css. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={textFontsHref} />
      </head>
      {/* The canvas's .ekran root, in the utilities the canvas note gives it. */}
      <body className="relative min-block-screen bg-neutral-page font-ui text-body leading-body text-neutral-default">
        <NextIntlClientProvider>
          <ClientProviders>{children}</ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
