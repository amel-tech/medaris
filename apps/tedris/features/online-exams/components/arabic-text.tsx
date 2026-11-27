import type { CSSProperties, ElementType } from "react";
import { arabicRuns, hasArabic, textProps } from "../arabic";

const LATIN = /\p{Script=Latin}/u;

/**
 * A question's, an option's, an answer's or a set's text drawn by the Arabic
 * text standard (MDRS-248, `@medaris/tokens/arabic`). An Arabic text is one
 * Arabic block (`textProps`). A text that mixes Turkish and Arabic, in
 * either order, keeps the page's direction and its own size, and only its
 * Arabic runs grow, each on its own isolated element (`arabicRuns`), at the
 * short-run leading (--lh-arabic) so a line with one Arabic word does not
 * open up to the block's. Any other text is `dir="auto"`. `size` is the
 * Latin size the text stands for; the page's A− / A+ zoom multiplies both.
 */
export function ArabicText({
  text,
  as: Tag = "span",
  size,
  className,
  id,
  style,
}: {
  text: string;
  as?: ElementType;
  /** a CSS length, the Latin size this text stands for */
  size?: string;
  className?: string;
  id?: string;
  style?: CSSProperties;
}) {
  if (!hasArabic(text) || !LATIN.test(text)) {
    const props = textProps(text, size, 1);
    return (
      <Tag
        id={id}
        className={className}
        {...props}
        style={{ ...style, ...props.style }}
      >
        {text}
      </Tag>
    );
  }
  return (
    <Tag
      id={id}
      className={className}
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
            style={{ ...props.style, lineHeight: "var(--lh-arabic)" }}
          >
            {run.text}
          </span>
        );
      })}
    </Tag>
  );
}
