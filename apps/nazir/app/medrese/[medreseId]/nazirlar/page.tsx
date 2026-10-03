import type { Metadata } from "next";
import { NazirsPage } from "~/features/nazirs/components/nazirs-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Nazirs");
  return { title: t("title") };
}

/** Medrese nazırları (nazir 05); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return <NazirsPage madrasahId={medreseId} />;
}
