import type { Metadata } from "next";
import { GlossaryPage } from "~/features/glossary/components/glossary-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Glossary");
  return { title: t("title") };
}

/** Lügat of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ dersId: string }>;
}) {
  const { dersId } = await params;
  return <GlossaryPage courseId={dersId} />;
}
