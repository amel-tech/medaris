"use client";

import type {
  MyQuestionNoteResponse,
  PracticeAttemptResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArabicText } from "~/features/online-exams/components/arabic-text";
import {
  INDICATOR,
  QuestionListToggle,
  QuestionNavigator,
  QuestionSheet,
  TakeKeys,
  TextSizeButtons,
  useQuestionList,
} from "~/features/online-exams/components/question-parts";
import {
  type LocalAnswer,
  nextIndex,
  readTextScale,
  stateOf,
  TEXT_SCALES,
  writeTextScale,
} from "~/features/online-exams/take-model";
import { QuestionNote } from "~/features/question-notes/components/question-note";
import { notesOf, showsNote } from "~/features/question-notes/note-model";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import {
  finishPractice,
  savePracticeChoice,
  startPractice,
  startPracticePool,
} from "../actions";
import {
  blankCount,
  type PoolMode,
  PRACTICE_HREF,
  readSkipped,
  resultHref,
  startIndex,
  writeSkipped,
} from "../practice-model";
import { PracticeTakeSkeleton } from "./practice-take-skeleton";

type Phase = "opening" | "absent" | "failed" | "running";

const failure = (result: unknown): { status?: number; code?: string } =>
  result as { status?: number; code?: string };

/**
 * A talebe solves a çalışma seti (MDRS-248, Faz 3): the page starts an
 * attempt, or the API gives back the one in progress, which then goes on at
 * the question it was left at. No clock, no holder, no tab count, no zeroth
 * question: the questions, A− / A+, the list and "Soruyu atla" are the
 * online exam's own parts (`question-parts.tsx`).
 *
 * Every choice is saved the moment it is made. The saves of one question go
 * one after another, so a slow earlier save never lands after a later one
 * (the API keeps the last write and has no sequence number). A save that
 * fails keeps the choice on screen and says "Cevabın kaydedilemedi, tekrar
 * dene"; its button sends what is still unsent, and "Bitir" sends it first.
 */
export type PracticeSource =
  | { setId: string }
  | { courseId: string; mode: PoolMode; count?: number };

export function PracticeTake(source: PracticeSource) {
  const t = useTranslations("tedris.Practice");
  const tb = useTranslations("tedris.TakeBar");
  const pool = "courseId" in source ? source : null;
  const setId = "setId" in source ? source.setId : null;
  const courseId = pool?.courseId ?? null;
  const mode = pool?.mode ?? null;
  const count = pool?.count;
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("opening");
  const [attempt, setAttempt] = useState<PracticeAttemptResponse | null>(null);
  const [answers, setAnswers] = useState<Map<string, LocalAnswer>>(new Map());
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(0);
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishFailed, setFinishFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [textStep, setTextStep] = useState(0);
  const list = useQuestionList();
  // The talebe's note of each question (soru notları), as the icon shows it.
  const [notes, setNotes] = useState<
    Map<string, MyQuestionNoteResponse | null>
  >(new Map());

  const scaleKey = `practice:${setId ?? `pool-${courseId}`}`;
  useEffect(() => {
    setTextStep(readTextScale(scaleKey, window.sessionStorage));
  }, [scaleKey]);
  const stepText = (by: number) => {
    const next = Math.min(Math.max(textStep + by, 0), TEXT_SCALES.length - 1);
    setTextStep(next);
    writeTextScale(scaleKey, next, window.sessionStorage);
  };

  const seq = useRef(0);
  // The latest save issued for each question: an older one still waiting in
  // its queue is not sent, so a retry never lands after a newer choice.
  const latest = useRef(new Map<string, number>());
  // The screen's choices, for a retry that runs outside a render.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  // The choices the API has not taken yet, by question.
  const unsent = useRef(new Map<string, string[]>());
  // The saves of each question, one after another.
  const queue = useRef(new Map<string, Promise<void>>());
  const started = useRef(false);

  const open = useCallback(async () => {
    setPhase("opening");
    try {
      const result =
        setId !== null
          ? await startPractice(setId)
          : await startPracticePool(courseId ?? "", mode ?? "ALL", count);
      if (sendToSignIn(result)) return;
      if (!result.success) {
        const { status } = failure(result);
        setPhase(
          status === 400 || status === 403 || status === 404
            ? "absent"
            : "failed"
        );
        return;
      }
      const a = result.data;
      if (a.status === "FINISHED") {
        router.replace(resultHref(a.id));
        return;
      }
      setAttempt(a);
      // The questions skipped in this tab before a reload stay skipped.
      const skipped = readSkipped(a.id, window.sessionStorage);
      setAnswers(
        new Map(
          a.questions.map((q) => [
            q.id,
            {
              optionIds: q.chosenOptionIds,
              skipped: q.chosenOptionIds.length === 0 && skipped.has(q.id),
            },
          ])
        )
      );
      setNotes(notesOf(a.questions));
      setIndex(startIndex(a));
      setPhase("running");
    } catch {
      setPhase("failed");
    }
  }, [router, setId, courseId, mode, count]);

  // Once, also under Strict Mode's second effect run: the API would give the
  // same attempt back, but one call is enough.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  }, [open]);

  useEffect(() => {
    if (!attempt) return;
    writeSkipped(
      attempt.id,
      [...answers]
        .filter(([, a]) => stateOf(a) === "skipped")
        .map(([id]) => id),
      window.sessionStorage
    );
  }, [answers, attempt]);

  const send = useCallback(
    (questionId: string, optionIds: string[]): Promise<void> => {
      if (!attempt) return Promise.resolve();
      const attemptId = attempt.id;
      seq.current += 1;
      const mine = seq.current;
      latest.current.set(questionId, mine);
      setSavedFor(null);
      setPending((n) => n + 1);
      const run = async () => {
        try {
          // A newer choice of this question is queued behind: it is the one to send.
          if (latest.current.get(questionId) !== mine) return;
          const result = await savePracticeChoice(
            attemptId,
            questionId,
            optionIds
          );
          if (result.success) {
            unsent.current.delete(questionId);
            if (unsent.current.size === 0) setSaveFailed(false);
            if (mine === seq.current) setSavedFor(questionId);
            return;
          }
          if (sendToSignIn(result)) return;
          if (failure(result).code === "PRACTICE_ATTEMPT_FINISHED") {
            router.replace(resultHref(attemptId));
            return;
          }
          unsent.current.set(questionId, optionIds);
          setSaveFailed(true);
        } catch {
          unsent.current.set(questionId, optionIds);
          setSaveFailed(true);
        } finally {
          setPending((n) => n - 1);
        }
      };
      const next = (queue.current.get(questionId) ?? Promise.resolve()).then(
        run
      );
      queue.current.set(questionId, next);
      return next;
    },
    [attempt, router]
  );

  const resend = () =>
    Promise.all(
      [...unsent.current].map(([questionId, optionIds]) =>
        send(
          questionId,
          answersRef.current.get(questionId)?.optionIds ?? optionIds
        )
      )
    );

  const finish = async () => {
    if (!attempt) return;
    setAsking(false);
    setFinishing(true);
    setFinishFailed(false);
    try {
      await resend();
      await Promise.all(queue.current.values());
      if (unsent.current.size > 0) return;
      const result = await finishPractice(attempt.id);
      if (sendToSignIn(result)) return;
      if (
        result.success ||
        failure(result).code === "PRACTICE_ATTEMPT_FINISHED"
      ) {
        router.push(resultHref(attempt.id));
        return;
      }
      setFinishFailed(true);
    } catch {
      setFinishFailed(true);
    } finally {
      setFinishing(false);
    }
  };

  if (phase === "opening") {
    return <PracticeTakeSkeleton label={t("opening")} />;
  }

  if (phase === "absent" || phase === "failed" || !attempt) {
    return (
      <Alert
        tone={phase === "absent" ? "neutral" : "error"}
        title={t(
          phase !== "absent"
            ? "openFailedTitle"
            : pool
              ? "poolNotFoundTitle"
              : "notFoundTitle"
        )}
      >
        <p>
          {t(
            phase !== "absent"
              ? "openFailed"
              : pool
                ? "poolNotFound"
                : "notFound"
          )}
        </p>
        <p className="mbs-3 flex flex-wrap gap-2">
          {phase === "failed" ? (
            <Button size="small" variant="outline" onClick={() => void open()}>
              {t("retry")}
            </Button>
          ) : null}
          <Button size="small" variant="secondary" href={PRACTICE_HREF}>
            {t("backToList")}
          </Button>
        </p>
      </Alert>
    );
  }

  const questions = attempt.questions;
  const q = questions[index];
  const ids = questions.map((it) => it.id);
  const mine = q ? answers.get(q.id) : undefined;
  const skipped = questions.filter(
    (it) => stateOf(answers.get(it.id)) === "skipped"
  ).length;
  const answered = questions.filter(
    (it) => stateOf(answers.get(it.id)) === "answered"
  ).length;
  const following = nextIndex(ids, answers, index);
  const blanks = blankCount(
    ids,
    new Map([...answers].map(([id, a]) => [id, a.optionIds]))
  );

  const choose = (optionIds: string[]) => {
    // Nothing changes under "Bitir": a later choice would miss the result.
    if (!q || finishing) return;
    setAnswers((all) => new Map(all).set(q.id, { optionIds, skipped: false }));
    setNotice(null);
    void send(q.id, optionIds);
  };
  const go = (to: number | null, follow = false, skippedNow = skipped) => {
    if (to === null) return;
    setIndex(to);
    setNotice(
      follow && skippedNow > 0
        ? t("skippedFollow", { skipped: skippedNow })
        : null
    );
  };
  const skip = () => {
    if (!q || finishing) return;
    // As in the exam: "Soruyu atla" leaves the question blank, and it comes
    // back after the last one. A choice made before is taken back.
    const had = (mine?.optionIds.length ?? 0) > 0;
    const next = new Map(answers).set(q.id, { optionIds: [], skipped: true });
    setAnswers(next);
    if (had) void send(q.id, []);
    const to = nextIndex(ids, next, index);
    go(
      to,
      to !== null && to <= index,
      ids.filter((id) => stateOf(next.get(id)) === "skipped").length
    );
  };

  // The end: the last question, or every one answered. "Bitir" then takes
  // "Sonraki"'s place under the options, as the one button that leads.
  const atEnd =
    following === null ||
    index === questions.length - 1 ||
    answered === questions.length;
  const goOn = () => {
    if (finishing) return;
    if (atEnd) setAsking(true);
    else go(following, following !== null && following <= index);
  };

  const scale = TEXT_SCALES[textStep];

  return (
    <div
      className="take-column flex flex-col gap-section"
      data-take-screen
      style={{ zoom: scale }}
      data-text-scale={scale}
    >
      <TakeKeys
        question={q}
        chosen={mine?.optionIds ?? []}
        onChoose={choose}
        onEnter={goOn}
        off={asking || finishing}
      />
      {/* On a desk (1024px and up) one thin row: the title, the counter, the
          progress, A− / A+, "Sorular" and "Bitir" (app/tedris.css, tek ekran). */}
      <section
        className="mds-card take-bar flex flex-col gap-3"
        aria-label={t("barLabel")}
      >
        <div className="take-bar__row flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <ArabicText
            as="h1"
            className="mds-h3 take-bar__title"
            size="var(--fs-h3)"
            weight="var(--weight-semibold)"
            text={attempt.setId ? attempt.title : t("poolTitle")}
          />
          <div className="take-bar__tools flex flex-wrap items-center gap-3">
            <p className="mds-body-sm mds-num">
              {t("counter", {
                number: String(index + 1),
                count: String(questions.length),
              })}
            </p>
            <TextSizeButtons
              step={textStep}
              onStep={stepText}
              smallerLabel={t("textSmaller")}
              biggerLabel={t("textBigger")}
              groupLabel={tb("textSizeLabel")}
            />
            <QuestionListToggle list={list} label={t("questionsTitle")} />
            {/* Up here, away from "Sonraki": ending is never one slip from going on. */}
            <Button
              size="small"
              variant="secondary"
              disabled={finishing}
              onClick={() => setAsking(true)}
              data-testid="finish-in-bar"
            >
              {t("finish")}
            </Button>
          </div>
        </div>
        <Progress
          className="take-bar__progress"
          value={questions.length ? (answered / questions.length) * 100 : 0}
          label={t("progressLabel")}
          labelHidden
          completeLabel={t("progressComplete")}
        />
        <div className="take-bar__row take-bar__state flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="mds-body-sm text-neutral-muted mds-num">
            {t("progressText", {
              answered: String(answered),
              count: String(questions.length),
            })}
          </p>
          {/* Always in the page, so a screen reader hears each change. */}
          <p
            className="mds-body-sm text-neutral-muted flex items-center gap-1"
            aria-live="polite"
            data-testid="practice-save-state"
          >
            {pending > 0 ? (
              t("saving")
            ) : q && savedFor === q.id ? (
              <>
                <Icon name="check" size="sm" />
                {t("saved")}
              </>
            ) : null}
          </p>
        </div>
      </section>

      {saveFailed ? (
        <Alert tone="error" title={t("saveFailed")}>
          <p>
            <Button
              size="small"
              variant="outline"
              onClick={() => void resend()}
            >
              {t("saveRetry")}
            </Button>
          </p>
        </Alert>
      ) : null}
      {finishFailed ? <Alert tone="error" title={t("finishFailed")} /> : null}
      {notice ? (
        <p className="mds-body-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}

      {q ? (
        // The question above its options; on a desk side by side only when
        // that does not fit the window (QuestionSheet's `fit`). nazar's
        // preview draws the same sheet (MDRS-248, ortak görünüm).
        <QuestionSheet
          testId="practice-question"
          textId="practice-question"
          text={q.text}
          question={q}
          chosen={mine?.optionIds ?? []}
          onChoose={choose}
          legend={t("optionsLegend")}
          multiHint={tb("multiHint")}
          questionPaneLabel={tb("questionPane")}
          optionsPaneLabel={tb("optionsPane")}
          watch={q.id}
          fit
          head={
            // The note icon at the end of this line; its panel opens over the
            // options, which do not move (soru notları).
            <>
              <p className="mds-caption text-neutral-muted">
                {t("questionNumber", { number: String(index + 1) })}
              </p>
              {showsNote(q) ? (
                <QuestionNote
                  key={q.id}
                  questionId={q.id}
                  questionNumber={index + 1}
                  note={notes.get(q.id) ?? null}
                  onChange={(note) =>
                    setNotes((all) => new Map(all).set(q.id, note))
                  }
                  enabled={q.talebeNotes === true}
                />
              ) : null}
            </>
          }
        >
          {/* Right under the options, as wide as they are: back and skip on
              the start side, the one button that leads on the end side. The
              same button says "Bitir" at the end, so the focus stays on it.
              On a phone the row holds to the bottom of the screen, the
              leading button on a row of its own under the thumb. */}
          <div className="take-nav" data-testid="take-nav">
            <div className="take-nav__back">
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
            </div>
            <Button
              className="take-nav__go"
              aria-keyshortcuts="Enter"
              loading={atEnd && finishing}
              onClick={goOn}
            >
              {atEnd ? t("finish") : t("next")}
            </Button>
          </div>
        </QuestionSheet>
      ) : null}

      <QuestionNavigator
        items={questions.map((it) => ({
          id: it.id,
          state: stateOf(answers.get(it.id)),
        }))}
        index={index}
        onGo={(i) => go(i)}
        title={t("questionsTitle")}
        list={list}
        closeLabel={tb("listClose")}
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
        legend={
          <ul
            className="flex flex-wrap gap-x-4 gap-y-1 mds-caption text-neutral-muted"
            aria-label={t("legendLabel")}
          >
            {(
              [
                ["answered", "stateAnswered", answered],
                ["skipped", "stateSkipped", skipped],
                [
                  "unseen",
                  "stateUnseen",
                  questions.length - answered - skipped,
                ],
              ] as const
            ).map(([state, key, n]) => (
              <li key={state} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="inline-block size-3 rounded-sm border"
                  style={INDICATOR[state]}
                />
                {t("legendItem", { state: t(key), count: String(n) })}
              </li>
            ))}
          </ul>
        }
      />

      <AlertDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("finishTitle")}
        confirmLabel={t("confirmFinish")}
        cancelLabel={t("backToSolving")}
        onConfirm={() => void finish()}
      >
        <p>
          {blanks > 0 ? t("finishBlank", { count: blanks }) : t("finishAll")}
        </p>
      </AlertDialog>
    </div>
  );
}
