import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { ToastHost } from "~/components/toast-host";

/**
 * Sınavlarım (MDRS-299) is on the unified design system while the shell is
 * not, so the system's stylesheet and faces load here with the segment, as
 * they do for Programım.
 */
export default function MyExamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      <PhoneChrome />
      <ToastHost>{children}</ToastHost>
    </>
  );
}
