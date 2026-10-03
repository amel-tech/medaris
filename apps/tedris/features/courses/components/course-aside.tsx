"use client";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Icon } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { courseActionErrorKey } from "../action-error";
import { enrollInCourse } from "../actions";
import { courseActionsLabels } from "../course-actions-labels";
import {
  type CourseViewState,
  courseRhythm,
  courseSpan,
  dateWithLocative,
  isRunning,
  nextSession,
  relativeDay,
  sentAt,
  sessionWhen,
} from "../course-view";
import { AddToCalendarMenu } from "./add-to-calendar";
import { CourseActionsMenu } from "./course-actions-menu";
import { EnrollmentReceivedDialog } from "./enrollment-received-dialog";
import { LeaveCourse, WITHDRAW_BUTTON_ID } from "./leave-course";
import { ProgressDialog } from "./progress-dialog";

const Fact = ({
  icon,
  children,
}: {
  icon: "calendar" | "repeat" | "shield";
  children: ReactNode;
}) => (
  <li className="flex items-start gap-3 py-3 [&:not(:last-child)]:border-b-[length:var(--border-width-thin)] [&:not(:last-child)]:border-[color:var(--border-neutral-subtle)]">
    <Icon name={icon} size="sm" />
    <span className="mds-body-sm">{children}</span>
  </li>
);

/**
 * The right-hand cards of the course page, one set per state (designs
 * tedris/05, 06, 08, 12 and 13). The state is the caller's enrollment and
 * nothing else; the facts come from the programme.
 */
export const CourseAside = ({
  course,
  state,
  now,
  approvalRequired,
  signInHref,
  registerHref,
}: {
  course: CourseDetailResponse;
  state: CourseViewState;
  now: number;
  approvalRequired: boolean;
  signInHref: string;
  registerHref: string;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const tSession = useTranslations("tedris.SessionPage");
  const tRoot = useTranslations("tedris");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Design tedris/07: the window after an application that waits for approval.
  const [received, setReceived] = useState(false);
  const [focusWithdraw, setFocusWithdraw] = useState(false);
  const isPending = state === "pending";

  const handleEnroll = () =>
    startTransition(async () => {
      const res = await enrollInCourse(course.id);
      if (res.success === false) {
        toast.error(t(courseActionErrorKey(res.status)));
        return;
      }
      // The API decides whether the application waits (PENDING) or the
      // talebe is in (ENROLLED); the window is for the first only.
      if (res.data.status === "PENDING") setReceived(true);
      else toast.success(t("enrolled"));
      router.refresh();
    });

  // After "Tamam" focus goes to "Başvuruyu geri çek", which is on the page
  // once the refresh that follows the application has drawn it.
  useEffect(() => {
    if (!focusWithdraw || !isPending) return;
    document.getElementById(WITHDRAW_BUTTON_ID)?.focus();
    setFocusWithdraw(false);
  }, [focusWithdraw, isPending]);

  const zone = course.timeZone;
  const span = courseSpan(course, locale);
  const rhythm = courseRhythm(course, locale);
  const weeks = course.weeks.length;
  // The card's "Sıradaki celse" is the live one while it runs (design tedris/16).
  const next = nextSession(course, now, { includeRunning: true });
  const nextLive = next ? isRunning(next.lesson, now) : false;

  const facts = (
    <ul className="m-0 flex list-none flex-col p-0">
      {span ? (
        <Fact icon="calendar">{t("courseSpan", { weeks, span })}</Fact>
      ) : null}
      {rhythm ? (
        <Fact icon="repeat">
          {t("rhythm", {
            weekday: rhythm.weekday,
            clock: rhythm.clock,
            minutes: rhythm.minutes,
          })}
        </Fact>
      ) : null}
      {isPending ? null : (
        <Fact icon="shield">
          {t(approvalRequired ? "approvalNotice" : "openEnrollNotice")}
        </Fact>
      )}
    </ul>
  );

  const seat = state === "enrolled" || state === "completed";
  const nextBadge = next ? (
    nextLive ? (
      <Badge variant="live">{tSession("liveLabel")}</Badge>
    ) : (
      <Badge variant="secondary">
        {relativeDay(next.lesson.scheduledAt.getTime(), now, locale, zone)}
      </Badge>
    )
  ) : null;
  // A talebe's card (designs tedris/12, 16): the title, then the day and
  // length on one line, then whether the link is in.
  const seatNext = next ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="mds-eyebrow">{t("nextSession")}</p>
        {nextBadge}
      </div>
      <h2 className="mds-h3" dir="auto">
        {next.lesson.title}
      </h2>
      <p className="mds-body-sm mds-num">
        {sessionWhen(next.lesson.scheduledAt.getTime(), locale, zone)}
        <span className="mds-sep" aria-hidden="true">
          ·
        </span>
        {t("minutes", { minutes: next.lesson.durationMinutes ?? 60 })}
      </p>
      {next.lesson.type === "LIVE" && !next.lesson.meetingUrl ? (
        <p className="mds-caption">{t("meetingNotAdded")}</p>
      ) : null}
    </div>
  ) : null;
  const nextBlock = next ? (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="mds-eyebrow">{t("nextSession")}</h2>
        {nextBadge}
      </div>
      <p className="mds-h3 mbs-3" dir="auto">
        {next.lesson.title}
      </p>
      <p className="mds-body mbs-1">
        <strong>
          {sessionWhen(next.lesson.scheduledAt.getTime(), locale, zone)}
        </strong>
      </p>
      <p className="mds-caption">
        {t("nextSessionMeta", {
          week: next.weekNumber,
          minutes: next.lesson.durationMinutes ?? 60,
        })}
      </p>
      <p className="mds-body-sm mbs-4 flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--background-neutral-subtle)] p-3">
        <Icon name="lock" size="sm" />
        <span>{t("lockedNotice")}</span>
      </p>
    </>
  ) : null;

  if (state === "revoked") {
    return (
      <aside className="flex flex-col gap-4">
        <Card
          title={
            <span className="flex items-start gap-3">
              <Icon name="lock" size="sm" />
              {t("revokedTitle")}
            </span>
          }
          headingLevel={2}
        >
          <p className="mds-body-sm mbs-3">{t("revokedBody")}</p>
          <Button
            href="/my-courses"
            variant="secondary"
            fullWidth
            className="mbs-4"
          >
            {t("backToMyCourses")}
          </Button>
        </Card>
      </aside>
    );
  }

  if (state === "completed") {
    // Design tedris/12 "tamamladı": the course is done; while it runs the
    // celses stay open, so the next one is still offered, without progress.
    const confirmedAt = course.enrollment?.updatedAt
      ? new Date(course.enrollment.updatedAt).getTime()
      : Number.NaN;
    const confirmedOn = Number.isNaN(confirmedAt)
      ? null
      : dateWithLocative(confirmedAt, locale, zone);
    return (
      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <Badge
              variant="success"
              icon={<Icon name="check" size="sm" />}
              className="self-start"
            >
              {t("statusCompleted")}
            </Badge>
            <h2 className="mds-h3">{t("completedTitle")}</h2>
            {confirmedOn ? (
              <p className="mds-body-sm">
                {t("completedNote", { date: confirmedOn })}
              </p>
            ) : null}
          </div>
          {next ? (
            <>
              <hr className="mds-separator" />
              {seatNext}
              <Button
                href={`/courses/${course.id}/lessons/${next.lesson.id}`}
                variant="secondary"
                fullWidth
              >
                {t("openSession")}
              </Button>
            </>
          ) : null}
        </Card>
      </aside>
    );
  }

  if (seat) {
    const progress = course.enrollment?.progress ?? 0;
    return (
      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="brand">{t("statusInProgress")}</Badge>
            <CourseActionsMenu
              courseId={course.id}
              courseTitle={course.title}
              labels={courseActionsLabels(tRoot as never, course.title)}
            />
          </div>
          {next ? (
            <>
              {seatNext}
              <div className="flex flex-col gap-2">
                <Button
                  href={`/courses/${course.id}/lessons/${next.lesson.id}`}
                  fullWidth
                  size="large"
                >
                  {t("continue")}
                </Button>
                {nextLive ? null : (
                  <AddToCalendarMenu
                    courseId={course.id}
                    courseTitle={course.title}
                    lesson={{
                      id: next.lesson.id,
                      title: next.lesson.title,
                      scheduledAt: next.lesson.scheduledAt,
                      durationMinutes: next.lesson.durationMinutes ?? null,
                    }}
                  />
                )}
              </div>
            </>
          ) : null}
          <hr className="mds-separator" />
          <div className="flex flex-col gap-2">
            <Progress value={progress} label={t("progressLabel")} showValue />
            <p className="mds-caption">{t("progressNote")}</p>
            <div>
              <ProgressDialog courseId={course.id} current={progress} />
            </div>
          </div>
        </Card>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-4">
      <Card
        title={t("registerCard")}
        headingLevel={2}
        action={
          isPending ? (
            <Badge variant="warning" icon={<Icon name="clock" size="sm" />}>
              {t("pendingApproval")}
            </Badge>
          ) : null
        }
      >
        {isPending && course.enrollment ? (
          <p className="mds-body-sm mbs-3">
            {t("pendingSubmitted", {
              when: sentAt(
                new Date(course.enrollment.createdAt).getTime(),
                now,
                locale,
                zone,
                t("today")
              ),
            })}
          </p>
        ) : null}
        <div className="mbs-2">{facts}</div>
        {state === "visitor" ? (
          <div className="mbs-3 flex flex-col gap-3">
            <Button href={signInHref} fullWidth size="large">
              {t("signInToApply")}
            </Button>
            <p className="mds-body-sm">
              {t.rich("noAccount", {
                register: (chunks) => (
                  <Link href={registerHref} prefetch={false}>
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        ) : null}
        {state === "apply" ? (
          <div className="mbs-3 flex flex-col gap-3">
            <Button
              onClick={handleEnroll}
              loading={pending}
              loadingLabel={t("enrolling")}
              fullWidth
              size="large"
            >
              {approvalRequired ? t("apply") : t("enroll")}
            </Button>
            {approvalRequired ? (
              <p className="mds-body-sm">{t("applyNote")}</p>
            ) : null}
          </div>
        ) : null}
        {isPending ? <LeaveCourse courseId={course.id} /> : null}
      </Card>
      {nextBlock ? <Card>{nextBlock}</Card> : null}
      <EnrollmentReceivedDialog
        open={received}
        onClose={() => {
          setReceived(false);
          setFocusWithdraw(true);
        }}
        courseTitle={course.title}
      />
    </aside>
  );
};
