import { type HTMLAttributes, type ReactNode, useId } from "react";
import { cx } from "./cx";

export interface SystemStateProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** `restricted` replaces the whole app: never inside the shell, and no way out of it */
  kind?: string;
  title: ReactNode;
  action?: ReactNode;
  logo?: ReactNode;
  /** inside the app shell, which owns `<main>`, the state is a `<section>` */
  shell?: boolean;
  headingLevel?: 1 | 2;
}

/** A page that is only a state: it is the page's `<main>`, or a `<section>` inside the shell. */
export function SystemState({
  kind,
  title,
  children,
  action,
  logo,
  shell = false,
  headingLevel = 1,
  className,
  ...rest
}: SystemStateProps) {
  const id = `mds-system-state-${useId().replace(/[^\w-]/g, "")}`;
  const restricted = kind === "restricted";
  const Region = shell && !restricted ? "section" : "main";
  const Heading = `h${headingLevel}` as "h1";
  return (
    <Region
      {...rest}
      className={cx(
        "mds-system-state",
        Region === "main" && "mds-system-state--page",
        className
      )}
      aria-labelledby={id}
    >
      {logo}
      <Heading className={headingLevel === 1 ? "mds-h1" : "mds-h2"} id={id}>
        {title}
      </Heading>
      <p className="mds-system-state__text">{children}</p>
      {restricted ? null : action}
    </Region>
  );
}
