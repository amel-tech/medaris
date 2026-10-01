import { notFound } from "next/navigation";
import { getCourse, getKoskById, getMe } from "~/features/kosks/actions";
import { NewCoursePage } from "~/features/kosks/components/new-course-page";
import { mayAssignMuderris } from "~/features/kosks/course-team";
import { mayEditCourse } from "~/features/kosks/kosk-abilities";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; courseId: string }>;
}) {
  const { id, courseId } = await params;
  const [kosk, course, me] = await Promise.all([
    getKoskById(id),
    getCourse(courseId),
    getMe(),
  ]);
  // Nothing links here for a caller who may not edit the course (MDRS-108);
  // typed in by hand, every save on the page would end in a 403.
  if (
    !kosk ||
    !course ||
    course.koskId !== kosk.id ||
    !mayEditCourse(me, kosk.id, course.id)
  ) {
    notFound();
  }

  return (
    <NewCoursePage
      kosk={kosk}
      course={course}
      canAssignMuderris={mayAssignMuderris(me, course.koskId)}
    />
  );
}
