"use client";

import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { SessionJoin } from "@medaris/ui/mds/session-join";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { courseActionErrorKey } from "../action-error";
import { enrollInCourse } from "../actions";
import { courseTotals, courseViewState } from "../course-view";
import type { LessonLockReason } from "../lesson-lock";
import { sessionStateOf } from "../session-model";
import { CourseProgramme } from "./course-programme";
import { EnrollmentReceivedDialog } from "./enrollment-received-dialog";

/**
 * Design tedris/19 — a session opened by someone who may not read it. It is
 * drawn when the API answered the course with `contentLocked`, so the page has
 * no content to leak: the meeting link, agenda, kaynak and recording never
 * reached this server. What is left is the programme the course page shows
 * anyway, with the one thing to do about it. The state is 200 with a locked
 * body, not a 403.
 */
export function LessonLocked({
  course,
  session,
  koskName,
  reason,
  signInHref,
  timeZone,
  now: nowProp,
}: {
  course: CourseDetailResponse;
  session: SessionResponse;
  koskName: string | null;
  reason: LessonLockReason;
  signInHref: string;
  /** The viewer's zone, for the card's local-time line. */
  timeZone?: string;
  /** The instant the page is drawn at, for tests. */
  now?: number;
}) {
  const t = useTranslations("tedris.LessonLocked");
  const sessionText = useTranslations("tedris.SessionPage");
  const courseText = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const router = useRouter();
  const [sending, startTransition] = useTransition();
  const [now] = useState(() => nowProp ?? Date.now());
  // Design tedris/07: the window after an application that waits for approval.
  const [received, setReceived] = useState(false);
  const totals = courseTotals(course);

  const apply = () =>
    startTransition(async () => {
      const res = await enrollInCourse(course.id);
      if (res.success === false) {
        toast.error(courseText(courseActionErrorKey(res.status)));
        return;
      }
      // The API decides whether the application waits (PENDING: the window of
      // tedris/07, then this card draws "awaiting approval") or the talebe is
      // in (ENROLLED: the refresh draws the session).
      if (res.data.status === "PENDING") setReceived(true);
      router.refresh();
    });

  const action =
    reason === "signIn" ? (
      <Button href={signInHref} size="large" fullWidth>
        {t("signIn")}
      </Button>
    ) : reason === "apply" ? (
      <Button size="large" fullWidth onClick={apply} loading={sending}>
        {t("apply")}
      </Button>
    ) : reason === "pending" ? (
      <Button size="large" variant="secondary" fullWidth disabled>
        {t("pending")}
      </Button>
    ) : undefined;

  const crumbs: { label: string; href?: string }[] = [];
  if (koskName)
    crumbs.push({ label: koskName, href: `/kosks/${course.koskId}` });
  crumbs.push({ label: course.title, href: `/courses/${course.id}` });
  crumbs.push({ label: session.title });

  const state = sessionStateOf(
    {
      cancelledAt: session.cancelledAt,
      startsAt: session.startsAt,
      durationMinutes: session.durationMinutes,
    },
    new Date(now)
  );
  const teachers = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    course.muderris.map((m) => m.name)
  );

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex min-inline-0 flex-col gap-4">
        <Breadcrumb items={crumbs} label={sessionText("breadcrumb")} />
        <div className="flex min-inline-0 flex-col gap-2">
          <p className="mds-eyebrow">
            {sessionText("week", { number: session.weekNumber })}
          </p>
          <h1 className="mds-h1" dir="auto">
            {session.title}
          </h1>
        </div>
      </div>

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="grid items-start gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1">
          {session.startsAt ? (
            <SessionJoin
              startsAt={session.startsAt.toISOString()}
              durationMinutes={session.durationMinutes ?? undefined}
              timeZone={timeZone ?? course.timeZone}
              courseTimeZone={course.timeZone}
              state={state}
              access="locked"
              lockedReason={t(`description.${reason}`)}
              action={action}
              now={now}
              locale={locale}
              label={sessionText("joinLabel")}
              liveLabel={sessionText("liveLabel")}
              endedLabel={sessionText("endedLabel")}
              cancelledLabel={sessionText("cancelledLabel")}
              cancelledText={sessionText("cancelledJoinText")}
              localTimeLabel={sessionText("localTime")}
              minuteUnit={sessionText("minuteUnit")}
            />
          ) : null}
          <Card
            title={course.title}
            headingLevel={2}
            href={`/courses/${course.id}`}
            media={
              <CoverPattern
                seed={course.id}
                size="md"
                label={course.category ?? ""}
              />
            }
            footer={[
              koskName,
              sessionText("weeksCount", { count: totals.weeks }),
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {teachers ? (
              <p className="mds-body-sm" dir="auto">
                {t("teachers", { names: teachers })}
              </p>
            ) : null}
          </Card>
        </div>

        <aside
          className="flex min-inline-0 flex-col gap-3 max-md:static"
          aria-labelledby="programme"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="mds-h3" id="programme">
              {sessionText("curriculum")}
            </h2>
            <span className="mds-caption">
              {sessionText("weeksCount", { count: totals.weeks })}
            </span>
          </div>
          <CourseProgramme
            course={course}
            state={courseViewState(course, reason !== "signIn")}
            now={now}
            openWeeks={[session.weekNumber]}
          />
        </aside>
      </div>
      <EnrollmentReceivedDialog
        open={received}
        onClose={() => setReceived(false)}
        courseTitle={course.title}
      />
    </main>
  );
}
