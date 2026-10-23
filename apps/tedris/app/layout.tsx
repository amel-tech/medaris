import { ThemeScript } from "@medaris/ui/mds/theme-script";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./tedris.css";

const inter = Inter({ subsets: ["latin"] });

import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Header } from "~/components/header/header";
import { LegalFooter } from "~/components/legal-footer";
import { ClientProviders } from "~/components/providers/client-providers";
import { TabView } from "~/components/tab-view";
import { auth } from "~/lib/auth";
import { htmlLangDir } from "~/lib/i18n/direction";
import { localeOf } from "~/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Medaris Tedris",
  description: "Medaris Tedris",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = localeOf(await getLocale());
  // One read of the session cookie per request: the header, the phone chrome
  // and the pages below ask `auth()` again and get this same answer (D1).
  const session = await auth();
  // Arabic must render right to left (MDRS-217); the language and the
  // direction come from the viewer's choice (MDRS-248), never a hardcoded tr.
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
        <NextIntlClientProvider>
          <ClientProviders session={session}>
            <Header />
            <TabView signedIn={session !== null}>{children}</TabView>
            <LegalFooter />
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
