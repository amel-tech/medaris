import type { Metadata } from "next";
import { filtersOf } from "~/features/bans/bans";
import { BansPage } from "~/features/bans/components/bans-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Bans");
  return { title: t("title") };
}

type Param = string | string[] | undefined;

/** Yasaklamalar (nazir 11); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ medreseId: string }>;
  searchParams: Promise<{ durum?: Param; kapsam?: Param }>;
}) {
  const { medreseId } = await params;
  const { durum, kapsam } = await searchParams;
  const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
  return (
    <BansPage
      madrasahId={medreseId}
      filters={filtersOf({ durum: first(durum), kapsam: first(kapsam) })}
    />
  );
}
