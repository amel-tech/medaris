import { notFound } from "next/navigation";
import { getCourse, getKoskById, getMe } from "~/features/kosks/actions";
import { NewCoursePage } from "~/features/kosks/components/new-course-page";
import { mayAssignMuderris } from "~/features/kosks/course-team";

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
  if (!kosk || !course) notFound();

  return (
    <NewCoursePage
      kosk={kosk}
      course={course}
      canAssignMuderris={mayAssignMuderris(me, course.koskId)}
    />
  );
}
