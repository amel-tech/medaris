import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CoverTone = "laciverd" | "bordo" | "zumrut" | "murekkep";

// The hash order. Changing it re-colours every course that has no chosen tone.
const tones: CoverTone[] = ["laciverd", "bordo", "zumrut", "murekkep"];
const arabicScript = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * The tone a seed hashes to: FNV-1a 32-bit over its UTF-8 bytes, mod 4. Lone
 * surrogates count as U+FFFD, as TextEncoder encodes them, so every platform
 * gets the same tone.
 */
export function coverTone(seed = ""): CoverTone {
  let h = 2166136261;
  for (const ch of String(seed)) {
    let c = ch.codePointAt(0) ?? 0xfffd;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    const bytes =
      c < 0x80
        ? [c]
        : c < 0x800
          ? [0xc0 | (c >> 6), 0x80 | (c & 63)]
          : c < 0x10000
            ? [0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)]
            : [
                0xf0 | (c >> 18),
                0x80 | ((c >> 12) & 63),
                0x80 | ((c >> 6) & 63),
                0x80 | (c & 63),
              ];
    for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  }
  return tones[(h >>> 0) % 4] as CoverTone;
}

export interface CoverPatternProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CoverTone;
  /** with no tone, a seed (a course id) picks one the same way everywhere */
  seed?: string;
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
  labelLang?: string;
}

/** `.mds-cover`: the bookcloth a course shows when it has no picture. */
export function CoverPattern({
  tone,
  seed,
  size = "md",
  label,
  labelLang,
  className,
  ...rest
}: CoverPatternProps) {
  const t =
    tone && tones.includes(tone)
      ? tone
      : seed != null && seed !== ""
        ? coverTone(seed)
        : "murekkep";
  // An Arabic label needs lang="ar" on itself: that sets it in Naskh (MDS-TYPE-04).
  const lang =
    labelLang ?? (label && arabicScript.test(label) ? "ar" : undefined);
  return (
    <div
      className={cx(
        "mds-cover",
        `mds-cover--${t}`,
        size !== "md" && `mds-cover--${size}`,
        className
      )}
      {...rest}
    >
      {label && size !== "xs" ? (
        <p
          className="mds-eyebrow mds-cover__label"
          lang={lang}
          dir={lang === "ar" ? "rtl" : "auto"}
        >
          {label}
        </p>
      ) : null}
    </div>
  );
}

/** The hue each cover tone is stored as. A course's `coverHue` is a number; the design names four. */
export const TONE_HUE: Record<CoverTone, number> = {
  laciverd: 250,
  bordo: 20,
  zumrut: 155,
  murekkep: 285,
};

/** The tone nearest to a stored hue, so a cover made before the names keeps looking like itself. */
export function toneOfHue(hue: number): CoverTone {
  const distance = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
  };
  let best: CoverTone = "laciverd";
  for (const tone of tones) {
    if (distance(hue, TONE_HUE[tone]) < distance(hue, TONE_HUE[best])) {
      best = tone;
    }
  }
  return best;
}

/**
 * The sciences a course cover may name (nizam/32 "Kapak ibaresi"): the
 * Turkish word is what `coverLabel` stores, the Arabic is what the cover prints.
 */
export const COVER_LABELS = [
  { value: "Sarf", arabic: "الصرف" },
  { value: "Nahiv", arabic: "النحو" },
  { value: "Mantık", arabic: "المنطق" },
  { value: "Akaid", arabic: "العقائد" },
  { value: "Hadis", arabic: "الحديث" },
  { value: "Siyer", arabic: "السيرة" },
  { value: "Fıkıh", arabic: "الفقه" },
  { value: "Tefsir", arabic: "التفسير" },
  { value: "Belâgat", arabic: "البلاغة" },
  { value: "Tecvid", arabic: "التجويد" },
] as const;

/** The Arabic name printed for a stored cover word; undefined for none or an unknown one. */
export function arabicOfCoverLabel(
  label: string | null | undefined
): string | undefined {
  return COVER_LABELS.find((l) => l.value === label)?.arabic;
}

/**
 * What a course's cover prints: the Arabic of its stored word, the word itself
 * when it is already Arabic, and nothing otherwise (the design never prints a
 * Latin category on the bookcloth).
 */
export function coverLabelText(
  label: string | null | undefined
): string | undefined {
  if (!label) return undefined;
  return (
    arabicOfCoverLabel(label) ?? (arabicScript.test(label) ? label : undefined)
  );
}
