import { Icon } from "@medaris/ui/mds/icon";
import type { ReleaseWords } from "../recordings-model";

/**
 * When a celse's recording opens to talebe (MDRS-288), as one line: the
 * sentence on the course's clock, and the viewer's own clock after it when
 * that shows another time. Server-safe, no state: the session page, the
 * watch page and the recordings tab all draw it from `releaseWordsOf`.
 */
export const RecordingReleaseNote = ({
  words,
  id,
  className,
}: {
  words: ReleaseWords;
  /** For a row that names it in `aria-describedby`. */
  id?: string;
  className?: string;
}) => (
  <span
    id={id}
    className={`flex flex-wrap items-center gap-x-2 gap-y-1${className ? ` ${className}` : ""}`}
    data-recording-release=""
  >
    <Icon name="clock" size="sm" />
    <span>{words.text}</span>
    {/* Read as two sentences; the flex gap draws the space. */}
    {words.zone ? (
      <>
        {" "}
        <span className="mds-caption">{words.zone}</span>
      </>
    ) : null}
  </span>
);
