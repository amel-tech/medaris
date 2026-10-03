import { notFound } from "next/navigation";
import { getCourse, getKosk } from "~/features/courses/actions";
import { LessonLocked } from "~/features/courses/components/lesson-locked";
import { SessionPage } from "~/features/courses/components/session-page";
import { lessonLockReason } from "~/features/courses/lesson-lock";
import { getSession } from "~/features/courses/public-reads";
import { auth } from "~/lib/auth_options";

export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const [course, session] = await Promise.all([
    getCourse(courseId),
    getSession(courseId, lessonId),
  ]);
  if (!course || !session) notFound();

  // MDRS-103: the API leaves the content out for anyone who may not read it
  // and says so with `contentLocked`, so this page decides nothing about
  // access — it only picks B8's call to action. A signed-out visitor does not
  // reach here: MDRS-122 opened the course page to guests but kept its lessons
  // behind the auth middleware, so "signIn" stays for a session whose token
  // could not be refreshed.
  const reason = lessonLockReason(course, Boolean(await auth()));
  if (reason) {
    return (
      <LessonLocked
        courseId={course.id}
        courseTitle={course.title}
        lessonId={session.id}
        lessonTitle={session.title}
        reason={reason}
      />
    );
  }

  const kosk = await getKosk(course.koskId);
  return (
    <SessionPage
      course={course}
      session={session}
      koskName={kosk?.name ?? null}
      now={new Date()}
    />
  );
}
