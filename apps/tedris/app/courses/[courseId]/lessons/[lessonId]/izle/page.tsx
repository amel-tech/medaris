import { notFound, redirect } from "next/navigation";
import { getCourse } from "~/features/courses/actions";
import { WatchPage } from "~/features/courses/components/watch-page";
import { lessonLockReason } from "~/features/courses/lesson-lock";
import { getSession } from "~/features/courses/public-reads";
import { watchTargetOf } from "~/features/courses/watch-model";
import { auth } from "~/lib/auth";

/**
 * The watch page of a celse (MDRS-285): its stream or its recording, with the
 * chat or the questions and the talebe's notes beside it. Entered from the
 * celse's detail page, whose gating it keeps: a caller who may not read the
 * content goes to the detail page, which draws the locked card and its call
 * to action (MDRS-103), and so does anyone when the celse has nothing to
 * watch: no stream link sent by the API and no READY recording. The segment
 * layout has already settled a 404 for an unknown celse.
 *
 * `?soru=1` is the "question answered" notification's link (MDRS-248): the
 * answer is read in "Soru sor" here, and when the celse has nothing to watch
 * it is read in the course's "Sorularım" tab instead of the detail page,
 * which shows no question.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
  searchParams: Promise<{ soru?: string | string[] }>;
}) {
  const { courseId, lessonId } = await params;
  const { soru } = await searchParams;
  const [course, session] = await Promise.all([
    getCourse(courseId),
    getSession(courseId, lessonId),
  ]);
  if (!course || !session) notFound();

  const detail = `/courses/${course.id}/lessons/${session.id}`;
  if (lessonLockReason(course, Boolean(await auth()))) redirect(detail);
  const target = watchTargetOf(session);
  if (!target) {
    redirect(soru ? `/courses/${course.id}?tab=sorularim` : detail);
  }

  return (
    <WatchPage
      course={course}
      session={session}
      target={target}
      now={new Date()}
    />
  );
}
