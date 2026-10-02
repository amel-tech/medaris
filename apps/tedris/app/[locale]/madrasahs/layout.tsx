import type { ReactNode } from "react";
import { MedarisAssets } from "~/components/medaris-assets";

/**
 * The medrese pages are the first tedris screens on the unified design system
 * (MDRS-157). The rest of the app is still on the shadcn kit, so the system's
 * stylesheet and its faces load here, with the segment, until the shell moves.
 */
export default function MadrasahsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MedarisAssets />
      {children}
    </>
  );
}
