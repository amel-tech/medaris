import type { CSSProperties, ElementType } from "react";
import { arabicRuns, isMixed, paragraphDir, textProps } from "../arabic";

export { paragraphDir };

/**
 * A question's, an option's, an answer's or a set's text drawn by the Arabic
 * text standard (MDRS-248, `@medaris/tokens/arabic`). An Arabic text is one
 * Arabic block (`textProps`). A text that mixes Turkish and Arabic, in
 * either order, takes the page's direction (`paragraphDir`: "إِيَّاكَ
 * نَعْبُدُ: …" is a Turkish sentence on a Turkish page) and its own size, and
 * only its Arabic runs grow, each on its own isolated right-to-left element
 * (`arabicRuns`), at the short-run leading (--lh-arabic) so a line with one
 * Arabic word does not open up to the block's. Any other text takes the
 * page's direction too. `size` is the Latin size the text stands for; the page's
 * A− / A+ zoom multiplies both. A heading passes its `weight`, which the
 * Arabic block's book weight would otherwise replace, and gets the
 * short-run leading too.
 */
export function ArabicText({
  text,
  as: Tag = "span",
  size,
  weight,
  className,
  id,
  style,
}: {
  text: string;
  as?: ElementType;
  /** a CSS length, the Latin size this text stands for */
  size?: string;
  /** a heading's font weight, kept on its Arabic */
  weight?: string;
  className?: string;
  id?: string;
  style?: CSSProperties;
}) {
  const heading: CSSProperties | null = weight
    ? { fontWeight: weight, lineHeight: "var(--lh-arabic)" }
    : null;
  if (!isMixed(text)) {
    const props = textProps(text, size, 1);
    const arabic = props.lang === "ar";
    return (
      <Tag
        id={id}
        className={className}
        {...props}
        style={{ ...style, ...props.style, ...(arabic ? heading : null) }}
      >
        {text}
      </Tag>
    );
  }
  return (
    <Tag
      id={id}
      className={className}
      dir={paragraphDir(text)}
      data-mixed-arabic=""
      style={size ? { ...style, fontSize: size } : style}
    >
      {arabicRuns(text).map((run, i) => {
        if (!run.arabic) return run.text;
        const props = textProps(run.text, "1em", 1);
        return (
          // The run's index is its place in a text that does not reorder.
          <span
            key={i}
            {...props}
            style={{
              ...props.style,
              lineHeight: "var(--lh-arabic)",
              ...(weight ? { fontWeight: weight } : null),
            }}
          >
            {run.text}
          </span>
        );
      })}
    </Tag>
  );
}
