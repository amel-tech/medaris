"use client";

import type { LessonQuestionResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { askLessonQuestion, listMyCourseQuestions } from "../actions/questions";
import { NoteMarkdown } from "../note-markdown";
import {
  QUESTION_BODY_MAX,
  questionWhen,
  type SessionChoice,
} from "../question-model";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready" };

/**
 * The "Sorularım" tab of the course page (MDRS-150): the talebe's own
 * questions to the course staff with the answers they were given, and a form
 * to ask a new one on a session. Only the author's questions ever reach the
 * tab: the API returns no others. A talebe who is no longer enrolled still
 * reads their answers; `canAsk` takes the form away from them.
 */
export function CourseQuestions({
  courseId,
  sessions,
  timeZone,
  canAsk,
}: {
  courseId: string;
  sessions: SessionChoice[];
  timeZone: string;
  canAsk: boolean;
}) {
  const t = useTranslations("tedrisLearn.CourseQuestions");
  const locale = useLocale();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [questions, setQuestions] = useState<LessonQuestionResponse[]>([]);

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const result = await listMyCourseQuestions(courseId);
      if (result.success) {
        setQuestions(result.data);
        setLoad({ state: "ready" });
      } else {
        setLoad({ state: "failed" });
      }
    } catch {
      setLoad({ state: "failed" });
    }
  }, [courseId]);

  useEffect(() => {
    void read();
  }, [read]);

  return (
    <div className="flex flex-col gap-4">
      <p className="mds-caption">{t("private")}</p>

      {canAsk ? (
        <AskForm
          sessions={sessions}
          onAsked={(question) => setQuestions((all) => [question, ...all])}
        />
      ) : null}

      {load.state === "loading" ? (
        <output className="mds-caption">{t("loading")}</output>
      ) : load.state === "failed" ? (
        <div className="flex flex-col gap-2" role="alert">
          <p className="mds-body-sm">{t("loadFailed")}</p>
          <div>
            <Button variant="outline" size="small" onClick={() => void read()}>
              {t("retry")}
            </Button>
          </div>
        </div>
      ) : questions.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {questions.map((question) => (
            <li key={question.id}>
              <article
                className="mds-card flex flex-col gap-3"
                aria-label={t("questionLabel", {
                  session: question.lessonTitle,
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
                    <Badge
                      variant="success"
                      icon={<Icon name="check" size="sm" />}
                    >
                      {t("answered")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("waiting")}</Badge>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <NoteMarkdown source={question.body} />
                  <p className="mds-caption mds-num">
                    {t("askedAt", {
                      when: questionWhen(question.createdAt, locale, timeZone),
                    })}
                  </p>
                </div>
                {question.answer ? (
                  <div className="flex flex-col gap-1 border-bs border-neutral-subtle pbs-3">
                    <p className="mds-label">
                      {question.answer.answeredBy.name
                        ? t("answerBy", {
                            name: question.answer.answeredBy.name,
                          })
                        : t("answer")}
                    </p>
                    <NoteMarkdown source={question.answer.body} />
                    <p className="mds-caption mds-num">
                      {questionWhen(
                        question.answer.answeredAt,
                        locale,
                        timeZone
                      )}
                    </p>
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AskForm = ({
  sessions,
  onAsked,
}: {
  sessions: SessionChoice[];
  onAsked: (question: LessonQuestionResponse) => void;
}) => {
  const t = useTranslations("tedrisLearn.CourseQuestions");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!lessonId) return setError(t("sessionRequired"));
    if (body.trim() === "") return setError(t("bodyRequired"));
    setSaving(true);
    setError(null);
    try {
      const result = await askLessonQuestion(lessonId, body);
      if (result.success) {
        onAsked(result.data);
        setBody("");
      } else {
        const status = "status" in result ? result.status : undefined;
        setError(status === 403 ? t("forbidden") : t("askFailed"));
      }
    } catch {
      setError(t("askFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mds-card flex flex-col gap-3"
      noValidate
      aria-label={t("askTitle")}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="mds-card__title flex items-center gap-2">
        <Icon name="chats" />
        {t("askTitle")}
      </h2>
      <Field label={t("sessionLabel")}>
        <Select
          value={lessonId}
          onChange={setLessonId}
          placeholder={t("sessionPlaceholder")}
          options={sessions.map((s) => ({
            value: s.id,
            label: t("sessionLine", { week: s.weekNumber, title: s.title }),
          }))}
        />
      </Field>
      <Field
        label={t("bodyLabel")}
        help={t("bodyHelp", { max: QUESTION_BODY_MAX })}
      >
        <Textarea
          rows={3}
          dir="auto"
          maxLength={QUESTION_BODY_MAX}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      {error ? (
        <p className="mds-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          type="submit"
          size="small"
          iconLeft={<Icon name="plus" size="sm" />}
          loading={saving}
          loadingLabel={t("asking")}
        >
          {t("ask")}
        </Button>
      </div>
    </form>
  );
};
