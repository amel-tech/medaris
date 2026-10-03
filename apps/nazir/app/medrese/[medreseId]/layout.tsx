import type { ReactNode } from "react";
import { PortalLayout } from "~/features/shell/components/portal-layout";

export default async function MedreseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return (
    <PortalLayout scope={{ kind: "medrese", id: medreseId }}>
      {children}
    </PortalLayout>
  );
}
