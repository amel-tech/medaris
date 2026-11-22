"use client";

import type {
  ExamQuestionResponse,
  OnlineExamDraftResponse,
  PublishProblemResponse,
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
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import {
  addExamQuestion,
  createCourseTopic,
  publishOnlineExam,
  removeExamQuestion,
  saveExamQuestion,
} from "../actions";
import {
  lacksOf,
  nextFreeNumber,
  numbersOf,
  OPTION_FIELDS,
  onlineExamErrorKey,
  READS_AGAIN,
  topicsByNumbers,
} from "../online-exams";
import { PublishSection } from "./exam-publish";

type Outcome =
  | { success: true; data: unknown }
  | { success: false; code: string }
  | object;

type Topic = OnlineExamDraftResponse["courseTopics"][number] & {
  pending?: boolean;
};
type Question = ExamQuestionResponse & {
  /** Stable while the question has no id yet. */
  key: string;
  pending?: boolean;
  failed?: boolean;
};
type QuestionBody = {
  text: string;
  options: Array<{ text: string; correct: boolean }>;
  topicIds: string[];
};

let localKeys = 0;
const localKey = () => `local-${++localKeys}`;

/**
 * The course's numbered topics, and the exam's questions with their options,
 * correct marks and topics (typed by number). Optimistic: a topic or a
 * question shows at once and the page goes on; the writes run in order in
 * the background, each naming the version the one before handed back. A
 * write that fails keeps what was typed and offers it again; a version
 * someone else moved (EXAM_STALE) reads the page again.
 */
export function ExamEditor({
  courseId,
  draft,
  publish,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
  /** "Yayınla" under the questions; left out, the editor has none. */
  publish?: {
    timeZone: string;
    onPublished: (next: OnlineExamDraftResponse) => void;
  };
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [topics, setTopics] = useState<Topic[]>(draft.courseTopics);
  const [questions, setQuestions] = useState<Question[]>(() =>
    draft.questions.map((q) => ({ ...q, key: q.id }))
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const version = useRef(draft.version);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Leaving while a write is on its way loses it: the browser asks first.
  useEffect(() => {
    if (inFlight === 0) return;
    const hold = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [inFlight]);

  /** A refusal, worded; false when the write did not go through. */
  const went = (result: Outcome): boolean => {
    if (handleUnauthenticated(result as never)) return false;
    if ("success" in result && result.success === false) {
      notify({
        tone: "error",
        title: t("OnlineExams.failed"),
        description: words(onlineExamErrorKey(result.code)),
      });
      if (READS_AGAIN.has(result.code)) router.refresh();
      return false;
    }
    return true;
  };

  /** A write that threw (the session store out of reach): said, as a refusal is. */
  const threw = () => notify({ tone: "error", title: t("OnlineExams.failed") });

  /** Runs `job` after every write queued before it. */
  const enqueue = (job: () => Promise<void>) => {
    setInFlight((n) => n + 1);
    queue.current = queue.current
      .then(job)
      .catch(() => undefined)
      .finally(() => setInFlight((n) => n - 1));
  };

  // What the queued writes read when they run, not when they were queued:
  // each question's server id once made, the number of its latest save, the
  // questions taken off the page, and each new topic's server id.
  const serverIdOf = useRef(new Map<string, string>());
  const savesOf = useRef(new Map<string, number>());
  const removed = useRef(new Set<string>());
  const topicIdOf = useRef(new Map<string, string>());
  const idOf = (key: string) =>
    serverIdOf.current.get(key) ?? (key.startsWith("local-") ? "" : key);

  const patch = (key: string, change: Partial<Question>) =>
    setQuestions((all) =>
      all.map((q) => (q.key === key ? { ...q, ...change } : q))
    );

  const saveQuestion = (key: string, body: QuestionBody) => {
    const save = (savesOf.current.get(key) ?? 0) + 1;
    savesOf.current.set(key, save);
    // Only the latest save of a question writes what it shows; an older
    // answer only moves the version on.
    const latest = () =>
      savesOf.current.get(key) === save && !removed.current.has(key);
    const failed = () => {
      if (latest()) patch(key, { pending: false, failed: true });
    };
    const lacks = lacksOf(body);
    patch(key, {
      text: body.text,
      options: body.options.map((o, i) => ({ id: `${key}-${i}`, ...o })),
      topicIds: body.topicIds,
      lacks,
      complete: lacks.length === 0,
      pending: true,
      failed: false,
    });
    setEditing(null);
    enqueue(async () => {
      if (removed.current.has(key)) return;
      try {
        let id = idOf(key);
        if (id === "") {
          const added = await addExamQuestion(draft.id, version.current);
          if (!went(added) || !("data" in added)) return failed();
          version.current = added.data.version;
          id = added.data.question.id;
          serverIdOf.current.set(key, id);
          patch(key, { id });
          // Taken off meanwhile: the removal queued after this deletes it.
          if (removed.current.has(key)) return;
        }
        // A topic added on this page is sent by the id the server gave it.
        const topicIds = body.topicIds
          .map((topicId) => topicIdOf.current.get(topicId) ?? topicId)
          .filter((topicId) => !topicId.startsWith("local-"));
        const saved = await saveExamQuestion(draft.id, id, {
          ...body,
          topicIds,
          answerMode: "SINGLE",
          version: version.current,
        });
        if (!went(saved) || !("data" in saved)) return failed();
        version.current = saved.data.version;
        if (!latest()) return;
        patch(key, { ...saved.data.question, pending: false, failed: false });
        // A topic typed by number that the exam had not picked is picked now.
        setTopics((all) =>
          all.map((topic) =>
            topicIds.includes(topic.id) ? { ...topic, picked: true } : topic
          )
        );
      } catch {
        threw();
        failed();
      }
    });
  };

  const removeQuestion = (key: string) => {
    const index = questions.findIndex((q) => q.key === key);
    if (index === -1) return;
    const gone = questions[index];
    removed.current.add(key);
    setQuestions((all) => all.filter((q) => q.key !== key));
    // Never saved: nothing of it is on the server.
    if (idOf(key) === "" && !savesOf.current.has(key)) return;
    const restore = () => {
      removed.current.delete(key);
      setQuestions((all) => {
        const back = [...all];
        back.splice(index, 0, {
          ...gone,
          id: idOf(key),
          pending: false,
          failed: true,
        });
        return back;
      });
    };
    enqueue(async () => {
      // Read when it runs: a save queued before it may have made the question.
      const id = idOf(key);
      if (id === "") return;
      try {
        const result = await removeExamQuestion(draft.id, id, version.current);
        if (!went(result) || !("data" in result)) return restore();
        version.current = result.data.version;
      } catch {
        threw();
        restore();
      }
    });
  };

  const addQuestion = () => {
    const key = localKey();
    setQuestions((all) => [
      ...all,
      {
        key,
        id: "",
        number: all.length + 1,
        text: "",
        options: [],
        answerMode: "SINGLE",
        scoring: null,
        topicIds: [],
        ownPoints: null,
        points: "",
        complete: false,
        lacks: ["text", "option", "correct", "topic"],
      },
    ]);
    setEditing(key);
  };

  const addTopic = (name: string, number: number | undefined) => {
    const key = localKey();
    const shown = number ?? nextFreeNumber(topics.map((topic) => topic.number));
    setTopics((all) =>
      [
        ...all,
        {
          id: key,
          number: shown,
          name,
          picked: false,
          questionCount: 0,
          pending: true,
        },
      ].sort((a, b) => a.number - b.number)
    );
    const drop = () =>
      setTopics((all) => all.filter((topic) => topic.id !== key));
    // In the same queue as the questions, so a question saved after it with
    // its number is sent with the id the server gave it.
    enqueue(async () => {
      try {
        const made = await createCourseTopic(courseId, name, number);
        if (!went(made) || !("data" in made)) return drop();
        const topic = made.data;
        topicIdOf.current.set(key, topic.id);
        setTopics((all) =>
          all
            .map((it) =>
              it.id === key ? { ...it, ...topic, pending: false } : it
            )
            .sort((a, b) => a.number - b.number)
        );
      } catch {
        threw();
        drop();
      }
    });
  };

  const numbered = questions.map((q, i) => ({ ...q, number: i + 1 }));
  const view = { ...draft, courseTopics: topics };

  // What the page knows keeps the exam from being published: the questions
  // as they now stand, and what only the server knows (the points total
  // and the medrese's zeroth question) as it was read.
  const problems: PublishProblemResponse[] = !publish
    ? []
    : [
        ...(numbered.length === 0 ? [{ kind: "NO_QUESTION" as const }] : []),
        ...numbered
          .filter((q) => q.lacks.length > 0)
          .map((q) => ({
            kind: "QUESTION" as const,
            number: q.number,
            lacks: q.lacks,
          })),
        ...draft.problems.filter(
          (p) => p.kind === "POINTS" || p.kind === "NO_ZEROTH"
        ),
      ];
  const [sending, setSending] = useState(false);
  /** Publishing runs after every write queued before it, naming the version they leave. */
  const publishNow = (times: { startsAt?: string; latestStartAt?: string }) => {
    if (!publish) return;
    setSending(true);
    enqueue(async () => {
      try {
        const result = await publishOnlineExam(draft.id, {
          ...times,
          version: version.current,
        });
        if (!went(result) || !("data" in result)) return;
        version.current = result.data.version;
        publish.onPublished(result.data);
      } catch {
        threw();
      } finally {
        setSending(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-section">
      <TopicsSection topics={topics} onAdd={addTopic} />
      <section
        className="flex flex-col gap-3"
        aria-labelledby="questions-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="questions-title" className="mds-h2">
            {t("OnlineExams.questionsTitle", { count: numbered.length })}
          </h2>
          <span className="mds-body-sm text-neutral-muted" aria-live="polite">
            {inFlight > 0 ? t("OnlineExams.saving") : ""}
          </span>
        </div>
        {numbered.length === 0 ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.noQuestions")}
          </p>
        ) : null}
        <ol className="flex flex-col gap-3">
          {numbered.map((q) => (
            <li key={q.key}>
              {editing === q.key ? (
                <QuestionForm
                  draft={view}
                  question={q}
                  onCancel={() =>
                    q.id === "" && !q.pending && q.text === ""
                      ? removeQuestion(q.key)
                      : setEditing(null)
                  }
                  onSave={(body) => saveQuestion(q.key, body)}
                />
              ) : (
                <QuestionRow
                  draft={view}
                  question={q}
                  onEdit={() => setEditing(q.key)}
                  onRetry={() =>
                    saveQuestion(q.key, {
                      text: q.text,
                      options: q.options.map((o) => ({
                        text: o.text,
                        correct: o.correct,
                      })),
                      topicIds: q.topicIds,
                    })
                  }
                  onRemove={() => removeQuestion(q.key)}
                />
              )}
            </li>
          ))}
        </ol>
        <div>
          <Button onClick={addQuestion}>{t("OnlineExams.addQuestion")}</Button>
        </div>
      </section>
      {publish ? (
        <PublishSection
          problems={problems}
          questionCount={numbered.length}
          durationMinutes={draft.durationMinutes}
          timeZone={publish.timeZone}
          holding={editing !== null}
          sending={sending}
          onPublish={publishNow}
        />
      ) : null}
    </div>
  );
}

function TopicsSection({
  topics,
  onAdd,
}: {
  topics: Topic[];
  onAdd: (name: string, number: number | undefined) => void;
}) {
  const t = useTranslations("nazar");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim() === "") return;
    onAdd(name.trim(), number.trim() === "" ? undefined : Number(number));
    setName("");
    setNumber("");
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="topics-title">
      <h2 id="topics-title" className="mds-h2">
        {t("OnlineExams.topicsTitle")}
      </h2>
      <p className="mds-body-sm text-neutral-muted">
        {t("OnlineExams.topicsIntro")}
      </p>
      {topics.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {topics.map((topic) => (
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
        <Button type="submit" variant="secondary" disabled={name.trim() === ""}>
          {t("OnlineExams.addTopic")}
        </Button>
      </form>
    </section>
  );
}

function QuestionRow({
  draft,
  question,
  onEdit,
  onRetry,
  onRemove,
}: {
  draft: OnlineExamDraftResponse;
  question: Question;
  onEdit: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("nazar");
  const [asking, setAsking] = useState(false);
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
        {question.pending ? (
          <span className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.saving")}
          </span>
        ) : null}
        {question.failed ? (
          <Badge variant="error">{t("OnlineExams.notSaved")}</Badge>
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
        {question.failed ? (
          <Button size="small" onClick={onRetry}>
            {t("OnlineExams.retry")}
          </Button>
        ) : null}
        <Button size="small" variant="outline" onClick={onEdit}>
          {t("OnlineExams.edit")}
        </Button>
        {/* Opened by state, as the other nazar dialogs are: a bare `trigger`
            is not wrapped in the kit's AlertDialogTrigger and opened nothing. */}
        <Button size="small" variant="ghost" onClick={() => setAsking(true)}>
          {t("OnlineExams.remove")}
        </Button>
        <AlertDialog
          open={asking}
          onOpenChange={setAsking}
          title={t("OnlineExams.removeTitle", { number: question.number })}
          confirmLabel={t("OnlineExams.remove")}
          cancelLabel={t("OnlineExams.cancel")}
          closeLabel={t("Shell.close")}
          confirmVariant="destructive"
          onConfirm={() => {
            setAsking(false);
            onRemove();
          }}
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
  onCancel,
  onSave,
}: {
  draft: OnlineExamDraftResponse;
  question: ExamQuestionResponse;
  onCancel: () => void;
  onSave: (body: QuestionBody) => void;
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
      text: text.trim(),
      options: options
        .filter((o) => o.text.trim() !== "")
        .map((o) => ({ text: o.text.trim(), correct: o.correct })),
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
        <Button type="submit" disabled={picked.unknown.length > 0}>
          {t("OnlineExams.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("OnlineExams.cancel")}
        </Button>
      </div>
    </form>
  );
}
