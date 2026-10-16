// Types of `hoca-unvan.js`; see that file for why it is JavaScript.

/** An unvan code a hoca may carry in a course. No unvan ("Hoca") is null, not a code. */
export type HocaUnvan =
  | "PROF_DR"
  | "DOC_DR"
  | "DR"
  | "MUDERRIS"
  | "MOLLA"
  | "MUFTU"
  | "SEYH"
  | "HAFIZ";

export declare const HOCA_UNVANS: readonly [
  "PROF_DR",
  "DOC_DR",
  "DR",
  "MUDERRIS",
  "MOLLA",
  "MUFTU",
  "SEYH",
  "HAFIZ",
];

export declare const HOCA_UNVAN_PREFIX: Readonly<Record<HocaUnvan, string>>;

export declare const isHocaUnvan: (value: unknown) => value is HocaUnvan;

export declare const formatHocaName: (
  name: string | null | undefined,
  unvan: string | null | undefined
) => string;
