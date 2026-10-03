import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import "@medaris/ui/medaris.css";

/**
 * The unified design system's faces. A segment that is already on the system
 * (the medrese pages, MDRS-157; Keşfet, the köşk page and Derslerim,
 * MDRS-159) renders this in its layout, with the stylesheet it imports, until
 * the shell moves and the whole app loads them once.
 */
export function MedarisAssets() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
    </>
  );
}
