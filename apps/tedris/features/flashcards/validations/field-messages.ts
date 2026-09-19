"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

/**
 * The length messages a form schema needs. Zod's own defaults are English
 * strings baked into the library ("Too small: expected string to have >=10
 * characters"), so every schema that enforces a length takes these instead.
 */
export interface FieldMessages {
  min: (count: number) => string;
  max: (count: number) => string;
}

export function useFieldMessages(): FieldMessages {
  const t = useTranslations("tedris");

  return useMemo(
    () => ({
      min: (count: number) => t("Validation.minChars", { count }),
      max: (count: number) => t("Validation.maxChars", { count }),
    }),
    [t]
  );
}
