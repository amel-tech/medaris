import type { Metadata } from "next";
import { AppealsPage } from "~/features/appeals/components/appeals-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Appeals");
  return { title: t("title") };
}

/** İtirazlar (W5); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return <AppealsPage madrasahId={medreseId} />;
}
