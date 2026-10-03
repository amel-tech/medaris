"use client";

import type { CourseQuestionResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { answerLessonQuestion } from "../actions/questions";
import { NoteMarkdown } from "../note-markdown";
import { QUESTION_BODY_MAX, questionWhen } from "../question-model";

/**
 * The course staff's view of the talebe's questions (MDRS-150): the
 * "Sorular" tab of the course page, drawn for whoever holds `question.answer`
 * in the course (the müderris, and a ders nazırı the müderris gave it to).
 * The API lists those still waiting first and refuses everyone else, so the
 * page only passes `initial` to a holder. Answering again replaces the
 * answer.
 */
export function StaffQuestions({
  initial,
  timeZone,
}: {
  initial: CourseQuestionResponse[];
  timeZone: string;
}) {
  const t = useTranslations("tedrisLearn.StaffQuestions");
  const [questions, setQuestions] = useState(initial);

  const put = (question: CourseQuestionResponse) =>
    setQuestions((all) =>
      all.map((q) => (q.id === question.id ? question : q))
    );

  if (questions.length === 0) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {questions.map((question) => (
        <li key={question.id}>
          <QuestionRow
            question={question}
            timeZone={timeZone}
            onAnswered={put}
          />
        </li>
      ))}
    </ul>
  );
}

const QuestionRow = ({
  question,
  timeZone,
  onAnswered,
}: {
  question: CourseQuestionResponse;
  timeZone: string;
  onAnswered: (question: CourseQuestionResponse) => void;
}) => {
  const t = useTranslations("tedrisLearn.StaffQuestions");
  const locale = useLocale();
  const [editing, setEditing] = useState(question.answer === null);
  const [draft, setDraft] = useState(question.answer?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (draft.trim() === "") return setError(t("bodyRequired"));
    setSaving(true);
    setError(null);
    try {
      const result = await answerLessonQuestion(question.id, draft);
      if (result.success) {
        onAnswered(result.data);
        setEditing(false);
      } else {
        const status = "status" in result ? result.status : undefined;
        setError(status === 404 ? t("notAllowed") : t("answerFailed"));
      }
    } catch {
      setError(t("answerFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      className="mds-card flex flex-col gap-3"
      aria-label={t("questionLabel", {
        name: question.author.name ?? t("unknownAuthor"),
      })}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mds-eyebrow" dir="auto">
          {t("sessionLine", {
            week: question.weekNumber,
            title: question.lessonTitle,
          })}
        </p>
        {question.answer ? (
          <Badge variant="success" icon={<Icon name="check" size="sm" />}>
            {t("answered")}
          </Badge>
        ) : (
          <Badge variant="warning">{t("waiting")}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="mds-label">
          <bdi>{question.author.name ?? t("unknownAuthor")}</bdi>
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          <span className="mds-caption mds-num">
            {questionWhen(question.createdAt, locale, timeZone)}
          </span>
        </p>
        <NoteMarkdown source={question.body} />
      </div>

      {question.answer && !editing ? (
        <div className="flex flex-col gap-1 border-bs border-neutral-subtle pbs-3">
          <p className="mds-label">
            {question.answer.answeredBy.name
              ? t("answerBy", { name: question.answer.answeredBy.name })
              : t("answer")}
          </p>
          <NoteMarkdown source={question.answer.body} />
          <p className="mds-caption mds-num">
            {questionWhen(question.answer.answeredAt, locale, timeZone)}
          </p>
          <div>
            <Button
              variant="ghost"
              size="mini"
              iconLeft={<Icon name="edit" size="sm" />}
              onClick={() => {
                setDraft(question.answer?.body ?? "");
                setError(null);
                setEditing(true);
              }}
            >
              {t("change")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            label={t("answerLabel")}
            help={t("bodyHelp", { max: QUESTION_BODY_MAX })}
          >
            <Textarea
              rows={3}
              dir="auto"
              maxLength={QUESTION_BODY_MAX}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="mds-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="small"
              loading={saving}
              loadingLabel={t("answering")}
            >
              {question.answer ? t("save") : t("answerAction")}
            </Button>
            {question.answer ? (
              <Button
                variant="ghost"
                size="small"
                onClick={() => setEditing(false)}
              >
                {t("cancel")}
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </article>
  );
};
