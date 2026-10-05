import type { Metadata } from "next";
import { OffsitePage } from "~/features/offsite/components/offsite-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Offsite");
  return { title: t("title") };
}

/** Medrese dışı ders talebi (nazir 09), under Dersler. */
export default async function Page({
  params,
}: {
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return <OffsitePage madrasahId={medreseId} />;
}
