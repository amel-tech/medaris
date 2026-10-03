import { Button as BaseButton } from "@base-ui/react/button";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonSize, ButtonVariant } from "./button";
import { cx } from "./cx";
import { Tooltip } from "./tooltip";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** the glyph, an `<Icon>` from the caller */
  icon: ReactNode;
  /** the accessible name; the same text shows as the tooltip */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * An icon-only `.mds-btn` whose name also shows as a tooltip (Button + Tooltip,
 * canvas rule 5). The name is `aria-label`.
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "regular",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <BaseButton
        {...rest}
        type={type}
        aria-label={label}
        className={cx(
          "mds-btn",
          "mds-icon-btn",
          `mds-btn--${size}`,
          `mds-btn--${variant}`,
          className
        )}
      >
        {icon}
      </BaseButton>
    </Tooltip>
  );
}
