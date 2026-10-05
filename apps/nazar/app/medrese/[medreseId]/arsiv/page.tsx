import type { Metadata } from "next";
import { pageOf } from "~/features/archive/archive";
import { ArchivePage } from "~/features/archive/components/archive-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Archive");
  return { title: t("title") };
}

/** Arşiv (nazir 12); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ medreseId: string }>;
  searchParams: Promise<{ tur?: string | string[]; sayfa?: string | string[] }>;
}) {
  const { medreseId } = await params;
  const { tur, sayfa } = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return (
    <ArchivePage
      madrasahId={medreseId}
      tabParam={first(tur)}
      page={pageOf(first(sayfa))}
    />
  );
}
