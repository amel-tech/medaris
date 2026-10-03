import { Avatar } from "@medaris/ui/mds/avatar";
import type { ReactNode } from "react";

/**
 * The pieces the three home pages are made of (nizam 01, 02 and 05, MDRS-182):
 * a headed section with its "Tümünü gör" link, and a row of a card — an avatar,
 * a name, a caption and what can be done with it.
 */
export function HomeSection({
  id,
  title,
  link,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  /** "Tümünü gör" */
  link?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`flex min-w-0 flex-col gap-4 ${className ?? ""}`}
      data-testid={id}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="mds-h2">
          {title}
        </h2>
        {link ? (
          <a className="mds-link" href={link.href}>
            {link.label}
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** The frame of a list card: rows one under the other, divided. */
export function RowList({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <ul
      className="mds-card m-0 flex list-none flex-col gap-0 p-0"
      data-testid={testId}
    >
      {children}
    </ul>
  );
}

/** One row: avatar, name, captions, and the action at the end. */
export function Row({
  name,
  entity = false,
  title,
  captions,
  action,
  testId,
}: {
  /** the avatar's name; the initials come from it */
  name: string;
  /** a köşk, a medrese or a deck wears the square mark, a person the round one */
  entity?: boolean;
  title: ReactNode;
  captions: ReactNode[];
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <li
      className="flex items-start gap-3 border-be border-neutral-subtle p-card last:border-be-0"
      data-testid={testId}
    >
      <Avatar name={name} entity={entity} decorative />
      <div className="flex min-inline-0 flex-1 flex-col gap-1">
        <bdi className="font-semibold">{title}</bdi>
        {captions.map((caption, i) => (
          // The captions are fixed sentences of one row, never reordered.
          <span key={i} className="mds-caption">
            {caption}
          </span>
        ))}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}
