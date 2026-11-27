/** The tokens' values: --arabic-scale, --fs-arabic-text-min in px, --lh-arabic-text. */
export declare const ARABIC_SCALE: number;
export declare const ARABIC_TEXT_MIN_PX: number;
export declare const ARABIC_LINE_HEIGHT: number;

/** The inline style an Arabic or a Latin text gets; assignable to React's CSSProperties. */
export interface ArabicTextStyle {
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  unicodeBidi?: "isolate";
}

export interface ArabicTextProps {
  lang?: "ar";
  dir: "rtl" | "auto";
  /** On an Arabic block: lang="ar" here does not re-point the Latin size tokens. */
  "data-arabic-block"?: "";
  style?: ArabicTextStyle;
}

/** True when the text's first letter is Arabic script. */
export declare function startsArabic(text: string): boolean;
/** True when the text holds Arabic script anywhere. */
export declare function hasArabic(text: string): boolean;
/** `size` (a CSS length, default 1em) x --arabic-scale, never under --fs-arabic-text-min, both x `scale`. */
export declare function arabicFontSize(size?: string, scale?: number): string;
/** The lang, dir and style of a question's, an option's or an answer's text. */
export declare function arabicTextProps(
  text: string,
  size?: string,
  scale?: number
): ArabicTextProps;
/** True when the text holds both Arabic and Latin letters. */
export declare function isMixed(text: string): boolean;
/** A mixed text's direction: rtl only when it is mostly Arabic and ends in Arabic. */
export declare function mixedDir(text: string): "rtl" | "ltr";
/** A mixed text cut into its Arabic runs (with their brackets and quotes) and its other runs, in order. */
export declare function arabicRuns(
  text: string
): Array<{ text: string; arabic: boolean }>;
