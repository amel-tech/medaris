import { redirect } from "next/navigation";

/**
 * The old course editor lived here. Its parts are now the Müfredat
 * (nizam/54), Celseler (nizam/56) and Ders ayarları (nizam/34) pages; links
 * that still point at `/edit` (the overview, the taught-courses list, the
 * inactive-scopes table) land on the curriculum, which is where the course is
 * edited.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string; courseId: string }>;
}) {
  const { locale, id, courseId } = await params;
  redirect(`/${locale}/kosks/${id}/courses/${courseId}/curriculum`);
}
