"use client";

import { useEffect } from "react";
import {
  LOCALE_NAMES,
  localeHref,
  readStoredLocale,
  storeLocale,
} from "../lib/locale-preference";
import { Icon } from "./icon";
import { Menu } from "./menu";
import { Select } from "./select";

/**
 * Stores `next` and loads the same page in it. A full load rather than a
 * client navigation: `<html lang dir>`, the fonts and every server-rendered
 * string follow the locale segment, and a language change is rare.
 */
export const switchLocale = (next: string, locales: readonly string[]) => {
  storeLocale(next);
  window.location.assign(localeHref(next, locales, window.location));
};

interface LocaleChoiceProps {
  /** the page's locale */
  locale: string;
  /** the app's locales, in the order they are offered */
  locales: readonly string[];
  /** the control's accessible name ("Dil") */
  label: string;
  className?: string;
}

/**
 * The bars' language control (MDRS-275): a globe icon button opening a menu
 * of the languages, each in its own name; the current one is marked. Next to
 * `ThemeToggle` in tedris' top bar and app bar, and in nizam's sidebar tools.
 */
export function LocaleMenu({
  locale,
  locales,
  label,
  size = "large",
  className,
}: LocaleChoiceProps & { size?: "mini" | "small" | "regular" | "large" }) {
  return (
    <Menu
      label={`${label}: ${LOCALE_NAMES[locale] ?? locale}`}
      icon={<Icon name="globe" />}
      size={size}
      className={className}
      items={locales.map((value) => ({
        value,
        label: (
          <span
            lang={value}
            dir="auto"
            aria-current={value === locale || undefined}
          >
            {LOCALE_NAMES[value] ?? value}
          </span>
        ),
        icon:
          value === locale ? (
            <Icon name="check" size="sm" />
          ) : (
            <span className="mds-icon mds-icon--sm" aria-hidden="true" />
          ),
        disabled: value === locale,
        onSelect: () => switchLocale(value, locales),
      }))}
    />
  );
}

/** The account page's language field: a Select inside the caller's `Field`. */
export function LocaleSelect({
  locale,
  locales,
  label,
  className,
}: LocaleChoiceProps) {
  return (
    <Select
      aria-label={label}
      className={className}
      options={locales.map((value) => ({
        value,
        label: LOCALE_NAMES[value] ?? value,
      }))}
      value={locale}
      onChange={(next) => {
        if (next && next !== locale) switchLocale(next, locales);
      }}
    />
  );
}

/**
 * Moves a visit to the language this browser chose last, once, on load. It
 * renders nothing. A page already in that language, or a browser that never
 * chose, stays as it is; so does one whose storage is blocked.
 */
export function LocalePreference({
  locale,
  locales,
}: {
  locale: string;
  locales: readonly string[];
}) {
  useEffect(() => {
    const stored = readStoredLocale(locales);
    if (stored && stored !== locale) {
      window.location.replace(localeHref(stored, locales, window.location));
    }
  }, [locale, locales]);
  return null;
}
