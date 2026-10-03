import { Fragment, type ReactNode } from "react";

/**
 * A note's Markdown as React elements (MDRS-150). The text is stored as typed
 * and never turned into HTML: every run below is a React text child, which
 * escapes it, so `<script>` or `<img onerror>` in a note is shown as the
 * characters it is. Nothing here uses `dangerouslySetInnerHTML`.
 *
 * A small subset, enough for study notes: headings, paragraphs with line
 * breaks, bullet and numbered lists, quotes, fenced and inline code, bold,
 * italic and links. A link is drawn only for `http:` and `https:`; any other
 * scheme (`javascript:`, `data:`) stays literal text.
 */

const INLINE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|\[[^\]\n]+\]\([^)\s]+\))/;

const safeHref = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const inline = (text: string, keyPrefix: string): ReactNode[] =>
  text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (i % 2 === 0) return <Fragment key={key}>{part}</Fragment>;
    if (part.startsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") || part.startsWith("__")) {
      return <strong key={key}>{inline(part.slice(2, -2), key)}</strong>;
    }
    if (part.startsWith("[")) {
      const close = part.lastIndexOf("](");
      const href = safeHref(part.slice(close + 2, -1));
      if (!href) return <Fragment key={key}>{part}</Fragment>;
      return (
        <a
          key={key}
          className="mds-btn mds-btn--link"
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {part.slice(1, close)}
        </a>
      );
    }
    return <em key={key}>{inline(part.slice(1, -1), key)}</em>;
  });

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```/;

/** The note's source as block elements; an empty source draws nothing. */
export const NoteMarkdown = ({ source }: { source: string }) => {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const next = () => `b${n++}`;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
    } else if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={next()} className="mds-code" dir="ltr">
          <code>{code.join("\n")}</code>
        </pre>
      );
    } else if (HEADING.test(line)) {
      const match = HEADING.exec(line) as RegExpExecArray;
      const key = next();
      blocks.push(
        <p key={key} className="mds-label" dir="auto">
          {inline(match[2], key)}
        </p>
      );
      i++;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push((pattern.exec(lines[i]) as RegExpExecArray)[1]);
        i++;
      }
      const key = next();
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className="m-0 ps-5" dir="auto">
          {items.map((item, j) => (
            <li key={j}>{inline(item, `${key}-${j}`)}</li>
          ))}
        </List>
      );
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push((QUOTE.exec(lines[i]) as RegExpExecArray)[1]);
        i++;
      }
      const key = next();
      blocks.push(
        <blockquote
          key={key}
          className="m-0 ps-3 border-is border-neutral-subtle"
          dir="auto"
        >
          {quoted.map((q, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {inline(q, `${key}-${j}`)}
            </Fragment>
          ))}
        </blockquote>
      );
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !FENCE.test(lines[i]) &&
        !HEADING.test(lines[i]) &&
        !BULLET.test(lines[i]) &&
        !NUMBERED.test(lines[i]) &&
        !QUOTE.test(lines[i])
      ) {
        para.push(lines[i++]);
      }
      const key = next();
      blocks.push(
        <p key={key} className="m-0" dir="auto">
          {para.map((p, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {inline(p, `${key}-${j}`)}
            </Fragment>
          ))}
        </p>
      );
    }
  }
  return <div className="flex flex-col gap-2 mds-body-sm">{blocks}</div>;
};
