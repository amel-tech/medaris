import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseCreateForm } from "~/features/courses/components/course-create-form";
import { CourseLoadFailed } from "~/features/courses/components/course-load-failed";
import { getKoskById, getMe } from "~/features/kosks/actions";
import { koskAbilities } from "~/features/kosks/kosk-abilities";
import { getPendingCourseRequests } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.CourseCreate");
  return { title: t("title") };
}

/**
 * Ders aç (design nizam/32). Nothing links here for a caller who may not open a
 * course (MDRS-108); typed in by hand, the page is the "Bu bölüm için izniniz
 * yok" screen (nizam/06) rather than a form whose save would end in a 403.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ talep?: string }>;
}) {
  const { locale, id } = await params;
  const { talep } = await searchParams;
  setRequestLocale(locale);
  const [kosk, me] = await Promise.all([getKoskById(id), getMe()]);
  if (!kosk && !me) return <CourseLoadFailed />;
  if (!kosk) notFound();
  if (!koskAbilities(me, kosk).openCourse) forbidden();

  // "Kabul et" of a medrese's course request (nizam/39) opens the form with
  // the request's name; an unknown or answered request leaves it empty.
  const requests = talep ? await getPendingCourseRequests(id) : null;
  const request =
    requests && typeof requests === "object"
      ? requests.items.find((r) => r.id === talep)
      : undefined;

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <CourseCreateForm
        kosk={kosk}
        request={request && { id: request.id, title: request.title }}
      />
    </div>
  );
}
