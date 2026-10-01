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
