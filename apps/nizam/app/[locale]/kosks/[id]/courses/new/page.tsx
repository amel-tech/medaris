import { notFound } from "next/navigation";
import { getKoskById, getMe } from "~/features/kosks/actions";
import { NewCoursePage } from "~/features/kosks/components/new-course-page";
import { koskAbilities } from "~/features/kosks/kosk-abilities";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [kosk, me] = await Promise.all([getKoskById(id), getMe()]);
  // Nothing links here for a caller who may not open a course (MDRS-108);
  // typed in by hand, the page would only end in a 403 on save.
  if (!kosk || !koskAbilities(me, kosk).openCourse) notFound();

  return <NewCoursePage kosk={kosk} />;
}
