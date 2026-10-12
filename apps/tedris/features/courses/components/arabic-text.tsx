import { splitArabic } from "../session-model";

/**
 * A line with each Arabic run set in its own language and direction ("قرأ
 * fiilinin…"). No hooks, so the server detail page and its client agenda
 * draw it alike.
 */
export const ArabicText = ({ text }: { text: string }) => (
  <>
    {splitArabic(text).map((part, i) =>
      part.arabic ? (
        <span key={i} lang="ar" dir="rtl" className="mds-arabic">
          {part.text}
        </span>
      ) : (
        <span key={i}>{part.text}</span>
      )
    )}
  </>
);
