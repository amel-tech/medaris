"use client";

import type {
  ExamAttemptResponse,
  ExamBriefingResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale, useTranslations } from "next-intl";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import {
  answerZerothQuestion,
  finishExamAttempt,
  readExamBriefing,
  recordTabSwitch,
  resumeExamAttempt,
  saveExamAnswer,
  startExamAttempt,
  tickExamClock,
} from "../actions";
import {
  clockText,
  holderIdFor,
  LAST_FIVE_SECONDS,
  type LocalAnswer,
  nextIndex,
  type QuestionState,
  stateOf,
  TICK_MS,
  takeErrorKey,
} from "../take-model";

type Phase = "briefing" | "running" | "elsewhere" | "ended";

/** What a failed action says: its HTTP status and the API's code, when there is one. */
const failure = (result: unknown): { status?: number; code?: string } =>
  result as { status?: number; code?: string };

/** A call that did not reach the API, or that the API could not answer: the connection, as the page sees it. */
const lostConnection = (result: unknown) => {
  const { status } = failure(result);
  return status === undefined || status >= 500;
};

/**
 * A talebe takes an online exam (MDRS-299, `graphs/tedris/exams/take`):
 * "Bilmeniz gerekenler" with the zeroth question, then the questions in an
 * order of their own with the countdown, every choice saved the moment it is
 * made, and the end.
 *
 * Optimistic: a choice shows at once and is sent in the background with the
 * page's count (seq), so a save that arrives late never replaces a later
 * one. The clock is the server's; the page counts it down between calls and
 * takes the server's word every few seconds. A lost connection stops the
 * clock: the page says so, keeps the choices it could not send, and takes
 * the attempt back (resume) when the connection returns. Another tab that
 * opens the exam takes the attempt; this one says so and can take it back.
 * Coming back from another tab is counted for the team.
 */
/**
 * The question list's colours (the owner, 22 Nov 2026: "cevaplanmamışsa sarı
 * olsun, atlanmışsa turuncu olsun, cevaplanmışsa beyaz/dark olsun"), set
 * inline so no stylesheet order can undo them. Unanswered is the warning
 * pair; skipped is the warning's bold fill, the closest the system has to
 * orange (it has no orange token); answered is the sheet itself, white by
 * day and dark by night. The current question carries a brand ring on top.
 * Each button's name says its state too, so colour is never the only cue.
 */
const INDICATOR: Record<QuestionState, CSSProperties> = {
  unseen: {
    background: "var(--background-warning-subtle)",
    borderColor: "var(--border-warning-default)",
    color: "var(--text-warning-default)",
  },
  skipped: {
    background: "var(--background-warning-bold)",
    borderColor: "var(--border-warning-default)",
    color: "var(--text-neutral-on-bold)",
  },
  answered: {
    background: "var(--background-neutral-surface)",
    borderColor: "var(--border-neutral-strong)",
    color: "var(--text-neutral-default)",
  },
};

const CURRENT: CSSProperties = {
  boxShadow:
    "0 0 0 2px var(--background-neutral-page), 0 0 0 4px var(--border-brand-default)",
};

export function ExamTake({
  lessonId,
  sessionHref,
  briefing: initial,
}: {
  lessonId: string;
  sessionHref: string;
  briefing: ExamBriefingResponse;
}) {
  const t = useTranslations("tedrisLearn.OnlineExam");
  const locale = useLocale();
  const { notify } = useToaster();
  const at = (value: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const time = (value: Date | string) =>
    new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
      new Date(value)
    );

  const [brief, setBrief] = useState(initial);
  const [zeroth, setZeroth] = useState(initial.zeroth.answeredOptionId);
  const [zerothFailed, setZerothFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    initial.attempt?.status === "FINISHED" ? "ended" : "briefing"
  );
  const [attempt, setAttempt] = useState<ExamAttemptResponse | null>(null);
  const [answers, setAnswers] = useState<Map<string, LocalAnswer>>(new Map());
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(0);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const holder = useRef("");
  const seq = useRef(0);
  // Choices the connection did not carry, sent again after the resume.
  const unsent = useRef(new Map<string, LocalAnswer>());
  const hidden = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const holderId = () => {
    if (!holder.current) {
      holder.current = holderIdFor(lessonId, window.sessionStorage);
    }
    return holder.current;
  };

  /** The briefing again, for how the attempt ended. */
  const reread = useCallback(async () => {
    const result = await readExamBriefing(lessonId);
    if (sendToSignIn(result)) return;
    if (result.success) {
      setBrief(result.data);
      if (result.data.attempt?.status === "FINISHED") setPhase("ended");
    }
  }, [lessonId]);

  /** What a refused call means for the page; true when it was handled. */
  const refused = useCallback(
    (result: unknown): void => {
      if (sendToSignIn(result)) return;
      const { code } = failure(result);
      if (code === "ATTEMPT_HELD_ELSEWHERE") {
        setPhase("elsewhere");
        return;
      }
      if (code === "ATTEMPT_ENDED" || code === "ATTEMPT_NOT_FOUND") {
        void reread();
        return;
      }
      if (lostConnection(result)) {
        setOffline(true);
        return;
      }
      notify({ tone: "error", title: t(takeErrorKey(code)) });
    },
    [notify, reread, t]
  );

  const send = useCallback(
    async (questionId: string, answer: LocalAnswer) => {
      seq.current += 1;
      const mine = seq.current;
      setPending((n) => n + 1);
      try {
        const result = await saveExamAnswer(lessonId, questionId, {
          holderId: holderId(),
          seq: mine,
          optionIds: answer.optionIds,
          skipped: answer.skipped,
          currentQuestionId: questionId,
        });
        if (result.success) {
          unsent.current.delete(questionId);
          if (result.data.written) setLeft(result.data.secondsLeft);
          return;
        }
        if (lostConnection(result)) unsent.current.set(questionId, answer);
        refused(result);
      } catch {
        unsent.current.set(questionId, answer);
        setOffline(true);
      } finally {
        setPending((n) => n - 1);
      }
    },
    [lessonId, refused]
  );

  /** The attempt as the server gives it: running, or ended. */
  const enter = useCallback(
    (a: ExamAttemptResponse, resumed: boolean) => {
      if (a.status === "FINISHED") {
        void reread();
        setPhase("ended");
        return;
      }
      seq.current = 0;
      setAttempt(a);
      const held = new Map<string, LocalAnswer>(
        a.answers.map((x) => [
          x.questionId,
          { optionIds: x.optionIds, skipped: x.skipped },
        ])
      );
      // A choice made while the connection was lost stands over the server's.
      for (const [id, answer] of unsent.current) held.set(id, answer);
      setAnswers(held);
      const at = a.questions.findIndex((q) => q.id === a.currentQuestionId);
      setIndex(at === -1 ? 0 : at);
      setLeft(a.secondsLeft);
      setOffline(false);
      setPhase("running");
      if (resumed) setNotice(t("resumed"));
      for (const [id, answer] of [...unsent.current]) void send(id, answer);
    },
    [reread, send, t]
  );

  const resume = useCallback(async () => {
    try {
      const result = await resumeExamAttempt(lessonId, holderId());
      if (result.success) enter(result.data, true);
      else refused(result);
    } catch {
      setOffline(true);
    }
  }, [enter, lessonId, refused]);

  // An attempt in progress goes on here when the page opens.
  useEffect(() => {
    if (initial.attempt?.status === "IN_PROGRESS") void resume();
  }, []);

  // The countdown between the server's counts, and the count itself.
  useEffect(() => {
    if (phase !== "running" || offline) return;
    const second = window.setInterval(
      () => setLeft((s) => Math.max(0, s - 1)),
      1000
    );
    const tick = window.setInterval(async () => {
      try {
        const result = await tickExamClock(lessonId, holderId());
        if (!result.success) return refused(result);
        if (result.data.status === "FINISHED") {
          await reread();
          setPhase("ended");
        } else {
          setLeft(result.data.secondsLeft);
        }
      } catch {
        setOffline(true);
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(second);
      window.clearInterval(tick);
    };
  }, [phase, offline, lessonId, refused, reread]);

  // At zero the server is asked at once, and it ends the attempt.
  const atZero = phase === "running" && left === 0;
  useEffect(() => {
    if (!atZero) return;
    void (async () => {
      try {
        const result = await tickExamClock(lessonId, holderId());
        if (result.success && result.data.status === "FINISHED") {
          await reread();
          setPhase("ended");
        } else if (result.success) {
          setLeft(result.data.secondsLeft);
        } else {
          refused(result);
        }
      } catch {
        setOffline(true);
      }
    })();
  }, [atZero]);

  // Coming back from another tab or window is counted; nothing is erased.
  useEffect(() => {
    const onChange = async () => {
      if (phaseRef.current !== "running") return;
      if (document.visibilityState === "hidden") {
        hidden.current = true;
        return;
      }
      if (!hidden.current) return;
      hidden.current = false;
      try {
        const result = await recordTabSwitch(lessonId, holderId());
        if (result.success) {
          notify({ tone: "info", title: t("switchCounted") });
        } else {
          refused(result);
        }
      } catch {
        setOffline(true);
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [lessonId, notify, refused, t]);

  // The connection back: the attempt is taken back and the kept choices sent.
  useEffect(() => {
    if (!offline) return;
    const back = () => void resume();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [offline, resume]);

  const chooseZeroth = async (optionId: string) => {
    const before = zeroth;
    setZeroth(optionId);
    setZerothFailed(false);
    try {
      const result = await answerZerothQuestion(lessonId, optionId);
      if (result.success) return;
      if (sendToSignIn(result)) return;
      setZeroth(before);
      setZerothFailed(true);
      if (!lostConnection(result)) {
        notify({ tone: "error", title: t(takeErrorKey(failure(result).code)) });
      }
    } catch {
      setZeroth(before);
      setZerothFailed(true);
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      const result = await startExamAttempt(lessonId, holderId());
      if (result.success) enter(result.data, false);
      else if (!sendToSignIn(result)) {
        notify({
          tone: "error",
          title: t(
            lostConnection(result)
              ? "startFailed"
              : takeErrorKey(failure(result).code)
          ),
        });
        if (failure(result).code === "EXAM_ALREADY_TAKEN") await reread();
      }
    } catch {
      notify({ tone: "error", title: t("startFailed") });
    } finally {
      setStarting(false);
    }
  };

  const finish = async () => {
    setAsking(false);
    try {
      const result = await finishExamAttempt(lessonId, holderId());
      if (result.success) {
        await reread();
        setPhase("ended");
      } else {
        refused(result);
      }
    } catch {
      setOffline(true);
    }
  };

  if (phase === "ended") {
    return <ExamEnded brief={brief} sessionHref={sessionHref} time={time} />;
  }

  if (phase === "elsewhere") {
    return (
      <section className="mds-card flex flex-col gap-3" aria-live="polite">
        <h1 className="mds-h2">{t("elsewhereTitle")}</h1>
        <p className="mds-body">{t("elsewhere")}</p>
        <div>
          <Button onClick={() => void resume()}>{t("openHere")}</Button>
        </div>
      </section>
    );
  }

  if (phase === "running" && attempt) {
    const questions = attempt.questions;
    const q = questions[index];
    const ids = questions.map((it) => it.id);
    const mine = q ? answers.get(q.id) : undefined;
    const lastFive = left <= LAST_FIVE_SECONDS;
    const unanswered = questions.filter(
      (it) => stateOf(answers.get(it.id)) !== "answered"
    ).length;
    const skipped = questions.filter(
      (it) => stateOf(answers.get(it.id)) === "skipped"
    ).length;

    const choose = (optionIds: string[]) => {
      if (!q) return;
      const answer = { optionIds, skipped: false };
      setAnswers((all) => new Map(all).set(q.id, answer));
      setNotice(null);
      void send(q.id, answer);
    };
    const go = (to: number | null, follow = false) => {
      if (to === null) return;
      setIndex(to);
      setNotice(
        follow && skipped > 0
          ? t("skippedFollow", { skipped: String(skipped) })
          : null
      );
    };
    const skip = () => {
      if (!q) return;
      const answer = { optionIds: mine?.optionIds ?? [], skipped: true };
      const next = new Map(answers).set(q.id, answer);
      setAnswers(next);
      void send(q.id, answer);
      const to = nextIndex(ids, next, index);
      go(to, to !== null && to <= index);
    };

    return (
      <div className="flex flex-col gap-section">
        <section
          className="mds-card flex flex-wrap items-center justify-between gap-3"
          aria-label={t("barLabel")}
        >
          <p
            className="mds-h3 mds-num"
            style={
              lastFive ? { color: "var(--text-error-default)" } : undefined
            }
            data-last-five={lastFive || undefined}
            role="timer"
            aria-label={t("timeLeftLabel")}
            data-testid="exam-clock"
          >
            {clockText(left)}
            {lastFive ? (
              <span className="mds-body-sm"> · {t("lastFive")}</span>
            ) : null}
          </p>
          <p className="mds-body-sm">
            {t("counter", {
              number: String(index + 1),
              count: String(questions.length),
            })}
          </p>
          <p className="mds-body-sm text-neutral-muted" aria-live="polite">
            {pending > 0 ? t("saving") : ""}
          </p>
        </section>

        {offline ? (
          <Alert tone="warning" title={t("offlineTitle")}>
            <p>{t("offline")}</p>
          </Alert>
        ) : null}
        {notice ? (
          <p className="mds-body-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}

        {q ? (
          <section
            className="mds-card flex flex-col gap-3"
            aria-labelledby="exam-question"
          >
            <p className="mds-caption text-neutral-muted">
              {t("questionPoints", { points: q.points })}
            </p>
            <h1 id="exam-question" className="mds-body-lg" dir="auto">
              {q.text}
            </h1>
            {q.answerMode === "MULTIPLE" ? (
              <fieldset className="mds-choice-group">
                <legend className="mds-label">{t("optionsLegend")}</legend>
                {q.options.map((o) => (
                  <Checkbox
                    key={o.id}
                    label={<span dir="auto">{o.text}</span>}
                    checked={mine?.optionIds.includes(o.id) ?? false}
                    onCheckedChange={(on) =>
                      choose(
                        on
                          ? [...(mine?.optionIds ?? []), o.id]
                          : (mine?.optionIds ?? []).filter((id) => id !== o.id)
                      )
                    }
                  />
                ))}
              </fieldset>
            ) : (
              <RadioGroup
                legend={t("optionsLegend")}
                value={mine?.optionIds[0] ?? null}
                onChange={(value) => choose([value])}
                options={q.options.map((o) => ({
                  value: o.id,
                  label: <span dir="auto">{o.text}</span>,
                }))}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => go(index - 1)}
              >
                {t("previous")}
              </Button>
              <Button variant="ghost" onClick={skip}>
                {t("skip")}
              </Button>
              <Button
                variant="secondary"
                disabled={nextIndex(ids, answers, index) === null}
                onClick={() => {
                  const to = nextIndex(ids, answers, index);
                  go(to, to !== null && to <= index);
                }}
              >
                {t("next")}
              </Button>
              <Button onClick={() => setAsking(true)}>{t("finish")}</Button>
            </div>
          </section>
        ) : null}

        <nav
          className="mds-card flex flex-col gap-2"
          aria-label={t("questionsTitle")}
        >
          <h2 className="mds-h3">{t("questionsTitle")}</h2>
          <ol className="flex flex-wrap gap-2">
            {questions.map((it, i) => {
              const state = stateOf(answers.get(it.id));
              return (
                <li key={it.id}>
                  <Button
                    size="small"
                    variant="outline"
                    data-state={state}
                    style={{
                      ...INDICATOR[state],
                      ...(i === index ? CURRENT : null),
                    }}
                    aria-current={i === index ? "step" : undefined}
                    aria-label={t("listItemLabel", {
                      number: String(i + 1),
                      state: t(
                        state === "answered"
                          ? "stateAnswered"
                          : state === "skipped"
                            ? "stateSkipped"
                            : "stateUnseen"
                      ),
                    })}
                    onClick={() => go(i)}
                  >
                    {i + 1}
                  </Button>
                </li>
              );
            })}
          </ol>
        </nav>

        <AlertDialog
          open={asking}
          onOpenChange={setAsking}
          title={t("finishTitle")}
          confirmLabel={t("confirmFinish")}
          cancelLabel={t("backToExam")}
          onConfirm={() => void finish()}
        >
          <p>
            {t("finishBody", {
              unanswered: String(unanswered),
              skipped: String(skipped),
              timeLeft: clockText(left),
            })}
          </p>
        </AlertDialog>
      </div>
    );
  }

  // "Bilmeniz gerekenler", or why the exam cannot be started now.
  if (brief.window === "BEFORE") {
    return (
      <Alert tone="info" title={t("notOpenTitle")}>
        <p>
          {t("notOpen", {
            opens: at(brief.startsAt),
            latest: at(brief.latestStartAt),
          })}
        </p>
      </Alert>
    );
  }
  if (brief.window === "CLOSED" && !brief.attempt) {
    return (
      <Alert tone="neutral" title={t("closedTitle")}>
        <p>{t("closed", { latest: time(brief.latestStartAt) })}</p>
      </Alert>
    );
  }

  const zerothNeeded = brief.zeroth.options.length > 0;
  const mayStart = !zerothNeeded || zeroth !== null;
  return (
    <div className="flex flex-col gap-section">
      <section
        className="mds-card flex flex-col gap-3"
        aria-labelledby="exam-briefing"
      >
        <p className="mds-caption text-neutral-muted">{brief.courseTitle}</p>
        <h1 id="exam-briefing" className="mds-h2" dir="auto">
          {brief.title}
        </h1>
        <h2 className="mds-h3">{t("briefingTitle")}</h2>
        <ul className="mds-body flex list-disc flex-col gap-1 ps-5">
          <li>{t("factLength", { minutes: String(brief.durationMinutes) })}</li>
          <li>{t("factQuestions", { count: String(brief.questionCount) })}</li>
          <li>{t("factMarks")}</li>
          <li>{t("factSaved")}</li>
          <li>{t("factConnection")}</li>
          <li>{t("factSwitch")}</li>
          <li>{t("factSkip")}</li>
          <li>{t("factColors")}</li>
          <li>{t("factFinish")}</li>
        </ul>
        {brief.instructions ? (
          <>
            <h3 className="mds-label">{t("instructionsTitle")}</h3>
            <p className="mds-body whitespace-pre-line" dir="auto">
              {brief.instructions}
            </p>
          </>
        ) : null}
      </section>

      {zerothNeeded ? (
        <section
          className="mds-card flex flex-col gap-3"
          aria-labelledby="exam-zeroth"
        >
          <h2 id="exam-zeroth" className="mds-h3">
            {t("zerothTitle")}
          </h2>
          <p className="mds-arabic text-center" dir="rtl" lang="ar">
            {t("hadithArabic")}
          </p>
          <p className="mds-body text-center">{t("hadithMeaning")}</p>
          <RadioGroup
            legend={<span dir="auto">{brief.zeroth.question}</span>}
            value={zeroth}
            onChange={(value) => void chooseZeroth(value)}
            options={brief.zeroth.options.map((o) => ({
              value: o.id,
              label: <span dir="auto">{o.text}</span>,
            }))}
            help={t("zerothNote")}
            error={zerothFailed ? t("notSaved") : undefined}
          />
        </section>
      ) : null}

      <div className="flex flex-col items-start gap-2">
        <Button
          size="large"
          disabled={!mayStart}
          loading={starting}
          onClick={() => void start()}
        >
          {t("start")}
        </Button>
        {mayStart ? null : <p className="mds-help">{t("startHint")}</p>}
      </div>
    </div>
  );
}

function ExamEnded({
  brief,
  sessionHref,
  time,
}: {
  brief: ExamBriefingResponse;
  sessionHref: string;
  time: (value: Date | string) => string;
}) {
  const t = useTranslations("tedrisLearn.OnlineExam");
  const a = brief.attempt;
  const when = a?.finishedAt ? time(a.finishedAt) : "";
  const line =
    a?.finishedBy === "TALEBE"
      ? t("finishedByTalebe", { at: when })
      : a?.finishedBy === "TIME"
        ? t("finishedByTime", { at: when })
        : a?.finishedBy === "CLOSED_EARLY"
          ? t("finishedByTeam", { at: when })
          : t("finishedEnded");
  return (
    <section
      className="mds-card flex flex-col gap-3"
      aria-labelledby="exam-ended"
      data-testid="exam-ended"
    >
      <h1 id="exam-ended" className="mds-h2">
        {t("finishedTitle")}
      </h1>
      <p className="mds-body">{line}</p>
      <p className="mds-body-sm text-neutral-muted">{t("resultWhere")}</p>
      <div className="flex flex-wrap gap-2">
        <Button href={`/my-exams`}>{t("toMyExams")}</Button>
        <Button variant="secondary" href={sessionHref}>
          {t("backToSession")}
        </Button>
      </div>
    </section>
  );
}
