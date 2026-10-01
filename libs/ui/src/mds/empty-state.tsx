import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  action?: ReactNode;
}

/** A list or region with nothing in it: one sentence, an optional icon, at most one action. A whole page with nothing is a `SystemState`. */
export function EmptyState({
  children,
  icon,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div className={cx("mds-empty", className)} {...rest}>
      {icon ? <span className="mds-empty__icon">{icon}</span> : null}
      <p className="mds-empty__text">{children}</p>
      {action}
    </div>
  );
}
