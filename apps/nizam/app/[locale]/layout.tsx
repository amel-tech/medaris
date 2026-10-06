import type { Metadata } from "next";
import "@medaris/ui/globals.css";
import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { LocalePreference } from "@medaris/ui/mds/locale-switcher";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { LegalFooter } from "~/components/legal-footer";
import { ClientProviders } from "~/components/providers/client-providers";
import { NizamShell } from "~/components/shell/nizam-shell";
import { htmlLangDir } from "~/lib/i18n/direction";
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
  // The language and the direction come from the route (MDRS-230): `/ar/*`
  // is served the Arabic catalogue, so it is marked Arabic and mirrored.
  const { lang, dir } = htmlLangDir(locale);

  return (
    // Light until the viewer picks dark with the shell's toggle: the explicit
    // data-theme stops the CSS following the system, and ThemeScript sets
    // "dark" before first paint when it was chosen.
    <html
      lang={lang}
      dir={dir}
      data-app
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
        <link rel="stylesheet" href={textFontsHref} precedence="default" />
      </head>
      <body suppressHydrationWarning>
        {/* a later visit follows this browser's language choice (MDRS-275) */}
        <LocalePreference locale={locale} locales={routing.locales} />
        <NextIntlClientProvider>
          <ClientProviders>
            <NizamShell footer={<LegalFooter />}>{children}</NizamShell>
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
