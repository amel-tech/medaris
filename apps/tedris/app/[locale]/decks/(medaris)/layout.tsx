import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";
import { ToastHost } from "~/components/toast-host";

/**
 * The deck screens (design tedris/25-29, 31, 33; MDRS-164) are on the unified
 * design system while the shell is not, so the system's stylesheet and faces
 * load with the segment, as they do for Programım and Derslerim. A route group,
 * so the study pages next to it (still on the shadcn kit) do not load them.
 * The toast host is for the confirmations and the refusals the screens raise.
 */
export default function DecksLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      <PhoneChrome />
      <ToastHost>{children}</ToastHost>
    </>
  );
}
