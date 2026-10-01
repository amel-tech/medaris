/**
 * The token names MDRS-73 adds, by family and by the file that owns them.
 * One list, shared by the specs, so "every family is present" and "every
 * value traces to Figma" are checked against the same names.
 */
const weights = [
  "extralight",
  "light",
  "regular",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
];
const sizes = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "body-lg",
  "body",
  "body-sm",
  "caption",
  "footnote",
];
const tones = [
  "neutral-primary",
  "neutral-secondary",
  "neutral-tertiary",
  "neutral-disabled",
  "neutralinverse-primary",
  "neutralinverse-secondary",
  "neutralinverse-tertiary",
  ...["brand", "success", "warning", "error", "info"].flatMap((tone) => [
    `${tone}-primary`,
    `${tone}-secondary`,
    `${tone}-inverse`,
  ]),
];

export const FAMILIES = {
  type: {
    file: "typography.css",
    names: [
      "font-cairo",
      "font-ibm-plex-sans",
      ...weights.map((w) => `font-weight-${w}`),
      ...sizes.map((s) => `text-${s}`),
      "line-height-tight",
      "line-height-snug",
      "line-height-body",
      "letter-spacing-normal",
      "letter-spacing-tight",
    ],
  },
  spacing: {
    file: "spacing.css",
    names: [
      ...["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"].map(
        (s) => `space-${s}`
      ),
      "bp-mobile",
      "bp-tablet",
      "bp-desktop",
    ],
  },
  radius: {
    file: "radius.css",
    names: [
      ...["xxs", "xs", "s", "m", "l", "xl", "full"].map(
        (r) => `corner-radius-${r}`
      ),
      ...["xs", "s", "m", "l"].map((w) => `border-weight-${w}`),
    ],
  },
  elevation: {
    file: "elevation.css",
    names: [
      ...["2xs", "xs", "sm", "md", "lg", "xl", "2xl"].map((s) => `shadow-${s}`),
      "shadow-focus",
      "shadow-focus-error",
    ],
  },
  icon: {
    file: "icon-colors.css",
    names: tones.map((t) => `icon-color-${t}`),
  },
} satisfies Record<string, { file: string; names: string[] }>;

export const NEW_TOKEN_NAMES = Object.values(FAMILIES).flatMap((f) => f.names);
export const HAND_AUTHORED_FILES = Object.values(FAMILIES).map((f) => f.file);
