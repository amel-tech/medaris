"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, type Theme, themeFromStored } from "../lib/theme";
import type { ButtonSize, ButtonVariant } from "./button";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

export interface ThemeToggleProps {
  /** the name while the page is light: the action the button takes */
  darkLabel?: string;
  /** the name while the page is dark */
  lightLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const current = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const apply = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

/**
 * Light/dark switch: an icon button that writes `data-theme` on `<html>` and
 * the choice under `medaris-theme`. The page is light until the viewer
 * chooses dark (`ThemeScript` sets it before first paint). The first render is
 * always the light one, on the server and in the browser, and the effect then
 * reads `<html>`, so hydration matches; another tab's change arrives through
 * the `storage` event. Without JavaScript the button does nothing.
 */
export function ThemeToggle({
  darkLabel = "Koyu temaya geç",
  lightLabel = "Açık temaya geç",
  variant = "ghost",
  size = "large",
  className,
}: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(current());
    const onStorage = (event: StorageEvent) => {
      // `key` is null when another tab cleared the storage.
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      const next = themeFromStored(event.newValue);
      apply(next);
      setTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const dark = theme === "dark";
  return (
    <IconButton
      icon={<Icon name={dark ? "sun" : "moon"} />}
      label={dark ? lightLabel : darkLabel}
      variant={variant}
      size={size}
      className={className}
      onClick={() => {
        const next: Theme = current() === "dark" ? "light" : "dark";
        apply(next);
        setTheme(next);
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          // storage blocked: the choice holds for this page only
        }
      }}
    />
  );
}
