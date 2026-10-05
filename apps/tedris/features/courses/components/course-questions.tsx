"use client";

import type { LessonQuestionResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Markdown } from "@medaris/ui/mds/markdown";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  askLessonQuestion,
  deleteLessonQuestion,
  listMyCourseQuestions,
  updateLessonQuestion,
} from "../actions/questions";
import {
  appendQuestions,
  canEditQuestion,
  QUESTION_BODY_MAX,
  questionWhen,
  type SessionChoice,
} from "../question-model";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready" };

/**
 * The "Sorularım" tab of the course page (MDRS-150): the talebe's own
 * questions to the course staff with the answers they were given, and a form
 * to ask a new one on a session. Only the author's questions ever reach the
 * tab: the API returns no others. They arrive a page at a time, newest first.
 * A talebe who is no longer enrolled still reads their answers and may delete
 * a question; `canAsk` takes the form away from them. A question is edited
 * only while nobody has answered it, and deleted at any time (its answer goes
 * with it).
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
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [questions, setQuestions] = useState<LessonQuestionResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const result = await listMyCourseQuestions(courseId);
      if (result.success) {
        setQuestions(result.data.items);
        setNextCursor(result.data.nextCursor);
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

  const readMore = async () => {
    if (!nextCursor) return;
    setMore("loading");
    try {
      const result = await listMyCourseQuestions(courseId, nextCursor);
      if (result.success) {
        setQuestions((all) => appendQuestions(all, result.data.items));
        setNextCursor(result.data.nextCursor);
        setMore("idle");
      } else {
        setMore("failed");
      }
    } catch {
      setMore("failed");
    }
  };

  const put = (question: LessonQuestionResponse) =>
    setQuestions((all) =>
      all.map((q) => (q.id === question.id ? question : q))
    );
  const drop = (id: string) =>
    setQuestions((all) => all.filter((q) => q.id !== id));

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
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {questions.map((question) => (
              <li key={question.id}>
                <QuestionCard
                  question={question}
                  timeZone={timeZone}
                  onSaved={put}
                  onDeleted={drop}
                />
              </li>
            ))}
          </ul>
          {nextCursor ? (
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
        </>
      )}
    </div>
  );
}

const QuestionCard = ({
  question,
  timeZone,
  onSaved,
  onDeleted,
}: {
  question: LessonQuestionResponse;
  timeZone: string;
  onSaved: (question: LessonQuestionResponse) => void;
  onDeleted: (id: string) => void;
}) => {
  const t = useTranslations("tedrisLearn.CourseQuestions");
  const locale = useLocale();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Answered since the page was drawn: the API said so, so editing is over.
  const [answeredMeanwhile, setAnsweredMeanwhile] = useState(false);
  const mayEdit = canEditQuestion(question) && !answeredMeanwhile;

  const edit = () => {
    setDraft(question.body);
    setError(null);
    setMode("edit");
  };

  const save = async () => {
    if (draft.trim() === "") return setError(t("bodyRequired"));
    setBusy(true);
    setError(null);
    try {
      const result = await updateLessonQuestion(question.id, draft);
      if (result.success) {
        onSaved(result.data);
        setMode("view");
      } else {
        const status = "status" in result ? result.status : undefined;
        if (status === 404) return onDeleted(question.id);
        if (status === 409) {
          setAnsweredMeanwhile(true);
          setMode("view");
          setError(t("editAnswered"));
        } else {
          setError(status === 403 ? t("forbidden") : t("editFailed"));
        }
      }
    } catch {
      setError(t("editFailed"));
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteLessonQuestion(question.id);
      // Gone already is what the author wanted.
      if (result.success || ("status" in result && result.status === 404)) {
        return onDeleted(question.id);
      }
      setError(t("deleteFailed"));
    } catch {
      setError(t("deleteFailed"));
    }
    setBusy(false);
  };

  return (
    <article
      className="mds-card flex flex-col gap-3"
      aria-label={t("questionLabel", { session: question.lessonTitle })}
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
          <Badge variant="outline">{t("waiting")}</Badge>
        )}
      </div>

      {mode === "edit" ? (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field
            label={t("bodyLabel")}
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
              loading={busy}
              loadingLabel={t("saving")}
            >
              {t("save")}
            </Button>
            <Button
              variant="ghost"
              size="small"
              onClick={() => setMode("view")}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <Markdown source={question.body} />
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
                  ? t("answerBy", { name: question.answer.answeredBy.name })
                  : t("answer")}
              </p>
              <Markdown source={question.answer.body} />
              <p className="mds-caption mds-num">
                {questionWhen(question.answer.answeredAt, locale, timeZone)}
              </p>
            </div>
          ) : null}
          {mode === "confirm" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mds-caption">
                {question.answer ? t("deleteAskAnswered") : t("deleteAsk")}
              </span>
              <Button
                variant="destructive"
                size="mini"
                loading={busy}
                loadingLabel={t("deleting")}
                onClick={() => void remove()}
              >
                {t("delete")}
              </Button>
              <Button
                variant="ghost"
                size="mini"
                onClick={() => setMode("view")}
              >
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {mayEdit ? (
                <Button
                  variant="ghost"
                  size="mini"
                  iconLeft={<Icon name="edit" size="sm" />}
                  onClick={edit}
                  aria-label={t("editLabel", { session: question.lessonTitle })}
                >
                  {t("edit")}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="mini"
                iconLeft={<Icon name="trash" size="sm" />}
                onClick={() => {
                  setError(null);
                  setMode("confirm");
                }}
                aria-label={t("deleteLabel", { session: question.lessonTitle })}
              >
                {t("delete")}
              </Button>
            </div>
          )}
          {error ? (
            <p className="mds-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
};

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
