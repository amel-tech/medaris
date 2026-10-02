import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";
import { PhoneChrome } from "~/components/phone-menu/phone-chrome";

/**
 * Programım is on the unified design system (MDRS-163) while the shell is not,
 * so the system's stylesheet and faces load here with the segment, as they do
 * for Derslerim and the medrese pages.
 */
export default function ScheduleLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      <PhoneChrome />
      {children}
    </>
  );
}
