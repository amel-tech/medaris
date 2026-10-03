import { redirect } from "next/navigation";

/** Derslerim moved to `/my-courses` (MDRS-159); the old address still lands there. */
export default async function MyCourses({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/my-courses`);
}
