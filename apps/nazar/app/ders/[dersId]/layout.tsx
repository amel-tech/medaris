import type { ReactNode } from "react";
import { PortalLayout } from "~/features/shell/components/portal-layout";

export default async function DersLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return (
    <PortalLayout scope={{ kind: "ders", id: dersId }}>{children}</PortalLayout>
  );
}
