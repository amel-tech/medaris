"use client";

import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import type { ReactNode } from "react";

/**
 * The unified system's toast provider and its one `Toaster`, for a segment
 * whose components call `useToaster` (the calendar menu) while the shell above
 * still carries the old kit's Sonner toaster. Without it `useToaster` throws
 * during render and the segment falls to the error page.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <Toaster />
    </ToastProvider>
  );
}
