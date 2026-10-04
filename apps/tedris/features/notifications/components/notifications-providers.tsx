"use client";

import type { ReactNode } from "react";
import { LocaleAppProviders } from "~/components/locale-app-providers";

/**
 * The kit's providers for the notifications segment (canvas rule 3): the
 * Toast and Tooltip roots the page's undo toasts and menu rely on. A client
 * component because the kit's provider files carry no `"use client"` of
 * their own.
 */
export function NotificationsProviders({ children }: { children: ReactNode }) {
  return <LocaleAppProviders>{children}</LocaleAppProviders>;
}
