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
import { routing } from "~/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Tedris - Online Madrasah",
  description: "Online Madrasah Project",
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

  return (
    <html lang="tr" className="min-h-svh h-full">
      {/* Browser extensions (e.g. ColorZilla's `cz-shortcut-listen`) inject
          attributes on <body> before hydration; only this node's attributes
          are exempted, children are still checked. */}
      <body
        className={`${inter.className} h-full flex flex-col`}
        suppressHydrationWarning
      >
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
