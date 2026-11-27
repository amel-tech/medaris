import type { ReactNode } from "react";
import { arabicRuns, isMixed, mixedDir, textProps } from "../arabic";

/**
 * A question's or an option's text by the Arabic text standard (MDRS-248):
 * an Arabic text is one Arabic block and a Latin one is left to the browser
 * (`textProps`). A text that mixes the two, in either order, takes the
 * direction of its frame (`mixedDir`: a Turkish question that opens with a
 * hadith stays left to right) and draws each Arabic run in it, with its
 * brackets and quotes, on its own isolated right-to-left element
 * (`arabicRuns`), so "«زَيْدٌ» kelimesinin i'râbı nedir?" keeps its Turkish
 * order, its quotes around the word and its Arabic at the Arabic size.
 */
export function ArabicText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!isMixed(text)) {
    return (
      <span className={className} {...textProps(text)}>
        {text}
      </span>
    );
  }
  const parts: ReactNode[] = [];
  let at = 0;
  for (const run of arabicRuns(text)) {
    parts.push(
      run.arabic ? (
        <span key={at} {...textProps(run.text)}>
          {run.text}
        </span>
      ) : (
        run.text
      )
    );
    at += run.text.length;
  }
  return (
    <span className={className} dir={mixedDir(text)} data-mixed-arabic="">
      {parts}
    </span>
  );
}
