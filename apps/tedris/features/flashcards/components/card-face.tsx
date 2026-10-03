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
  if (arabic && size === "table") {
    // The canvas draws a row's Arabic as the system's inline run (`.mds-arabic`),
    // which keeps the row at the height of the Latin text next to it.
    return (
      <span
        className={["mds-arabic", className].filter(Boolean).join(" ")}
        dir="rtl"
        lang="ar"
      >
        {text}
      </span>
    );
  }
  return (
    <span
      className={[
        "block",
        arabic && "font-arabic text-center text-[1.75rem] leading-[2.2]",
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
