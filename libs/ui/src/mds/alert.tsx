import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type AlertTone = "neutral" | "info" | "success" | "warning" | "error";

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: ReactNode;
}

/** `.mds-alert`: page state that stays. The tone's glyph is a CSS mask; an error is announced (`role="alert"`), the rest are `status`. */
export function Alert({
  tone = "neutral",
  title,
  children,
  className,
  ...rest
}: AlertProps) {
  return (
    <div
      className={cx("mds-alert", `mds-alert--${tone}`, className)}
      role={tone === "error" ? "alert" : "status"}
      {...rest}
    >
      <span className="mds-alert__icon" aria-hidden="true" />
      <div>
        {title ? <p className="mds-alert__title">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
