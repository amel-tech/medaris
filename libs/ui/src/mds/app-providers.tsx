"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { DismissStaleToasts, Toaster, ToastProvider } from "./toast";
import { TooltipProvider } from "./tooltip";

export interface AppProvidersProps {
  children: ReactNode;
  /**
   * The page's direction, the same as `<html dir>`: Base UI anchors menus and
   * runs arrow keys by it (MDRS-242). An app with an Arabic route passes it.
   */
  direction?: "ltr" | "rtl";
  tooltipDelay?: number;
  /** render the one `Toaster` here; an app that places it elsewhere passes false */
  toaster?: boolean;
  /**
   * The current pathname: when it changes, toasts from before the user's last
   * action are closed (MDRS-214). Left out, toasts stay across navigation.
   */
  routeKey?: string;
  className?: string;
}

/**
 * The app root's providers (canvas rule 3): `className="isolate"` so the overlays
 * stack inside it, `DirectionProvider`, `Tooltip.Provider delay={600}` and
 * `Toast.Provider limit={3}` with the one `Toaster`. Wrap the app once, below
 * `<html lang dir data-app>`, and pass the same `dir` as `direction`.
 */
export function AppProviders({
  children,
  direction = "ltr",
  tooltipDelay = 600,
  toaster = true,
  routeKey,
  className,
}: AppProvidersProps) {
  return (
    <div className={cx("isolate", className)}>
      <DirectionProvider direction={direction}>
        <TooltipProvider delay={tooltipDelay}>
          <ToastProvider>
            {routeKey === undefined ? null : (
              <DismissStaleToasts routeKey={routeKey} />
            )}
            {children}
            {toaster ? <Toaster /> : null}
          </ToastProvider>
        </TooltipProvider>
      </DirectionProvider>
    </div>
  );
}
