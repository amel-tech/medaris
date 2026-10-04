import type { Metadata } from "next";
import { SessionsPage } from "~/features/sessions/components/sessions-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Sessions");
  return { title: t("title") };
}

/** Celseler of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <SessionsPage courseId={dersId} />;
}
