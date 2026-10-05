import type { Metadata } from "next";
import { SettingsPage } from "~/features/settings/components/settings-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Settings");
  return { title: t("title") };
}

/** Medrese ayarları (nazir 04); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
}: {
  params: Promise<{ medreseId: string }>;
}) {
  const { medreseId } = await params;
  return <SettingsPage madrasahId={medreseId} />;
}
