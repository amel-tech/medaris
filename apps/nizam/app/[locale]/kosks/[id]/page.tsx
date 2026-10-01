import { notFound } from "next/navigation";
import {
  getKoskById,
  getKoskCourses,
  getMe,
  getPendingEnrollments,
} from "~/features/kosks/actions";
import { KoskDetailPage } from "~/features/kosks/components/kosk-detail-page";
import { koskAbilities, mayEditCourse } from "~/features/kosks/kosk-abilities";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [kosk, me] = await Promise.all([getKoskById(id), getMe()]);

  if (!kosk) {
    notFound();
  }

  const abilities = koskAbilities(me, kosk);
  const [courses, pendingEnrollments] = await Promise.all([
    getKoskCourses(kosk.id),
    // Only asked for when the panel is shown: anyone else would get a 403.
    abilities.reviewRequests ? getPendingEnrollments(kosk.id) : [],
  ]);
  const editableCourseIds = new Set(
    courses
      .filter((course) => mayEditCourse(me, kosk.id, course.id))
      .map((course) => course.id)
  );

  return (
    <KoskDetailPage
      kosk={kosk}
      courses={courses}
      abilities={abilities}
      editableCourseIds={editableCourseIds}
      pendingEnrollments={pendingEnrollments}
    />
  );
}
