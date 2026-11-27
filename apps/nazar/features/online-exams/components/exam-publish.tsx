"use client";

import type {
  ExamKind,
  OnlineExamDraftResponse,
  PublishProblemResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { fieldsOf, instantOf } from "~/features/sessions/sessions";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { unpublishOnlineExam } from "../actions";
import { onlineExamErrorKey, READS_AGAIN } from "../online-exams";

const MINUTE = 60_000;
/** The latest start the page fills in: the earliest plus ten minutes (decided 22 Nov 2026). */
export const LATEST_START_DEFAULT_MINUTES = 10;

/** The next whole hour on the viewer's clock: where "İleri bir tarihte" starts. */
const nextHour = (now: Date, timeZone: string): Date => {
  const { date, time } = fieldsOf(
    new Date(now.getTime() + 60 * MINUTE),
    timeZone
  );
  return instantOf(date, `${time.slice(0, 2)}:00`, timeZone) ?? now;
};
const later = (at: Date, minutes: number) =>
  new Date(at.getTime() + minutes * MINUTE);
const minuteOf = (at: Date) =>
  new Date(Math.floor(at.getTime() / MINUTE) * MINUTE);

/** Each problem as the lines the page lists, in the API's order. */
function ProblemLines({ problems }: { problems: PublishProblemResponse[] }) {
  const t = useTranslations("nazar");
  const lines: string[] = [];
  for (const p of problems) {
    if (p.kind === "NO_DURATION")
      lines.push(t("OnlineExams.problemNoDuration"));
    if (p.kind === "NO_QUESTION")
      lines.push(t("OnlineExams.problemNoQuestion"));
    if (p.kind === "POINTS") {
      lines.push(t("OnlineExams.problemPoints", { total: p.total ?? "" }));
    }
    if (p.kind === "NO_ZEROTH") lines.push(t("OnlineExams.problemNoZeroth"));
    if (p.kind === "QUESTION") {
      const n = p.number ?? 0;
      for (const lack of p.lacks ?? []) {
        if (lack === "text") lines.push(t("OnlineExams.problemNoText", { n }));
        if (lack === "option") {
          lines.push(t("OnlineExams.problemFewOptions", { n }));
        }
        if (lack === "correct") {
          lines.push(t("OnlineExams.problemNoCorrect", { n }));
        }
        if (lack === "topic")
          lines.push(t("OnlineExams.problemNoTopic", { n }));
      }
    }
  }
  return (
    <ul className="mds-body-sm flex list-disc flex-col gap-1 ps-5">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * "Yayınla" under the editor: what keeps the exam from being published, or
 * when it opens. "Şimdi yayınla" opens it now; "İleri bir tarihte" takes a
 * day and a time, the exam celse's own. The latest start follows the
 * earliest by ten minutes until it is changed by hand. Both are on the
 * viewer's clock. Publishing asks once, then runs after the writes queued
 * before it (`onPublish`).
 *
 * A çalışma seti (`kind: PRACTICE`, MDRS-248) has no date, no window and no
 * length: one "Yayınla", asked once, opens it to the course's talebe from
 * now on.
 */
export function PublishSection({
  kind = "EXAM",
  problems,
  questionCount,
  durationMinutes,
  timeZone,
  holding,
  sending,
  onPublish,
}: {
  kind?: ExamKind;
  problems: PublishProblemResponse[];
  questionCount: number;
  /** Null until the team types it; the exam is not published without it. */
  durationMinutes: number | null;
  timeZone: string;
  /** A question's form is open: publishing would leave it out. */
  holding: boolean;
  sending: boolean;
  onPublish: (times: {
    startsAt?: string;
    latestStartMinutes?: number;
  }) => void;
}) {
  const t = useTranslations("nazar");
  const [mode, setMode] = useState<"now" | "later">("later");
  const [earliest, setEarliest] = useState(() =>
    fieldsOf(nextHour(new Date(), timeZone), timeZone)
  );
  // The late window in minutes, counted from the exam's real opening: the
  // press for "Şimdi yayınla", the chosen time otherwise. A clock time would
  // drift between the choice and the press.
  const [lateMinutes, setLateMinutes] = useState(
    String(LATEST_START_DEFAULT_MINUTES)
  );
  const [asking, setAsking] = useState(false);
  const [tried, setTried] = useState(false);
  // "Şimdi" moves with the clock; the time shown under the minutes follows it.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (mode !== "now") return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [mode]);

  const changeEarliest = (next: { date: string; time: string }) =>
    setEarliest(next);
  const changeMode = (next: string) =>
    setMode(next === "now" ? "now" : "later");

  const startAt =
    mode === "now"
      ? minuteOf(new Date())
      : instantOf(earliest.date, earliest.time, timeZone);
  const minutes = /^\d+$/.test(lateMinutes.trim())
    ? Number(lateMinutes.trim())
    : null;
  const latestAt =
    startAt !== null && minutes !== null ? later(startAt, minutes) : null;
  const startProblem =
    mode === "later" && startAt === null
      ? t("OnlineExams.pickTime")
      : mode === "later" &&
          startAt !== null &&
          startAt.getTime() < minuteOf(new Date()).getTime()
        ? t("OnlineExams.startPassed")
        : null;
  const latestProblem =
    minutes === null || minutes < 1 || minutes > 10080
      ? t("OnlineExams.lateMinutesInvalid")
      : null;

  const ask = () => {
    setTried(true);
    if (startProblem || latestProblem) return;
    setAsking(true);
  };
  const confirm = () => {
    setAsking(false);
    if (minutes === null || (mode === "later" && !startAt)) return;
    onPublish({
      ...(mode === "later" && startAt
        ? { startsAt: startAt.toISOString() }
        : {}),
      latestStartMinutes: minutes,
    });
  };

  if (kind === "PRACTICE") {
    return (
      <section
        className="mds-card flex flex-col gap-3 p-4"
        aria-labelledby="publish-title"
      >
        <h2 id="publish-title" className="mds-h2">
          {t("Practice.publishTitle")}
        </h2>
        <p className="mds-body-sm text-neutral-muted">{t("Practice.intro")}</p>
        {problems.length > 0 ? (
          <Alert tone="warning" title={t("OnlineExams.notReadyTitle")}>
            <p>{t("Practice.notReady")}</p>
          </Alert>
        ) : null}
        {holding ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.holdingQuestion")}
          </p>
        ) : null}
        <div>
          <Button
            onClick={() => setAsking(true)}
            disabled={holding || problems.length > 0}
            loading={sending}
          >
            {t("Practice.publish")}
          </Button>
        </div>
        <AlertDialog
          open={asking}
          onOpenChange={setAsking}
          title={t("Practice.publishConfirmTitle")}
          confirmLabel={t("Practice.publish")}
          cancelLabel={t("OnlineExams.cancel")}
          closeLabel={t("Shell.close")}
          onConfirm={() => {
            setAsking(false);
            onPublish({});
          }}
        >
          {t("Practice.lockedNote")}
        </AlertDialog>
      </section>
    );
  }

  return (
    <section
      className="mds-card flex flex-col gap-3 p-4"
      aria-labelledby="publish-title"
    >
      <h2 id="publish-title" className="mds-h2">
        {t("OnlineExams.publishTitle")}
      </h2>
      {problems.length > 0 ? (
        <Alert tone="warning" title={t("OnlineExams.notReadyTitle")}>
          <p>{t("OnlineExams.notReadyBody")}</p>
          <ProblemLines problems={problems} />
        </Alert>
      ) : (
        <>
          <RadioGroup
            legend={t("OnlineExams.publishWhen")}
            name="publish-when"
            value={mode}
            onChange={changeMode}
            options={[
              { value: "later", label: t("OnlineExams.publishLater") },
              { value: "now", label: t("OnlineExams.publishNow") },
            ]}
          />
          {mode === "later" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mds-label">
                {t("OnlineExams.earliestStartLabel")}
              </legend>
              <div className="flex flex-wrap gap-2">
                <Field
                  label={t("OnlineExams.dateLabel")}
                  error={tried && startProblem ? startProblem : undefined}
                >
                  <Input
                    type="date"
                    value={earliest.date}
                    onChange={(e) =>
                      changeEarliest({ ...earliest, date: e.target.value })
                    }
                  />
                </Field>
                <Field label={t("OnlineExams.timeLabel")}>
                  <Input
                    type="time"
                    value={earliest.time}
                    onChange={(e) =>
                      changeEarliest({ ...earliest, time: e.target.value })
                    }
                  />
                </Field>
              </div>
              <p className="mds-help">{t("OnlineExams.earliestStartHelp")}</p>
            </fieldset>
          ) : null}
          <Field
            label={t("OnlineExams.lateMinutesLabel")}
            error={tried && latestProblem ? latestProblem : undefined}
          >
            <Input
              inputMode="numeric"
              value={lateMinutes}
              onChange={(e) =>
                setLateMinutes(e.target.value.replace(/\D/g, ""))
              }
              className="w-24"
            />
          </Field>
          <p className="mds-help">
            {latestAt
              ? t(
                  mode === "now"
                    ? "OnlineExams.lateMinutesHelpNow"
                    : "OnlineExams.lateMinutesHelp",
                  {
                    minutes: minutes ?? 0,
                    time: fieldsOf(latestAt, timeZone).time,
                  }
                )
              : t("OnlineExams.latestStartHelp")}
          </p>
          <p className="mds-caption text-neutral-muted">
            {t("OnlineExams.timeZoneNote", { zone: timeZone })}
          </p>
          {holding ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("OnlineExams.holdingQuestion")}
            </p>
          ) : null}
          <div>
            <Button onClick={ask} disabled={holding} loading={sending}>
              {mode === "now"
                ? t("OnlineExams.publish")
                : t("OnlineExams.scheduleConfirm")}
            </Button>
          </div>
          <AlertDialog
            open={asking}
            onOpenChange={setAsking}
            title={t("OnlineExams.publishConfirmTitle")}
            confirmLabel={
              mode === "now"
                ? t("OnlineExams.publish")
                : t("OnlineExams.scheduleConfirm")
            }
            cancelLabel={t("OnlineExams.cancel")}
            closeLabel={t("Shell.close")}
            onConfirm={confirm}
          >
            {t("OnlineExams.publishSummary", {
              duration: durationMinutes ?? "—",
              count: questionCount,
            })}
          </AlertDialog>
        </>
      )}
    </section>
  );
}

/**
 * A published exam, read-only: where it stands, when it opens and until when
 * a talebe may start, and its questions. Until it opens, "Taslağa al" deletes
 * its celse and gives the editor back (`onUnpublished`).
 *
 * A published çalışma seti (`kind: PRACTICE`, MDRS-248) is "Yayında" with
 * "Yayından kaldır", which the API refuses (EXAM_LOCKED) once a talebe has
 * started it.
 */
export function PublishedExam({
  draft,
  kind = "EXAM",
  timeZone,
  locale,
  onUnpublished,
}: {
  draft: OnlineExamDraftResponse;
  kind?: ExamKind;
  timeZone: string;
  locale: string;
  onUnpublished: (next: OnlineExamDraftResponse) => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const practice = kind === "PRACTICE";
  const { notify } = useToaster();
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const when = (at: Date | string | null | undefined) =>
    at
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "long",
          timeStyle: "short",
          timeZone,
        }).format(new Date(at))
      : "";

  const unpublish = async () => {
    setAsking(false);
    setSending(true);
    try {
      const result = await unpublishOnlineExam(draft.id, draft.version);
      if (handleUnauthenticated(result as never)) return;
      if ("success" in result && result.success === false) {
        notify({
          tone: "error",
          title: t("OnlineExams.failed"),
          description:
            practice && result.code === "EXAM_LOCKED"
              ? t("Practice.locked")
              : words(onlineExamErrorKey(result.code)),
        });
        if (READS_AGAIN.has(result.code)) router.refresh();
        return;
      }
      if ("data" in result) onUnpublished(result.data);
    } catch {
      notify({ tone: "error", title: t("OnlineExams.failed") });
    } finally {
      setSending(false);
    }
  };

  const badge = practice ? (
    <Badge variant="success">{t("Practice.statusOpen")}</Badge>
  ) : draft.status === "SCHEDULED" ? (
    <Badge variant="brand">{t("OnlineExams.statusScheduledTitle")}</Badge>
  ) : draft.status === "OPEN" ? (
    <Badge variant="success">{t("OnlineExams.statusOpen")}</Badge>
  ) : (
    <Badge variant="outline">{t("OnlineExams.statusClosed")}</Badge>
  );

  return (
    <div className="flex flex-col gap-section">
      <section
        className="mds-card flex flex-col gap-3 p-4"
        aria-labelledby="published-title"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="published-title" className="mds-h2">
            {t("OnlineExams.publishTitle")}
          </h2>
          {badge}
        </div>
        <p className="mds-body">
          {practice
            ? t("Practice.intro")
            : draft.status === "SCHEDULED"
              ? t("OnlineExams.scheduledBody", {
                  when: when(draft.startsAt),
                  latest: when(draft.latestStartAt),
                })
              : draft.status === "OPEN"
                ? t("OnlineExams.openBody", {
                    latest: when(draft.latestStartAt),
                  })
                : t("OnlineExams.closedBody")}
        </p>
        {practice ? (
          <>
            <p className="mds-body-sm text-neutral-muted">
              {t("Practice.lockedNote")}
            </p>
            <div>
              <Button
                variant="secondary"
                onClick={() => setAsking(true)}
                loading={sending}
              >
                {t("Practice.unpublish")}
              </Button>
            </div>
            <AlertDialog
              open={asking}
              onOpenChange={setAsking}
              title={t("Practice.unpublishTitle")}
              confirmLabel={t("Practice.unpublish")}
              cancelLabel={t("OnlineExams.cancel")}
              closeLabel={t("Shell.close")}
              onConfirm={unpublish}
            >
              {t("Practice.unpublishBody")}
            </AlertDialog>
          </>
        ) : draft.status === "SCHEDULED" ? (
          <>
            <p className="mds-help">{t("OnlineExams.notifiedNote")}</p>
            <p className="mds-body-sm text-neutral-muted">
              {t("OnlineExams.publishedNote")}
            </p>
            <div>
              <Button
                variant="secondary"
                onClick={() => setAsking(true)}
                loading={sending}
              >
                {t("OnlineExams.toDraft")}
              </Button>
            </div>
            <AlertDialog
              open={asking}
              onOpenChange={setAsking}
              title={t("OnlineExams.toDraftTitle")}
              confirmLabel={t("OnlineExams.toDraft")}
              cancelLabel={t("OnlineExams.cancel")}
              closeLabel={t("Shell.close")}
              onConfirm={unpublish}
            >
              {t("OnlineExams.toDraftBody")}
            </AlertDialog>
          </>
        ) : null}
      </section>
      <section
        className="flex flex-col gap-3"
        aria-labelledby="published-questions"
      >
        <h2 id="published-questions" className="mds-h2">
          {t("OnlineExams.questionsTitle", { count: draft.questions.length })}
        </h2>
        <ol className="flex flex-col gap-3">
          {draft.questions.map((q) => (
            <li key={q.id} className="mds-card flex flex-col gap-2 p-4">
              <strong>
                {t("OnlineExams.questionNumber", { number: q.number })}
              </strong>
              <p className="mds-body" dir="auto">
                {q.text}
              </p>
              <ol className="mds-body-sm flex flex-col gap-1" type="A">
                {q.options.map((o) => (
                  <li key={o.id} dir="auto">
                    {o.text}
                    {o.correct ? ` · ${t("OnlineExams.correct")}` : ""}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
