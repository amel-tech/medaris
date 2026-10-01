"use client";

import {
  ArrowLeftIcon as ArrowLeft,
  ClockIcon as Clock,
  LockSimpleIcon as LockSimple,
} from "@medaris/icons";
import { Button } from "@medaris/ui/components/button";
import { Card, CardContent } from "@medaris/ui/components/card";
import { toast } from "@medaris/ui/components/sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { authPages } from "~/lib/auth_pages";
import { enrollInCourse } from "../actions";
import type { LessonLockReason } from "../lesson-lock";

/**
 * B8 — a lesson opened by someone who may not read it. Rendered when the API
 * answered the course with `contentLocked`, so the page has no content to
 * leak: the meeting link, agenda and kaynak never reached this server.
 *
 * Only the programme is shown — the course and lesson titles, which the
 * course page shows anyway — with one call to action. B8 has no drawing yet;
 * this follows the system's card rule (one primary per surface) and
 * `DeckUnavailable`, the other "you cannot open this" card in tedris.
 */
export function LessonLocked({
  courseId,
  courseTitle,
  lessonId,
  lessonTitle,
  reason,
}: {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  reason: LessonLockReason;
}) {
  const t = useTranslations("tedris.LessonLocked");
  const router = useRouter();
  const [sending, startTransition] = useTransition();
  const coursePath = `/courses/${courseId}`;
  // Back to this lesson after signing in, not to the course page.
  const signInHref = `${authPages.signIn}?callbackUrl=${encodeURIComponent(
    `${coursePath}/lessons/${lessonId}`
  )}`;

  const apply = () =>
    startTransition(async () => {
      const res = await enrollInCourse(courseId);
      if (res.success === false) {
        toast.error(res.error);
        return;
      }
      // ENROLLED re-renders the lesson; PENDING re-renders this card.
      router.refresh();
    });

  return (
    <div className="mx-auto flex max-w-md px-4 py-16">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <LockSimple className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">{courseTitle}</div>
            <div className="text-sm font-semibold">{lessonTitle}</div>
          </div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`description.${reason}`)}
          </p>

          {reason === "signIn" && (
            <Button asChild className="mt-2">
              <Link href={signInHref}>{t("signIn")}</Link>
            </Button>
          )}
          {reason === "apply" && (
            <Button className="mt-2" onClick={apply} disabled={sending}>
              {sending ? t("applying") : t("apply")}
            </Button>
          )}
          {reason === "pending" && (
            <Button className="mt-2" variant="secondary" disabled>
              <Clock size={14} /> {t("pending")}
            </Button>
          )}

          <Link
            href={coursePath}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground"
          >
            <ArrowLeft size={14} /> {t("backToCourse")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
