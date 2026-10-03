"use client";

import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import { usePageLocale } from "./locale";

// Lower-case name particles that take no letter: "Ahmed b. Hanbel" is AH.
const particles = new Set(["b.", "bin", "ibn", "bt.", "bint"]);
// Honorifics after the name take no letter either: "İsmail Hakkı Efendi" is İH.
const honorifics = new Set(["Efendi", "Bey", "Hanım", "Hoca"]);

/**
 * Initials: the first letters of the first and the last word that is not a
 * particle or an honorific, upper-cased in the page's locale (tr-TR: i becomes
 * İ). A double given name keeps the surname: "Zeynep Kübra Demirci" is ZD.
 */
export function initials(name = "", locale = "tr-TR"): string {
  const words = name
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !particles.has(w) && !honorifics.has(w));
  const picked =
    words.length > 1 ? [words[0] ?? "", words[words.length - 1] ?? ""] : words;
  const letters = picked.map((w) => Array.from(w)[0]).join("");
  try {
    return letters.toLocaleUpperCase(locale);
  } catch {
    return letters.toLocaleUpperCase("tr-TR");
  }
}

const arabicScript = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const arabicPage = /^(ar|ota-arab|fa|ur)\b/i;

export interface AvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  /** the name is printed beside it: hidden from assistive technology */
  decorative?: boolean;
  /** an institution or object: the small bookcloth tile */
  entity?: boolean;
  locale?: string;
}

/**
 * `.mds-avatar` on Base UI's Avatar: the photo shows once it has loaded and the
 * initials stand in until then and when it fails. Standalone it is an image
 * named by the person (`role="img"`); beside the printed name it is hidden.
 */
export function Avatar({
  name,
  src,
  size = "md",
  decorative = false,
  entity = false,
  locale,
  className,
  ...rest
}: AvatarProps) {
  const { ref, lang } = usePageLocale<HTMLSpanElement>(locale);
  const a11y =
    decorative || !name
      ? { "aria-hidden": true as const }
      : { role: "img", "aria-label": name };
  // A Latin-script name on an Arabic-script page is a Latin island (MDS-TYPE-07).
  const island =
    name && !arabicScript.test(name) && arabicPage.test(lang)
      ? "tr"
      : undefined;
  return (
    <BaseAvatar.Root
      ref={ref}
      className={cx(
        "mds-avatar",
        size !== "md" && `mds-avatar--${size}`,
        entity && "mds-avatar--entity",
        className
      )}
      lang={island}
      {...a11y}
      {...rest}
    >
      {src ? <BaseAvatar.Image src={src} alt="" /> : null}
      <BaseAvatar.Fallback>
        {initials(name, island ?? lang)}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
