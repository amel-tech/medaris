import { textFontsHref } from "@medaris/tokens/medaris-fonts";

/**
 * The unified design system's faces. A segment that is already on the system
 * (the medrese pages, MDRS-157; Keşfet, the köşk page and Derslerim,
 * MDRS-159) renders this in its layout until the shell moves and the whole app
 * loads them once. The system's stylesheet already is the app's: it is part of
 * app/tedris.css (MDRS-281).
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
