import type { Metadata } from "next";
import { SarfPage } from "~/features/sarf/components/sarf-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Sarf");
  return { title: t("title") };
}

/** Sarf tablosu of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <SarfPage courseId={dersId} />;
}
