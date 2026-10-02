import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";

/** On the unified design system, like the medrese pages (MDRS-157, MDRS-159). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      {children}
    </>
  );
}
