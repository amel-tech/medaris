import type { SVGProps } from "react";
import { fillGlyphs, glyphs, type IconName, mirrored } from "./glyphs";

export type { IconName } from "./glyphs";

export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "name" | "ref"> {
  /** a name from the system's sprite (design-system/medaris-unified/assets/icons.svg) */
  name: IconName;
  /** 16 / 20 / 24 */
  size?: "sm" | "md" | "lg";
  /** the filled glyph, as a state; only star, play and bookmark have one */
  filled?: boolean;
  /** names a standalone icon (role="img"); without it the icon is hidden from assistive technology */
  label?: string;
}

/**
 * One glyph from the system's single icon source, Phosphor Regular.
 * Port of design-system/medaris-unified/components/Icon.jsx; read its
 * .prompt.md before using it. The glyph fills with currentColor.
 */
export function Icon({
  name,
  size = "md",
  filled = false,
  label,
  className,
  ...rest
}: IconProps) {
  const paths = (filled && fillGlyphs[name]) || glyphs[name];
  if (!paths) return null;
  const cls = [
    "mds-icon",
    size !== "md" && `mds-icon--${size}`,
    mirrored.has(name) && "mds-icon--directional",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const a11y = label
    ? { role: "img", "aria-label": label }
    : { "aria-hidden": true, focusable: false };
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: the system's contract (Icon.prompt.md) names a standalone icon with role="img" and aria-label, and hides every other one with aria-hidden; both arrive through the a11y spread, which the rule cannot see
    <svg className={cls} viewBox="0 0 256 256" {...a11y} {...rest}>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
