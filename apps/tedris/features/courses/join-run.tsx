import { Fragment, type ReactNode } from "react";

/**
 * A meta run: each part but the last ends on its separator, so a wrapped line
 * ends on the dot and never starts with it. The kit's `joinRun` sits in a file
 * that also holds client hooks, which a server component cannot import.
 */
export const joinRun = (parts: ReactNode[]): ReactNode[] =>
  parts.map((part, i) =>
    i < parts.length - 1 ? (
      <span key={i}>
        {part}
        <span className="mds-sep" aria-hidden="true">
          ·
        </span>{" "}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
