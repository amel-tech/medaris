"use client";

import { useTheme } from "next-themes";
import type * as React from "react";
import {
  type ExternalToast,
  Toaster as Sonner,
  toast as sonnerToast,
  type ToasterProps,
} from "sonner";
import { useDismissStaleToasts } from "../hooks/use-dismiss-stale-toasts";

/**
 * How long a success, info or plain toast stays when its caller sets no
 * `duration`: the unified kit's 6 s (canvas rule 21, `toastTiming` in
 * `mds/toast.tsx`), so both toasters agree (MDRS-214).
 */
export const TOAST_DURATION = 6000;

/** Warning and error stay until closed, as in the unified kit (canvas rule 21). */
const STAYS = Number.POSITIVE_INFINITY;

type Message = Parameters<typeof sonnerToast.success>[0];

/**
 * Sonner's `toast` with the kit's timing per tone. Sonner has one duration per
 * `Toaster`, not per type, so the tone's duration is set on each call; a
 * caller's own `duration` still wins. Setting it on success too matters when a
 * success re-fires an error's id: Sonner keeps every field the new call leaves
 * out, and the error's endless duration would otherwise carry over.
 */
const toast: typeof sonnerToast = Object.assign(
  (message: Message, data?: ExternalToast) =>
    sonnerToast(message, { duration: TOAST_DURATION, ...data }),
  sonnerToast,
  {
    success: (message: Message, data?: ExternalToast) =>
      sonnerToast.success(message, { duration: TOAST_DURATION, ...data }),
    info: (message: Message, data?: ExternalToast) =>
      sonnerToast.info(message, { duration: TOAST_DURATION, ...data }),
    message: (message: Message, data?: ExternalToast) =>
      sonnerToast.message(message, { duration: TOAST_DURATION, ...data }),
    warning: (message: Message, data?: ExternalToast) =>
      sonnerToast.warning(message, { duration: STAYS, ...data }),
    error: (message: Message, data?: ExternalToast) =>
      sonnerToast.error(message, { duration: STAYS, ...data }),
  }
);

type AppToasterProps = ToasterProps & {
  /** the close button's accessible name, in the page's language */
  closeLabel: string;
};

const Toaster = ({ closeLabel, toastOptions, ...props }: AppToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      duration={TOAST_DURATION}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          description: "!text-popover-foreground/80",
        },
        closeButtonAriaLabel: closeLabel,
        ...toastOptions,
      }}
      {...props}
    />
  );
};

/**
 * Next to the Sonner `Toaster`: on every change of `routeKey` (the pathname)
 * it dismisses the toasts that were already on screen when the user last
 * acted, so no toast outlives the page it reports on (MDRS-214). Sonner
 * replaces a toast's object when it is re-fired with the same id, so the
 * object itself tells a replaced toast from a stale one — pinned by
 * `libs/ui/test/toast-lifecycle.spec.tsx`.
 */
const DismissStaleSonnerToasts = ({ routeKey }: { routeKey: string }) => {
  useDismissStaleToasts(routeKey, {
    active: () => sonnerToast.getToasts(),
    version: (t) => t,
    dismiss: (t) => sonnerToast.dismiss(t.id),
  });
  return null;
};

export { DismissStaleSonnerToasts, Toaster, toast };
