import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  media?: ReactNode;
  footer?: ReactNode;
  /** a clickable card is one link, in its title; its `::after` covers the card */
  href?: string;
  density?: "regular" | "compact";
}

/** `.mds-card`. One tab stop when it is a link; the buttons inside still work. */
export function Card({
  title,
  action,
  headingLevel = 3,
  media,
  footer,
  href,
  density = "regular",
  children,
  className,
  ...rest
}: CardProps) {
  const Heading =
    `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 3}` as "h3";
  const interactive = Boolean(href && title);
  return (
    <div
      className={cx(
        "mds-card",
        interactive && "mds-card--interactive",
        className
      )}
      data-density={density === "compact" ? "compact" : undefined}
      {...rest}
    >
      {media ? <div className="mds-card__media">{media}</div> : null}
      {title || action ? (
        <div className="mds-card__header">
          {title ? (
            <Heading className="mds-card__title" dir="auto">
              {interactive ? (
                <a className="mds-card__link" href={href}>
                  {title}
                </a>
              ) : (
                title
              )}
            </Heading>
          ) : null}
          {action}
        </div>
      ) : null}
      {children}
      {footer ? <div className="mds-card__footer">{footer}</div> : null}
    </div>
  );
}
