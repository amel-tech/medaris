"use client";

import type { LessonQuestionResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { askLessonQuestion, listMyLessonQuestions } from "../actions/questions";
import { QUESTION_BODY_MAX } from "../question-model";
import { QuestionCard } from "./course-questions";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready" };

/**
 * "Soru sor" beside a stream that has ended and beside a recording, on the
 * watch page (MDRS-285): a question asked here is on this celse, so there is
 * no celse to pick, and the list is the talebe's own questions on it with
 * their answers, newest first. While the stream is live the chat takes this
 * place, and questions are asked there. The same API as the course page's
 * "Sorularım" tab (MDRS-150), which keeps every question of the course: one
 * asked here is listed there too, and is edited and deleted the same way.
 */
export function LessonQuestions({
  courseId,
  lessonId,
  timeZone,
}: {
  courseId: string;
  lessonId: string;
  /** The course's zone, for when a question was asked and answered. */
  timeZone: string;
}) {
  const t = useTranslations("tedrisLearn.CourseQuestions");
  const w = useTranslations("tedrisLearn.WatchPage");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [questions, setQuestions] = useState<LessonQuestionResponse[]>([]);

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const result = await listMyLessonQuestions(courseId, lessonId);
      if (sendToSignIn(result)) return;
      if (result.success) {
        setQuestions(result.data);
        setLoad({ state: "ready" });
      } else {
        setLoad({ state: "failed" });
      }
    } catch {
      setLoad({ state: "failed" });
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    void read();
  }, [read]);

  const put = (question: LessonQuestionResponse) =>
    setQuestions((all) =>
      all.map((q) => (q.id === question.id ? question : q))
    );
  const drop = (id: string) =>
    setQuestions((all) => all.filter((q) => q.id !== id));

  return (
    <section
      className="mds-card @container flex flex-col gap-3"
      aria-labelledby={`questions-${lessonId}`}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="mds-h3 flex items-center gap-2"
          id={`questions-${lessonId}`}
        >
          <Icon name="chats" />
          {w("questionsTitle")}
        </h2>
        <p className="mds-caption">{t("private")}</p>
      </div>

      <AskForm
        lessonId={lessonId}
        onAsked={(question) => setQuestions((all) => [question, ...all])}
      />

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
        <p className="mds-caption">{w("questionsEmpty")}</p>
      ) : (
        <ul
          className="m-0 flex list-none flex-col p-0 border-bs border-neutral-subtle"
          aria-label={w("questionsList")}
        >
          {questions.map((question) => (
            <li
              key={question.id}
              className="py-3 border-be border-neutral-subtle last:border-be-0"
            >
              <QuestionCard
                question={question}
                timeZone={timeZone}
                onSaved={put}
                onDeleted={drop}
                inLesson
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const AskForm = ({
  lessonId,
  onAsked,
}: {
  lessonId: string;
  onAsked: (question: LessonQuestionResponse) => void;
}) => {
  const t = useTranslations("tedrisLearn.CourseQuestions");
  const w = useTranslations("tedrisLearn.WatchPage");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (body.trim() === "") return setError(t("bodyRequired"));
    setSaving(true);
    setError(null);
    try {
      const result = await askLessonQuestion(lessonId, body);
      if (sendToSignIn(result)) return;
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
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {/* Its help, that Markdown is welcome, shows once the talebe writes. */}
      <Field
        help={
          body === "" ? undefined : t("bodyHelp", { max: QUESTION_BODY_MAX })
        }
      >
        <Textarea
          aria-label={t("bodyLabel")}
          rows={2}
          dir="auto"
          maxLength={QUESTION_BODY_MAX}
          placeholder={w("questionPlaceholder")}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      {error ? (
        <p className="mds-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="submit"
          size="small"
          loading={saving}
          loadingLabel={t("asking")}
        >
          {t("ask")}
        </Button>
      </div>
    </form>
  );
};
