import { isArabic } from "../deck-model";

/**
 * One face of a card: Arabic script sets right to left in the Arabic face and
 * a larger size (design tedris/28, 29), anything else follows the text's own
 * direction. The language is declared on the Arabic run so a screen reader
 * switches voice.
 */
export function CardFace({
  text,
  size = "table",
  className,
}: {
  text: string;
  /** `sample`: the big front of a sample card; `table`: a row's cell */
  size?: "sample" | "table";
  className?: string;
}) {
  const arabic = isArabic(text);
  return (
    <span
      className={[
        "block",
        arabic &&
          (size === "sample"
            ? "font-arabic text-center text-[1.75rem] leading-[2.2]"
            : "font-arabic text-[1.375rem] leading-[2]"),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      dir={arabic ? "rtl" : "auto"}
      lang={arabic ? "ar" : undefined}
    >
      {text}
    </span>
  );
}
