import { notFound } from "next/navigation";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { getCourse, getKosk } from "~/features/courses/actions";
import { LessonLocked } from "~/features/courses/components/lesson-locked";
import { SessionPage } from "~/features/courses/components/session-page";
import { lessonLockReason } from "~/features/courses/lesson-lock";
import { getSession } from "~/features/courses/public-reads";
import { ExamEntry } from "~/features/online-exams/components/exam-entry";
import { readBriefing } from "~/features/online-exams/reads";
import { auth } from "~/lib/auth";
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
    const hrefs = inviteHrefs(`/courses/${course.id}/lessons/${session.id}`);
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

  // An exam celse that is a published online exam (MDRS-299) leads to it.
  const online = session.exam ? await readBriefing(session.id) : null;
  let examEntry = null;
  if (online?.status === "ok") {
    const t = await getTranslations("tedrisLearn.OnlineExam");
    const words = new Intl.DateTimeFormat(await getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: await getTimeZone(),
    });
    // A finished one leads to the talebe's own screen of it (Sınavlarım).
    const taken = online.briefing.attempt?.status === "FINISHED";
    examEntry = (
      <ExamEntry
        briefing={online.briefing}
        href={
          taken
            ? `/my-exams/${session.id}`
            : `/courses/${course.id}/lessons/${session.id}/sinav`
        }
        labels={{
          title: t("entryTitle"),
          when: t("entryWhen", {
            opens: words.format(online.briefing.startsAt),
            latest: words.format(online.briefing.latestStartAt),
          }),
          action: t(taken ? "entryResult" : "entryAction"),
          taken: t("entryTaken"),
        }}
      />
    );
  }

  return (
    <SessionPage
      course={course}
      session={session}
      koskName={kosk?.name ?? null}
      now={new Date()}
      examEntry={examEntry}
    />
  );
}
