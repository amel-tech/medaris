"use client";

import {
  AppProviders,
  type AppProvidersProps,
} from "@medaris/ui/mds/app-providers";
import { useLocale } from "next-intl";
import { htmlLangDir } from "~/lib/i18n/direction";
import type { MadrasahLocale } from "~/lib/i18n/routing";

/**
 * The kit's `AppProviders` with the route's direction (MDRS-242): `<html>`
 * says `dir="rtl"` on `/ar/*` (MDRS-217), and Base UI has to be told the same,
 * or its menus anchor from the left and arrow keys run the wrong way.
 */
export function LocaleAppProviders(
  props: Omit<AppProvidersProps, "direction">
) {
  const { dir } = htmlLangDir(useLocale() as MadrasahLocale);
  return <AppProviders {...props} direction={dir} />;
}
