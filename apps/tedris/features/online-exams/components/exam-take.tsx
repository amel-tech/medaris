"use client";

import type {
  ExamAttemptResponse,
  ExamBriefingResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useToaster } from "@medaris/ui/mds/toast";
import { unstable_isUnrecognizedActionError as isStaleAction } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
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
  pointsText,
  readTextScale,
  readUnsent,
  stateOf,
  TEXT_SCALES,
  TICK_MS,
  takeErrorKey,
  writeTextScale,
  writeUnsent,
} from "../take-model";
import { ArabicText } from "./arabic-text";
import {
  QuestionNavigator,
  QuestionOptions,
  TextSizeButtons,
} from "./question-parts";

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
/** How long the page must be away before coming back counts as a switch. */
export const SWITCH_MIN_MS = 2000;

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
  const tb = useTranslations("tedris.TakeBar");
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
  // The page belongs to the previous version of Medaris: only a reload saves.
  const [stale, setStale] = useState(false);
  const staleNotice = () =>
    notify({
      id: "exam-stale-deploy",
      tone: "warning",
      title: t("staleTitle"),
      description: t("stale"),
      action: { label: t("reload"), onClick: () => window.location.reload() },
    });
  const [pending, setPending] = useState(0);
  /** The question whose latest answer the server holds: it says "Cevabın kaydedildi." */
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // A− / A+ on the questions' text, kept for this exam in this tab (a reload keeps it).
  const [textStep, setTextStep] = useState(0);
  // The page's width without its scrollbar: the running exam grows with A+
  // and takes all of it at the largest step.
  const [pageWidth, setPageWidth] = useState(0);
  useEffect(() => {
    const measure = () => setPageWidth(document.documentElement.clientWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    setTextStep(readTextScale(lessonId, window.sessionStorage));
  }, [lessonId]);
  const stepText = (by: number) => {
    const next = Math.min(Math.max(textStep + by, 0), TEXT_SCALES.length - 1);
    setTextStep(next);
    writeTextScale(lessonId, next, window.sessionStorage);
  };

  const holder = useRef("");
  const seq = useRef(0);
  // Choices the connection did not carry, sent again after the resume.
  const unsent = useRef(new Map<string, LocalAnswer>());
  // When the page lost the talebe: hidden, or its window without focus.
  const awaySince = useRef<number | null>(null);
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
  // The latest `refused`, for the effects that must outlive a render: the
  // countdown renders every second, and an interval restarted with it never
  // reached its 10 seconds (EXM-TAKE-15).
  const refusedRef = useRef(refused);
  refusedRef.current = refused;

  const send = useCallback(
    async (questionId: string, answer: LocalAnswer) => {
      seq.current += 1;
      const mine = seq.current;
      setSavedFor(null);
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
          writeUnsent(lessonId, unsent.current, window.sessionStorage);
          if (result.data.written) setLeft(result.data.secondsLeft);
          if (mine === seq.current) setSavedFor(questionId);
          return;
        }
        if (lostConnection(result)) {
          unsent.current.set(questionId, answer);
          writeUnsent(lessonId, unsent.current, window.sessionStorage);
        }
        refused(result);
      } catch (error) {
        unsent.current.set(questionId, answer);
        writeUnsent(lessonId, unsent.current, window.sessionStorage);
        if (isStaleAction(error)) setStale(true);
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
        unsent.current.clear();
        writeUnsent(lessonId, unsent.current, window.sessionStorage);
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
    [lessonId, reread, send, t]
  );

  const resume = useCallback(async () => {
    try {
      const result = await resumeExamAttempt(lessonId, holderId());
      if (result.success) enter(result.data, true);
      else refused(result);
    } catch (error) {
      if (isStaleAction(error)) setStale(true);
      setOffline(true);
    }
  }, [enter, lessonId, refused]);

  // An attempt in progress goes on here when the page opens.
  // Choices kept from before a reload are sent after the resume.
  useEffect(() => {
    for (const [id, answer] of readUnsent(lessonId, window.sessionStorage)) {
      unsent.current.set(id, answer);
    }
    if (initial.attempt?.status === "IN_PROGRESS") void resume();
  }, []);

  // The countdown between the server's counts, and the count itself. Both
  // run for as long as the exam does: nothing that changes with a render
  // restarts them.
  useEffect(() => {
    if (phase !== "running" || offline) return;
    const second = window.setInterval(
      () => setLeft((s) => Math.max(0, s - 1)),
      1000
    );
    const tick = window.setInterval(async () => {
      try {
        const result = await tickExamClock(lessonId, holderId());
        if (!result.success) return refusedRef.current(result);
        if (result.data.status === "FINISHED") {
          await reread();
          setPhase("ended");
        } else {
          setLeft(result.data.secondsLeft);
        }
      } catch (error) {
        if (isStaleAction(error)) setStale(true);
        setOffline(true);
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(second);
      window.clearInterval(tick);
    };
  }, [phase, offline, lessonId, reread]);

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
      } catch (error) {
        if (isStaleAction(error)) setStale(true);
        setOffline(true);
      }
    })();
  }, [atZero]);

  // Coming back from another tab or window is counted; nothing is erased.
  // A tab switch hides the page; another window or application takes the
  // focus without hiding it (side by side, a second screen), so both count.
  // One away period is one switch, counted on the way back, and only when it
  // lasted SWITCH_MIN_MS: a click on the address bar is not a switch.
  useEffect(() => {
    const away = () => {
      if (phaseRef.current !== "running") return;
      if (awaySince.current === null) awaySince.current = Date.now();
    };
    const back = async () => {
      if (document.visibilityState === "hidden" || !document.hasFocus()) {
        return;
      }
      const since = awaySince.current;
      if (since === null) return;
      awaySince.current = null;
      if (phaseRef.current !== "running") return;
      if (Date.now() - since < SWITCH_MIN_MS) return;
      try {
        const result = await recordTabSwitch(lessonId, holderId());
        if (result.success) {
          notify({ tone: "info", title: t("switchCounted") });
        } else {
          refusedRef.current(result);
        }
      } catch (error) {
        if (isStaleAction(error)) setStale(true);
        setOffline(true);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away();
      else void back();
    };
    const onFocus = () => void back();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", away);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", onFocus);
    };
  }, [lessonId, notify, t]);

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
    } catch (error) {
      setZeroth(before);
      setZerothFailed(true);
      if (isStaleAction(error)) staleNotice();
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
    } catch (error) {
      if (isStaleAction(error)) staleNotice();
      else notify({ tone: "error", title: t("startFailed") });
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
    } catch (error) {
      if (isStaleAction(error)) setStale(true);
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
      // "Soruyu atla" leaves the question blank: a choice made before is
      // taken back, and the question comes back after the last one.
      const answer = { optionIds: [], skipped: true };
      const next = new Map(answers).set(q.id, answer);
      setAnswers(next);
      void send(q.id, answer);
      const to = nextIndex(ids, next, index);
      go(to, to !== null && to <= index);
    };

    // A− / A+ zoom the whole exam: the bar, the question, its buttons and the
    // list. The area widens with each step past the page's column, and the
    // largest step spans the whole width of the screen.
    const scale = TEXT_SCALES[textStep];
    const widest = textStep === TEXT_SCALES.length - 1;

    return (
      <div
        className="px-gutter"
        data-exam-area
        style={
          pageWidth > 0
            ? {
                inlineSize: pageWidth,
                marginInlineStart: `calc(50% - ${pageWidth / 2}px)`,
              }
            : undefined
        }
      >
        <div
          style={{
            maxInlineSize: widest
              ? "none"
              : `calc((var(--layout-content-max) - 2 * var(--spacing-gutter)) * ${scale})`,
            marginInline: "auto",
          }}
        >
          <div
            className="flex flex-col gap-section"
            style={{ zoom: scale }}
            data-text-scale={scale}
          >
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
                {pending > 0
                  ? t("saving")
                  : q && savedFor === q.id
                    ? t("saved")
                    : ""}
              </p>
              {/* Once, for the whole exam: the step zooms every question. */}
              <TextSizeButtons
                step={textStep}
                onStep={stepText}
                smallerLabel={t("textSmaller")}
                biggerLabel={t("textBigger")}
                groupLabel={tb("textSizeLabel")}
              />
            </section>

            {offline && stale ? (
              <Alert tone="warning" title={t("staleTitle")}>
                <p>{t("stale")}</p>
                <p>
                  <Button onClick={() => window.location.reload()}>
                    {t("reload")}
                  </Button>
                </p>
              </Alert>
            ) : offline ? (
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
                  {t("questionPoints", {
                    points: pointsText(q.points, locale),
                  })}
                </p>
                <ArabicText
                  as="h1"
                  id="exam-question"
                  className="mds-body"
                  size="var(--fs-body)"
                  text={q.text}
                />
                <QuestionOptions
                  question={q}
                  chosen={mine?.optionIds ?? []}
                  onChoose={choose}
                  legend={t("optionsLegend")}
                />
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

            <QuestionNavigator
              items={questions.map((it) => ({
                id: it.id,
                state: stateOf(answers.get(it.id)),
              }))}
              index={index}
              onGo={(i) => go(i)}
              title={t("questionsTitle")}
              itemLabel={(number, state) =>
                t("listItemLabel", {
                  number: String(number),
                  state: t(
                    state === "answered"
                      ? "stateAnswered"
                      : state === "skipped"
                        ? "stateSkipped"
                        : "stateUnseen"
                  ),
                })
              }
            />

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
        </div>
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
        <ArabicText
          as="h1"
          id="exam-briefing"
          className="mds-h2"
          size="var(--fs-h2)"
          text={brief.title}
        />
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
          <li>
            {tb("textSizeFact")}{" "}
            {/* What the two buttons look like; the sentence says what they do. */}
            <span
              className="inline-flex gap-1 align-middle"
              aria-hidden="true"
              data-testid="text-size-sample"
            >
              <span className="mds-btn mds-btn--small mds-btn--outline">
                A−
              </span>
              <span className="mds-btn mds-btn--small mds-btn--outline">
                A+
              </span>
            </span>
          </li>
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
            legend={<ArabicText text={brief.zeroth.question} />}
            value={zeroth}
            onChange={(value) => void chooseZeroth(value)}
            options={brief.zeroth.options.map((o) => ({
              value: o.id,
              label: <ArabicText text={o.text} />,
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
