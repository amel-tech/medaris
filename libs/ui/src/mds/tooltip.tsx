import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";

/** Once per app root, with `delay={600}` (canvas rule 3). */
export function TooltipProvider({
  delay = 600,
  children,
}: {
  delay?: number;
  children: ReactNode;
}) {
  return <BaseTooltip.Provider delay={delay}>{children}</BaseTooltip.Provider>;
}

export interface TooltipProps {
  /** the bubble's text */
  label: ReactNode;
  /** the one focusable element the bubble belongs to */
  children: ReactElement;
  placement?: "top" | "bottom";
  className?: string;
}

/**
 * A tooltip on one focusable element: it shows on hover and keyboard focus and
 * Esc hides it (WCAG 1.4.13). Behaviour is Base UI's; the bubble is `.mds-tooltip`
 * with no arrow (canvas rule 7).
 */
export function Tooltip({
  label,
  children,
  placement = "top",
  className,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={placement} sideOffset={6}>
          <BaseTooltip.Popup className={cx("mds-tooltip", className)}>
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
