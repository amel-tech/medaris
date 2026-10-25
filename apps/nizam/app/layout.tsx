import type { Metadata } from "next";
import "@medaris/ui/globals.css";
import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { ThemeScript } from "@medaris/ui/mds/theme-script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { LegalFooter } from "~/components/legal-footer";
import { ClientProviders } from "~/components/providers/client-providers";
import { NizamShell } from "~/components/shell/nizam-shell";
import { auth } from "~/lib/auth";
import { htmlLangDir } from "~/lib/i18n/direction";
import { localeOf } from "~/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Nizam",
  description: "Medaris'i ve köşkleri yönetenlerin uygulaması",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The language and the direction are the viewer's choice (MDRS-230,
  // MDRS-248): Arabic is served the Arabic catalogue, marked Arabic and
  // mirrored.
  const { lang, dir } = htmlLangDir(localeOf(await getLocale()));

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
        <NextIntlClientProvider>
          <ClientProviders session={await auth()}>
            <NizamShell footer={<LegalFooter />}>{children}</NizamShell>
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
