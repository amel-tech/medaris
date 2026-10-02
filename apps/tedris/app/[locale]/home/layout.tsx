import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { ToastHost } from "~/components/toast-host";

/** Ana sayfa carries the phone menu of design tedris/44 and tedris/45 (MDRS-163), so it loads the system's stylesheet like Keşfet does. */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      <PhoneChrome />
      <ToastHost>{children}</ToastHost>
    </>
  );
}
