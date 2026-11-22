"use client";

import type {
  ExamQuestionResponse,
  OnlineExamDraftResponse,
} from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import {
  addExamQuestion,
  createCourseTopic,
  removeExamQuestion,
  saveExamQuestion,
} from "../actions";
import {
  numbersOf,
  OPTION_FIELDS,
  onlineExamErrorKey,
  topicsByNumbers,
} from "../online-exams";

type Outcome = { success: true } | { success: false; code: string } | object;

/**
 * The course's numbered topics, and the exam's questions with their options,
 * correct marks and topics (typed by number). Every write re-reads the page;
 * a version someone else moved (EXAM_STALE) says so and re-reads.
 */
export function ExamEditor({
  courseId,
  draft,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [refreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  /** Hands a write's outcome to the page: true when it went through. */
  const settle = (result: Outcome): boolean => {
    if (handleUnauthenticated(result as never)) return false;
    if ("success" in result && result.success === false) {
      notify({
        tone: "error",
        title: t("OnlineExams.failed"),
        description: words(onlineExamErrorKey(result.code)),
      });
      if (result.code === "EXAM_STALE") startRefresh(() => router.refresh());
      return false;
    }
    startRefresh(() => router.refresh());
    return true;
  };
  const run = async (write: () => Promise<Outcome>) => {
    setBusy(true);
    const ok = settle(await write());
    setBusy(false);
    return ok;
  };
  const disabled = busy || refreshing;

  return (
    <div className="flex flex-col gap-section">
      <TopicsSection
        courseId={courseId}
        draft={draft}
        disabled={disabled}
        run={run}
      />
      <section
        className="flex flex-col gap-3"
        aria-labelledby="questions-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="questions-title" className="mds-h2">
            {t("OnlineExams.questionsTitle", {
              count: draft.questions.length,
            })}
          </h2>
          <Button
            disabled={disabled}
            onClick={() =>
              run(async () => {
                const result = await addExamQuestion(draft.id, draft.version);
                if ("success" in result && result.success)
                  setEditing(result.data.question.id);
                return result;
              })
            }
          >
            {t("OnlineExams.addQuestion")}
          </Button>
        </div>
        {draft.questions.length === 0 ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.noQuestions")}
          </p>
        ) : null}
        <ol className="flex flex-col gap-3">
          {draft.questions.map((q) => (
            <li key={q.id}>
              {editing === q.id ? (
                <QuestionForm
                  draft={draft}
                  question={q}
                  disabled={disabled}
                  onCancel={() => setEditing(null)}
                  onSave={(body) =>
                    run(async () => {
                      const result = await saveExamQuestion(
                        draft.id,
                        q.id,
                        body
                      );
                      if ("success" in result && result.success)
                        setEditing(null);
                      return result;
                    })
                  }
                />
              ) : (
                <QuestionRow
                  draft={draft}
                  question={q}
                  disabled={disabled}
                  onEdit={() => setEditing(q.id)}
                  onRemove={() =>
                    run(() => removeExamQuestion(draft.id, q.id, draft.version))
                  }
                />
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function TopicsSection({
  courseId,
  draft,
  disabled,
  run,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
  disabled: boolean;
  run: (write: () => Promise<Outcome>) => Promise<boolean>;
}) {
  const t = useTranslations("nazar");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim() === "") return;
    const n = number.trim() === "" ? undefined : Number(number);
    const ok = await run(() => createCourseTopic(courseId, name.trim(), n));
    if (ok) {
      setName("");
      setNumber("");
    }
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="topics-title">
      <h2 id="topics-title" className="mds-h2">
        {t("OnlineExams.topicsTitle")}
      </h2>
      <p className="mds-body-sm text-neutral-muted">
        {t("OnlineExams.topicsIntro")}
      </p>
      {draft.courseTopics.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {draft.courseTopics.map((topic) => (
            <li key={topic.id}>
              <Badge variant={topic.picked ? "brand" : "outline"}>
                {t("OnlineExams.topicChip", {
                  number: topic.number,
                  name: topic.name,
                })}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={submit}
        noValidate
      >
        <Field label={t("OnlineExams.topicNumberLabel")}>
          <Input
            inputMode="numeric"
            size="regular"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
            placeholder={t("OnlineExams.topicNumberPlaceholder")}
            className="w-24"
          />
        </Field>
        <Field label={t("OnlineExams.topicNameLabel")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || name.trim() === ""}
        >
          {t("OnlineExams.addTopic")}
        </Button>
      </form>
    </section>
  );
}

function QuestionRow({
  draft,
  question,
  disabled,
  onEdit,
  onRemove,
}: {
  draft: OnlineExamDraftResponse;
  question: ExamQuestionResponse;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("nazar");
  const topics = numbersOf(question.topicIds, draft.courseTopics);
  return (
    <article className="mds-card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong>
          {t("OnlineExams.questionNumber", { number: question.number })}
        </strong>
        <Badge variant={question.complete ? "success" : "warning"}>
          {question.complete
            ? t("OnlineExams.complete")
            : t("OnlineExams.incomplete")}
        </Badge>
        {topics ? (
          <span className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.topicsOfQuestion", { numbers: topics })}
          </span>
        ) : null}
      </div>
      <p className="mds-body" dir="auto">
        {question.text || t("OnlineExams.noText")}
      </p>
      {question.options.length > 0 ? (
        <ol className="mds-body-sm flex flex-col gap-1" type="A">
          {question.options.map((o) => (
            <li key={o.id} dir="auto">
              {o.text}
              {o.correct ? ` · ${t("OnlineExams.correct")}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="small"
          variant="outline"
          disabled={disabled}
          onClick={onEdit}
        >
          {t("OnlineExams.edit")}
        </Button>
        <AlertDialog
          title={t("OnlineExams.removeTitle", { number: question.number })}
          confirmLabel={t("OnlineExams.remove")}
          confirmVariant="destructive"
          onConfirm={onRemove}
          trigger={
            <Button size="small" variant="ghost" disabled={disabled}>
              {t("OnlineExams.remove")}
            </Button>
          }
        >
          {t("OnlineExams.removeBody")}
        </AlertDialog>
      </div>
    </article>
  );
}

function QuestionForm({
  draft,
  question,
  disabled,
  onCancel,
  onSave,
}: {
  draft: OnlineExamDraftResponse;
  question: ExamQuestionResponse;
  disabled: boolean;
  onCancel: () => void;
  onSave: (body: {
    version: number;
    text: string;
    options: Array<{ text: string; correct: boolean }>;
    answerMode: "SINGLE";
    topicIds: string[];
  }) => void;
}) {
  const t = useTranslations("nazar");
  const [text, setText] = useState(question.text);
  const [options, setOptions] = useState(() => {
    const filled = question.options.map((o) => ({
      text: o.text,
      correct: o.correct,
    }));
    while (filled.length < OPTION_FIELDS)
      filled.push({ text: "", correct: false });
    return filled;
  });
  const [numbers, setNumbers] = useState(
    numbersOf(question.topicIds, draft.courseTopics)
  );
  const picked = topicsByNumbers(numbers, draft.courseTopics);
  const named = draft.courseTopics.filter((topic) =>
    picked.ids.includes(topic.id)
  );
  const setOption = (i: number, change: Partial<(typeof options)[number]>) =>
    setOptions((all) => all.map((o, j) => (j === i ? { ...o, ...change } : o)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (picked.unknown.length > 0) return;
    onSave({
      version: draft.version,
      text: text.trim(),
      options: options
        .filter((o) => o.text.trim() !== "")
        .map((o) => ({ text: o.text.trim(), correct: o.correct })),
      // One choice for now; check boxes and their scoring come with points.
      answerMode: "SINGLE",
      topicIds: picked.ids,
    });
  };

  return (
    <form
      className="mds-card flex flex-col gap-3 p-4"
      onSubmit={submit}
      noValidate
      aria-label={t("OnlineExams.questionNumber", { number: question.number })}
    >
      <Field label={t("OnlineExams.questionTextLabel")}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          dir="auto"
          maxLength={4000}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mds-label">{t("OnlineExams.optionsLabel")}</legend>
        {options.map((o, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={t("OnlineExams.optionLabel", { n: i + 1 })}
              value={o.text}
              onChange={(e) => setOption(i, { text: e.target.value })}
              dir="auto"
              maxLength={1000}
              className="min-inline-0 flex-1"
            />
            <Checkbox
              label={t("OnlineExams.correct")}
              checked={o.correct}
              onCheckedChange={(checked) =>
                setOption(i, { correct: checked === true })
              }
            />
          </div>
        ))}
        <div>
          <Button
            size="small"
            variant="ghost"
            onClick={() =>
              setOptions((all) => [...all, { text: "", correct: false }])
            }
          >
            {t("OnlineExams.addOption")}
          </Button>
        </div>
      </fieldset>
      <Field
        label={t("OnlineExams.topicNumbersLabel")}
        help={
          named.length > 0
            ? named.map((topic) => `${topic.number}. ${topic.name}`).join(" · ")
            : t("OnlineExams.topicNumbersHelp")
        }
        error={
          picked.unknown.length > 0
            ? t("OnlineExams.topicNumbersUnknown", {
                numbers: picked.unknown.join(", "),
              })
            : undefined
        }
      >
        <Input
          value={numbers}
          onChange={(e) => setNumbers(e.target.value)}
          placeholder="3, 7"
          inputMode="numeric"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={disabled || picked.unknown.length > 0}>
          {t("OnlineExams.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={disabled}>
          {t("OnlineExams.cancel")}
        </Button>
      </div>
    </form>
  );
}
