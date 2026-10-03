import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseRequestsView } from "~/features/platform-admin/components/course-requests-view";
import { getPendingCourseRequests } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.CourseRequestsPage");
  return { title: t("title") };
}

/**
 * Ders talepleri (design nizam/39): what medreses ask this köşk to open. A
 * caller who is not one of the köşk's nazıms gets the "Bu bölüm için izniniz
 * yok" screen (nizam/06); a köşk that is not there, the not-found screen; a
 * failed read, a warning with "Tekrar dene".
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const requests = await getPendingCourseRequests(id);
  if (requests === "forbidden") forbidden();
  if (requests === "not-found") notFound();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      <CourseRequestsView koskId={id} initial={requests} />
    </div>
  );
}
