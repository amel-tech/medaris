import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "brand"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "live";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
  dot?: boolean;
}

/** `.mds-badge`. The live-now state always carries its dot beside the words (MDS-COL-03). */
export function Badge({
  children,
  variant = "secondary",
  icon,
  dot = false,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx("mds-badge", `mds-badge--${variant}`, className)}
      {...rest}
    >
      {dot || variant === "live" ? (
        <span className="mds-badge__dot" aria-hidden="true" />
      ) : null}
      {icon}
      {children}
    </span>
  );
}
