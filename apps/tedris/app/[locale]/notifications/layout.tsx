import "@medaris/ui/medaris.css";
import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { NotificationsProviders } from "~/features/notifications/components/notifications-providers";

/**
 * The notifications page is on the unified design system (MDRS-167) while the
 * rest of tedris is still on the shadcn kit, so the system's stylesheet and
 * faces load here, with the segment, until the shell moves — the same
 * arrangement as the medrese pages.
 */
export default async function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("tedris.PhoneMenu");
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      <PhoneChrome section={null} title={t("notifications")} />
      <NotificationsProviders>{children}</NotificationsProviders>
    </>
  );
}
