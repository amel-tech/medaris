"use client";

import type { CourseQuestionResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Markdown } from "@medaris/ui/mds/markdown";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { answerQuestion, loadQuestions } from "../actions";
import {
  ANSWER_BODY_MAX,
  answerErrorKey,
  appendQuestions,
  questionWhen,
} from "../questions";

/**
 * The questions of "Sorular", a page at a time. The server read the first
 * page; "Daha fazla göster" asks for the next with the cursor the last one
 * came with. Answering puts the API's question back in its place: it stays
 * where it was until the page is read again.
 */
export function QuestionsList({
  courseId,
  initial,
  initialCursor,
  timeZone,
}: {
  courseId: string;
  initial: CourseQuestionResponse[];
  initialCursor: string | null;
  timeZone: string;
}) {
  const t = useTranslations("nazar.Questions");
  const [questions, setQuestions] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  const readMore = async () => {
    if (!cursor) return;
    setMore("loading");
    try {
      const result = await loadQuestions(courseId, cursor);
      if (result.success) {
        setQuestions((all) => appendQuestions(all, result.data.items));
        setCursor(result.data.nextCursor);
        setMore("idle");
      } else {
        setMore("failed");
      }
    } catch {
      setMore("failed");
    }
  };

  const put = (question: CourseQuestionResponse) =>
    setQuestions((all) =>
      all.map((candidate) =>
        candidate.id === question.id ? question : candidate
      )
    );

  if (questions.length === 0) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="questions">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {questions.map((question) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              timeZone={timeZone}
              onAnswered={put}
            />
          </li>
        ))}
      </ul>
      {cursor ? (
        <div className="flex flex-col items-start gap-2">
          {more === "failed" ? (
            <p className="mds-error" role="alert">
              {t("loadMoreFailed")}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="small"
            loading={more === "loading"}
            loadingLabel={t("loadingMore")}
            onClick={() => void readMore()}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const QuestionCard = ({
  question,
  timeZone,
  onAnswered,
}: {
  question: CourseQuestionResponse;
  timeZone: string;
  onAnswered: (question: CourseQuestionResponse) => void;
}) => {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const [editing, setEditing] = useState(question.answer === null);
  const [draft, setDraft] = useState(question.answer?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const author = question.author.name ?? t("Questions.unknownAuthor");

  const submit = async () => {
    if (draft.trim() === "") return setError(t("Questions.bodyRequired"));
    setSaving(true);
    setError(null);
    try {
      const result = await answerQuestion(question.id, draft);
      if (result.success) {
        onAnswered(result.data);
        setEditing(false);
      } else {
        setError(words(answerErrorKey(result.code)));
      }
    } catch {
      setError(t("Questions.errors.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article
      className="mds-card flex flex-col gap-3"
      aria-label={t("Questions.questionLabel", { name: author })}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mds-eyebrow" dir="auto">
          {t("Questions.sessionLine", {
            week: question.weekNumber,
            title: question.lessonTitle,
          })}
        </p>
        {question.answer ? (
          <Badge variant="success" icon={<Icon name="check" size="sm" />}>
            {t("Questions.answered")}
          </Badge>
        ) : (
          <Badge variant="warning">{t("Questions.waiting")}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="mds-label">
          <bdi>{author}</bdi>
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          <span className="mds-caption mds-num">
            {questionWhen(question.createdAt, locale, timeZone)}
          </span>
        </p>
        <Markdown source={question.body} />
      </div>

      {question.answer && !editing ? (
        <div className="flex flex-col gap-1 border-bs border-neutral-subtle pbs-3">
          <p className="mds-label">
            {question.answer.answeredBy.name
              ? t("Questions.answerBy", {
                  name: question.answer.answeredBy.name,
                })
              : t("Questions.answer")}
          </p>
          <Markdown source={question.answer.body} />
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
              {t("Questions.change")}
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
            label={t("Questions.answerLabel")}
            help={t("Questions.bodyHelp", { max: ANSWER_BODY_MAX })}
          >
            <Textarea
              rows={3}
              dir="auto"
              maxLength={ANSWER_BODY_MAX}
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
              loadingLabel={t("Questions.answering")}
            >
              {question.answer
                ? t("Questions.save")
                : t("Questions.answerAction")}
            </Button>
            {question.answer ? (
              <Button
                variant="ghost"
                size="small"
                onClick={() => {
                  setError(null);
                  setEditing(false);
                }}
              >
                {t("Questions.cancel")}
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </article>
  );
};
