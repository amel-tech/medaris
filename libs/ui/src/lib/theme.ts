/** localStorage key holding the viewer's choice; only the exact value "dark" means dark. */
export const THEME_STORAGE_KEY = "medaris-theme";

export type Theme = "light" | "dark";

/**
 * The inline script that runs in `<head>`, before first paint: writes
 * `data-theme` on `<html>`, "dark" only when the stored value is exactly
 * "dark", otherwise "light". The system's preference is never read: the CSS
 * follows it only while `data-theme` is absent. Storage may throw or be
 * unavailable; the script then leaves the page light.
 */
export const themeScript = `(function(){var t="light";try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)})==="dark")t="dark"}catch(e){}document.documentElement.dataset.theme=t})()`;

/** The value a storage read or an event carries, as a theme. */
export const themeFromStored = (value: string | null | undefined): Theme =>
  value === "dark" ? "dark" : "light";
