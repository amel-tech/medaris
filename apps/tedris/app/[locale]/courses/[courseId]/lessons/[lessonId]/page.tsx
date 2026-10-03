import { notFound } from "next/navigation";
import { getLocale, getTimeZone } from "next-intl/server";
import { getCourse, getKosk } from "~/features/courses/actions";
import { LessonLocked } from "~/features/courses/components/lesson-locked";
import { SessionPage } from "~/features/courses/components/session-page";
import { lessonLockReason } from "~/features/courses/lesson-lock";
import { getSession } from "~/features/courses/public-reads";
import { auth } from "~/lib/auth_options";
import { inviteHrefs } from "~/lib/invite-hrefs";

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
  const kosk = await getKosk(course.koskId);
  if (reason) {
    const hrefs = inviteHrefs(
      await getLocale(),
      `/courses/${course.id}/lessons/${session.id}`
    );
    return (
      <LessonLocked
        course={course}
        session={session}
        koskName={kosk?.name ?? null}
        reason={reason}
        signInHref={hrefs.signIn}
        timeZone={await getTimeZone()}
      />
    );
  }

  return (
    <SessionPage
      course={course}
      session={session}
      koskName={kosk?.name ?? null}
      now={new Date()}
    />
  );
}
