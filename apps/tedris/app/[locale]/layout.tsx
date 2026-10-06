import { LocalePreference } from "@medaris/ui/mds/locale-switcher";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@medaris/ui/globals.css";

const inter = Inter({ subsets: ["latin"] });

import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Header } from "~/components/header/header";
import { LegalFooter } from "~/components/legal-footer";
import { ClientProviders } from "~/components/providers/client-providers";
import { TabView } from "~/components/tab-view";
import { auth } from "~/lib/auth_options";
import { htmlLangDir } from "~/lib/i18n/direction";
import { routing } from "~/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Medaris Tedris",
  description: "Medaris Tedris",
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
  const signedIn = Boolean(await auth());
  // `/ar/*` must render right to left (MDRS-217); the language and the
  // direction come from the route, never a hardcoded tr.
  const { lang, dir } = htmlLangDir(locale);

  return (
    // Light until the viewer picks dark with the top bar's toggle: the explicit
    // data-theme stops the CSS following the system, and ThemeScript sets
    // "dark" before first paint when it was chosen.
    <html
      lang={lang}
      dir={dir}
      data-theme="light"
      className="min-h-svh h-full"
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      {/* Browser extensions (e.g. ColorZilla's `cz-shortcut-listen`) inject
          attributes on <body> before hydration; only this node's attributes
          are exempted, children are still checked. */}
      <body
        className={`${inter.className} h-full flex flex-col`}
        suppressHydrationWarning
      >
        {/* a later visit follows this browser's language choice (MDRS-275) */}
        <LocalePreference locale={locale} locales={routing.locales} />
        <NextIntlClientProvider>
          <ClientProviders>
            <Header />
            <TabView signedIn={signedIn}>{children}</TabView>
            <LegalFooter />
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
