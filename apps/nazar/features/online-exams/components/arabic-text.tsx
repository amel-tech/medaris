import type { ReactNode } from "react";
import { arabicRuns, startsArabic, textProps } from "../arabic";

/**
 * A question's or an option's text by the Arabic text standard (MDRS-248):
 * a text that starts Arabic is one Arabic block (`textProps`), any other is
 * left to the browser (`dir="auto"`) with each Arabic word or phrase in it
 * its own isolated Arabic run, so "“Hamd” ne demek: الْحَمْدُ" keeps its
 * Turkish order and its Arabic at the Arabic size.
 */
export function ArabicText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (startsArabic(text)) {
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
    <span className={className} dir="auto">
      {parts}
    </span>
  );
}
