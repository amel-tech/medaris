import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { routing } from "~/lib/i18n/routing";
import "@medaris/ui/medaris.css";

export const metadata: Metadata = {
  title: "Medaris",
  description:
    "Medrese ilimlerini müderrisle, haftalık canlı celselerde okuyun. Medaris’te dersler köşklerde açılır ve haftalara bölünür.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// MDRS-151: the unified design system (design-system/medaris-unified). The
// root attributes are MDS-LAY-03. The page is light until the viewer picks dark
// with the header's toggle: `data-theme="light"` stops the CSS following the
// system, and ThemeScript sets "dark" before first paint when it was chosen,
// hence suppressHydrationWarning on <html>.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

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
        {children}
      </body>
    </html>
  );
}
