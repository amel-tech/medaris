import type { Metadata } from "next";
import { filtersOf } from "~/features/bans/bans";
import { CourseBansPage } from "~/features/bans/components/course-bans-page";
import { getMessages } from "~/lib/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages("nazar.Bans");
  return { title: t("title") };
}

type Param = string | string[] | undefined;

/** Yasaklamalar of a course; it wins over the shared placeholder's `[bolum]`. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ dersId: string }>;
  searchParams: Promise<{ durum?: Param }>;
}) {
  const { dersId } = await params;
  const { durum } = await searchParams;
  return (
    <CourseBansPage
      courseId={dersId}
      status={
        filtersOf({ durum: Array.isArray(durum) ? durum[0] : durum }).status
      }
    />
  );
}
