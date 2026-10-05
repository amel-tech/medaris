import type { Metadata } from "next";
import { CoursesPage } from "~/features/courses/components/courses-page";
import { filtersOf } from "~/features/courses/courses";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazir.Courses");
  return { title: t("title") };
}

/** Dersler (nazir 07); it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ medreseId: string }>;
  searchParams: Promise<{
    kosk?: string | string[];
    durum?: string | string[];
  }>;
}) {
  const { medreseId } = await params;
  const { kosk, durum } = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return (
    <CoursesPage
      madrasahId={medreseId}
      filters={filtersOf({ kosk: first(kosk), durum: first(durum) })}
    />
  );
}
