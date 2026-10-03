import type { Metadata } from "next";
import "@medaris/ui/globals.css";
import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { LegalFooter } from "~/components/legal-footer";
import { ClientProviders } from "~/components/providers/client-providers";
import { NizamShell } from "~/components/shell/nizam-shell";
import { routing } from "~/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Nizam",
  description: "Medaris'i ve köşkleri yönetenlerin uygulaması",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Ensure that the incoming `locale` is valid
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // A launch is Turkish and left to right whatever the route's locale says
  // (canvas rules 3 and 40); the Arabic interface is a later phase.
  return (
    <html lang="tr" dir="ltr" data-app>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={textFontsHref} precedence="default" />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider>
          <ClientProviders>
            <NizamShell footer={<LegalFooter />}>{children}</NizamShell>
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
