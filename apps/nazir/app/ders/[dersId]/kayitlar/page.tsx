import type { Metadata } from "next";
import { RecordingsPage } from "~/features/recordings/components/recordings-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Recordings");
  return { title: t("title") };
}

/** Ders kayıtları of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <RecordingsPage courseId={dersId} />;
}
