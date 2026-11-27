import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { ToastHost } from "~/components/toast-host";

/**
 * Çalışma Soruları (MDRS-248, Faz 3) is on the unified design system, as
 * Sınavlarım is: the system's stylesheet and faces load with the segment.
 */
export default function PracticeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      <PhoneChrome />
      <ToastHost>{children}</ToastHost>
    </>
  );
}
