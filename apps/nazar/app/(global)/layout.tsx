import type { ReactNode } from "react";
import { PortalLayout } from "~/features/shell/components/portal-layout";

/** Pages outside any scope (`/hesap`, `/bildirimler`): the shell of the remembered scope. */
export default function GlobalLayout({ children }: { children: ReactNode }) {
  return <PortalLayout scope={null}>{children}</PortalLayout>;
}
