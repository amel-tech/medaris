import type { Metadata } from "next";
import { StudentsPage } from "~/features/students/components/students-page";
import { filtersOf } from "~/features/students/students";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Students");
  return { title: t("title") };
}

type Param = string | string[] | undefined;

/** Talebeler (nazir 10); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ medreseId: string }>;
  searchParams: Promise<{
    ara?: Param;
    ders?: Param;
    durum?: Param;
    sayfa?: Param;
  }>;
}) {
  const { medreseId } = await params;
  const { ara, ders, durum, sayfa } = await searchParams;
  const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
  return (
    <StudentsPage
      madrasahId={medreseId}
      filters={filtersOf({
        ara: first(ara),
        ders: first(ders),
        durum: first(durum),
        sayfa: first(sayfa),
      })}
    />
  );
}
