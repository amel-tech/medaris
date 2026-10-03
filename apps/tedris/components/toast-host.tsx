"use client";

import {
  DismissStaleToasts,
  Toaster,
  ToastProvider,
} from "@medaris/ui/mds/toast";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The unified system's toast provider and its one `Toaster`, for a segment
 * whose components call `useToaster` (the calendar menu) while the shell above
 * still carries the old kit's Sonner toaster. Without it `useToaster` throws
 * during render and the segment falls to the error page.
 *
 * `DismissStaleToasts` closes, on a page change inside the segment, the
 * toasts from before the user's last action (MDRS-214).
 */
export function ToastHost({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <ToastProvider>
      <DismissStaleToasts routeKey={pathname} />
      {children}
      <Toaster />
    </ToastProvider>
  );
}
