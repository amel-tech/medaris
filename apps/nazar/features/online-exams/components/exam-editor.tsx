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
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import {
  addExamQuestion,
  createCourseTopic,
  type ExamSettings,
  publishOnlineExam,
  removeCourseTopic,
  removeExamQuestion,
  saveExamQuestion,
  saveExamSettings,
  setExamQuestionPoints,
} from "../actions";
import { textProps } from "../arabic";
import {
  type AnswerModeValue,
  lacksOf,
  minutesFromText,
  modeFits,
  nextFreeNumber,
  numbersOf,
  OPTION_FIELDS,
  onlineExamErrorKey,
  ownHundredthsOf,
  pointsFromText,
  pointsText,
  READS_AGAIN,
  type ScoringValue,
  sharesOf,
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
  /** Own points typed and not yet taken (hundredths, null = the share), kept for the form and "Yeniden dene". */
  wantedPoints?: number | null;
};
type QuestionBody = {
  text: string;
  options: Array<{ text: string; correct: boolean }>;
  topicIds: string[];
  answerMode: AnswerModeValue;
  scoring: ScoringValue | null;
  /** Own points in hundredths; null shares what the others leave. */
  points: number | null;
};

/** A question's own points as typed: on their way, refused, or the API's. */
const typedOwnOf = (q: Question): number | null =>
  q.wantedPoints !== undefined ? q.wantedPoints : ownHundredthsOf(q.ownPoints);

/** The own points the shares are drawn from: a refused value never counts. */
const ownOf = (q: Question): number | null =>
  q.failed ? ownHundredthsOf(q.ownPoints) : typedOwnOf(q);

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
  const format = useFormatter();
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [topics, setTopics] = useState<Topic[]>(draft.courseTopics);
  const [questions, setQuestions] = useState<Question[]>(() =>
    draft.questions.map((q) => ({ ...q, key: q.id }))
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExamSettings>({
    title: draft.title,
    durationMinutes: draft.durationMinutes,
    instructions: draft.instructions ?? null,
  });
  const [settingsState, setSettingsState] = useState<
    "saved" | "pending" | "failed"
  >("saved");
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
  const topicsRemoved = useRef(new Set<string>());
  const settingsSaves = useRef(0);
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
      answerMode: body.answerMode,
      scoring: body.scoring,
      wantedPoints: body.points,
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
          text: body.text,
          options: body.options,
          topicIds,
          answerMode: body.answerMode,
          scoring: body.scoring,
          version: version.current,
        });
        if (!went(saved) || !("data" in saved)) return failed();
        version.current = saved.data.version;
        // What the server now holds, whichever save this is: the topics it
        // picked for the exam, and the question's own points.
        setTopics((all) =>
          all.map((topic) =>
            topicIds.includes(topic.id) ? { ...topic, picked: true } : topic
          )
        );
        patch(key, { ownPoints: saved.data.question.ownPoints });
        if (!latest()) return;
        // Its own points are a second write, after the save, naming the
        // version the save gave; the page goes on showing what was typed.
        const pointsChange =
          body.points !== ownHundredthsOf(saved.data.question.ownPoints);
        patch(key, {
          ...saved.data.question,
          ...(pointsChange
            ? { wantedPoints: body.points }
            : { wantedPoints: undefined, pending: false, failed: false }),
        });
        if (pointsChange) {
          const set = await setExamQuestionPoints(
            draft.id,
            id,
            version.current,
            body.points === null ? null : pointsText(body.points)
          );
          if (handleUnauthenticated(set as never)) return failed();
          if (!("data" in set)) {
            if ("code" in set && set.code === "POINTS_OVER_TOTAL")
              notify({
                tone: "error",
                title: t("OnlineExams.failed"),
                description: t("OnlineExams.pointsRefused", {
                  left: format.number(Number(set.pointsLeft ?? 0), {
                    maximumFractionDigits: 2,
                  }),
                }),
              });
            else went(set);
            return failed();
          }
          version.current = set.data.version;
          // The server's own points, from every answer: a later save that
          // fails falls back on them.
          const mine = set.data.questions.find((q) => q.questionId === id);
          patch(key, { ownPoints: mine?.own ? mine.points : null });
          if (!latest()) return;
          patch(key, {
            wantedPoints: undefined,
            pending: false,
            failed: false,
          });
        }
      } catch {
        threw();
        failed();
      }
    });
  };

  // The settings are one more write in the same queue: it names the version
  // the write before it gave, and only the latest save draws its answer. A
  // failure keeps what was typed on the page and offers it again.
  const saveSettings = (next: ExamSettings) => {
    const save = ++settingsSaves.current;
    const latest = () => settingsSaves.current === save;
    const failed = () => {
      if (latest()) setSettingsState("failed");
    };
    setSettings(next);
    setSettingsState("pending");
    enqueue(async () => {
      try {
        const saved = await saveExamSettings(draft.id, {
          ...next,
          version: version.current,
        });
        if (!went(saved) || !("data" in saved)) return failed();
        version.current = saved.data.version;
        if (latest()) setSettingsState("saved");
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
      // Taken off before it was sent: nothing goes, as with an unsaved question.
      if (topicsRemoved.current.has(key)) return;
      try {
        const made = await createCourseTopic(courseId, name, number);
        if (!went(made) || !("data" in made)) return drop();
        const topic = made.data;
        topicIdOf.current.set(key, topic.id);
        // Taken off while it was being made: the removal queued after this
        // deletes it by this id.
        if (topicsRemoved.current.has(key)) return;
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

  const removeTopic = (key: string) => {
    // The confirmation may hold the local id of a topic whose create has
    // answered since: the list shows it by the id the server gave.
    const shownId = topicIdOf.current.get(key) ?? key;
    const gone = topics.find((topic) => topic.id === shownId);
    if (!gone) return;
    topicsRemoved.current.add(key);
    setTopics((all) => all.filter((topic) => topic.id !== shownId));
    const restore = () => {
      topicsRemoved.current.delete(key);
      setTopics((all) =>
        [...all, { ...gone, id: topicIdOf.current.get(key) ?? gone.id }].sort(
          (a, b) => a.number - b.number
        )
      );
    };
    enqueue(async () => {
      // Read when it runs: a create queued before it may have made it.
      const id =
        topicIdOf.current.get(key) ?? (key.startsWith("local-") ? "" : key);
      if (id === "") return;
      try {
        const result = await removeCourseTopic(courseId, id);
        if (handleUnauthenticated(result as never)) return restore();
        if ("success" in result && result.success) {
          // The exams that had picked it moved on a version; the answer
          // names this one's when it was among them.
          const mine = result.data.exams.find((exam) => exam.id === draft.id);
          if (mine) version.current = mine.version;
          return;
        }
        if ("code" in result && result.code === "TOPIC_IN_USE")
          notify({
            tone: "error",
            title: t("OnlineExams.failed"),
            description: t("OnlineExams.topicInUse", {
              questions: (result.questions ?? [])
                .map((q) =>
                  t("OnlineExams.topicInUseItem", {
                    exam: q.examTitle,
                    number: q.number,
                  })
                )
                .join("; "),
            }),
          });
        else went(result);
        restore();
      } catch {
        threw();
        restore();
      }
    });
  };

  // Every question's points, drawn from the own points with the API's rule:
  // each answer (a save, a points write, a removal) moves the shares at once.
  // A question that is only a form on the page is not on the server yet.
  const shares = sharesOf(
    questions
      .filter((q) => q.id !== "" || q.pending)
      .map((q) => ({ key: q.key, own: ownOf(q) }))
  );
  const numbered = questions.map((q, i) => ({
    ...q,
    number: i + 1,
    share: shares.get(q.key),
  }));
  const view = { ...draft, courseTopics: topics };

  // What the page knows keeps the exam from being published: its length and
  // the questions as they now stand, and what only the server knows (the
  // points total and the zeroth question) as it was read.
  const problems: PublishProblemResponse[] = !publish
    ? []
    : [
        ...(settings.durationMinutes === null
          ? [{ kind: "NO_DURATION" as const }]
          : []),
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
      <SettingsSection
        settings={settings}
        state={settingsState}
        onSave={saveSettings}
        onRetry={() => saveSettings(settings)}
      />
      <TopicsSection topics={topics} onAdd={addTopic} onRemove={removeTopic} />
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
                      answerMode: q.answerMode,
                      scoring: q.scoring,
                      points: typedOwnOf(q),
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
          durationMinutes={settings.durationMinutes}
          timeZone={publish.timeZone}
          holding={editing !== null}
          sending={sending}
          onPublish={publishNow}
        />
      ) : null}
    </div>
  );
}

/**
 * "Ayarlar": the exam's title, its length and the team's instructions, saved
 * together. The fields keep what was typed whatever the server answers.
 */
function SettingsSection({
  settings,
  state,
  onSave,
  onRetry,
}: {
  settings: ExamSettings;
  state: "saved" | "pending" | "failed";
  onSave: (settings: ExamSettings) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("nazar");
  const [title, setTitle] = useState(settings.title);
  // No default length: blank until the team types it, and blank is sent as
  // none (the owner, 22 Nov 2026: "sınav süresinin varsayılanı olmasın").
  const [minutes, setMinutes] = useState(
    settings.durationMinutes === null ? "" : String(settings.durationMinutes)
  );
  const [instructions, setInstructions] = useState(settings.instructions ?? "");
  const [problem, setProblem] = useState<"title" | "minutes" | null>(null);
  const blankMinutes = minutes.trim() === "";
  const typed: ExamSettings | null = (() => {
    const durationMinutes = blankMinutes ? null : minutesFromText(minutes);
    if (title.trim() === "") return null;
    if (!blankMinutes && durationMinutes === null) return null;
    return {
      title: title.trim(),
      durationMinutes,
      instructions: instructions.trim() === "" ? null : instructions.trim(),
    };
  })();
  const unchanged =
    typed !== null &&
    typed.title === settings.title &&
    typed.durationMinutes === settings.durationMinutes &&
    typed.instructions === settings.instructions;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim() === "") return setProblem("title");
    if (!blankMinutes && minutesFromText(minutes) === null) {
      return setProblem("minutes");
    }
    setProblem(null);
    if (typed && !unchanged) onSave(typed);
  };
  return (
    <section className="flex flex-col gap-3" aria-labelledby="settings-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="settings-title" className="mds-h2">
          {t("OnlineExams.settingsTitle")}
        </h2>
        {state === "pending" ? (
          <span className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.saving")}
          </span>
        ) : null}
        {state === "failed" ? (
          <Badge variant="error">{t("OnlineExams.notSaved")}</Badge>
        ) : null}
      </div>
      <form
        className="mds-card flex max-inline-measure flex-col gap-3 p-4"
        onSubmit={submit}
        noValidate
        aria-labelledby="settings-title"
      >
        <Field
          label={t("OnlineExams.examTitleLabel")}
          error={
            problem === "title" ? t("OnlineExams.titleMissing") : undefined
          }
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </Field>
        <Field
          label={t("OnlineExams.durationLabel")}
          help={t("OnlineExams.durationHelp")}
          error={
            problem === "minutes" ? t("OnlineExams.durationInvalid") : undefined
          }
        >
          <Input
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
            className="w-24"
          />
        </Field>
        <Field
          label={t("OnlineExams.instructionsLabel")}
          help={t("OnlineExams.instructionsHelp")}
        >
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            dir="auto"
            maxLength={4000}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={unchanged}>
            {t("OnlineExams.saveSettings")}
          </Button>
          {state === "failed" ? (
            <Button variant="secondary" onClick={onRetry}>
              {t("OnlineExams.retry")}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function TopicsSection({
  topics,
  onAdd,
  onRemove,
}: {
  topics: Topic[];
  onAdd: (name: string, number: number | undefined) => void;
  onRemove: (key: string) => void;
}) {
  const t = useTranslations("nazar");
  const [asking, setAsking] = useState<Topic | null>(null);
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
            <li key={topic.id} className="flex items-center gap-1">
              <Badge variant={topic.picked ? "brand" : "outline"}>
                {t("OnlineExams.topicChip", {
                  number: topic.number,
                  name: topic.name,
                })}
              </Badge>
              <IconButton
                size="small"
                variant="ghost"
                icon={<Icon name="close" size="sm" />}
                label={t("OnlineExams.removeTopicLabel", {
                  number: topic.number,
                  name: topic.name,
                })}
                onClick={() => setAsking(topic)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <AlertDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAsking(null);
        }}
        title={
          asking
            ? t("OnlineExams.removeTopicTitle", {
                number: asking.number,
                name: asking.name,
              })
            : ""
        }
        confirmLabel={t("OnlineExams.remove")}
        cancelLabel={t("OnlineExams.cancel")}
        closeLabel={t("Shell.close")}
        confirmVariant="destructive"
        onConfirm={() => {
          if (asking) onRemove(asking.id);
          setAsking(null);
        }}
      >
        {t("OnlineExams.removeTopicBody")}
      </AlertDialog>
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
  question: Question & { share?: { hundredths: number; own: boolean } };
  onEdit: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("nazar");
  const format = useFormatter();
  const share = question.share;
  const shown = share
    ? format.number(share.hundredths / 100, { maximumFractionDigits: 2 })
    : "";
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
      <p className="mds-body-sm text-neutral-muted">
        {question.answerMode === "MULTIPLE"
          ? `${t("OnlineExams.modeMultiple")} · ${
              question.scoring === "IN_SHARES"
                ? t("OnlineExams.scoringShares")
                : question.scoring === "ANY_CORRECT"
                  ? t("OnlineExams.scoringAny")
                  : t("OnlineExams.scoringAll")
            }`
          : t("OnlineExams.modeSingle")}
        {share
          ? ` · ${
              share.own
                ? t("OnlineExams.pointsOwn", { points: shown })
                : t("OnlineExams.pointsShare", { points: shown })
            }`
          : ""}
      </p>
      {question.text ? (
        <p className="mds-body" {...textProps(question.text)}>
          {question.text}
        </p>
      ) : (
        <p className="mds-body">{t("OnlineExams.noText")}</p>
      )}
      {question.options.length > 0 ? (
        // The list stays left to right with its letter on the left; each
        // option's text is its own run, and "Doğru" is never inside it.
        <ol className="mds-body-sm flex flex-col gap-1" type="A">
          {question.options.map((o) => (
            <li key={o.id}>
              <span {...textProps(o.text)}>{o.text}</span>
              {o.correct ? (
                <>
                  {" "}
                  <Badge variant="success">{t("OnlineExams.correct")}</Badge>
                </>
              ) : null}
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
  question: Question;
  onCancel: () => void;
  onSave: (body: QuestionBody) => void;
}) {
  const t = useTranslations("nazar");
  const format = useFormatter();
  const [mode, setMode] = useState<AnswerModeValue>(question.answerMode);
  const [scoring, setScoring] = useState<ScoringValue>(
    question.scoring ?? "ALL_OR_NOTHING"
  );
  const [points, setPoints] = useState(() => {
    const own = typedOwnOf(question);
    return own === null
      ? ""
      : format.number(own / 100, {
          maximumFractionDigits: 2,
          useGrouping: false,
        });
  });
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
  const filled = options
    .filter((o) => o.text.trim() !== "")
    .map((o) => ({ text: o.text.trim(), correct: o.correct }));
  const correctCount = filled.filter((o) => o.correct).length;
  // How it is answered is asked only with two correct options or more; with
  // one it is radio buttons, as the API's modeFits has it.
  const several = correctCount >= 2;
  const answerMode: AnswerModeValue = several ? mode : "SINGLE";
  const answerScoring = answerMode === "MULTIPLE" ? scoring : null;
  const own = points.trim() === "" ? null : pointsFromText(points);
  const pointsInvalid = points.trim() !== "" && own === null;
  const fits = modeFits(answerMode, answerScoring, correctCount);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (picked.unknown.length > 0 || pointsInvalid || !fits) return;
    onSave({
      text: text.trim(),
      options: filled,
      topicIds: picked.ids,
      answerMode,
      scoring: answerScoring,
      points: own,
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
          {...textProps(text)}
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
              {...textProps(o.text)}
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
      {several ? (
        <RadioGroup
          legend={t("OnlineExams.modeLegend")}
          value={mode}
          onChange={(value) => setMode(value as AnswerModeValue)}
          options={[
            {
              value: "SINGLE",
              label: t("OnlineExams.modeSingle"),
              description: t("OnlineExams.modeSingleHelp"),
            },
            {
              value: "MULTIPLE",
              label: t("OnlineExams.modeMultiple"),
              description: t("OnlineExams.modeMultipleHelp"),
            },
          ]}
        />
      ) : null}
      {answerMode === "MULTIPLE" ? (
        <RadioGroup
          legend={t("OnlineExams.scoringLegend")}
          value={scoring}
          onChange={(value) => setScoring(value as ScoringValue)}
          options={[
            {
              value: "ALL_OR_NOTHING",
              label: t("OnlineExams.scoringAll"),
              description: t("OnlineExams.scoringAllHelp"),
            },
            {
              value: "IN_SHARES",
              label: t("OnlineExams.scoringShares"),
              description: t("OnlineExams.scoringSharesHelp"),
            },
            {
              value: "ANY_CORRECT",
              label: t("OnlineExams.scoringAny"),
              description: t("OnlineExams.scoringAnyHelp"),
            },
          ]}
        />
      ) : null}
      <Field
        label={t("OnlineExams.ownPointsLabel")}
        help={t("OnlineExams.ownPointsHelp")}
        error={pointsInvalid ? t("OnlineExams.pointsInvalid") : undefined}
      >
        <Input
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          inputMode="decimal"
          className="w-24"
        />
      </Field>
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
        <Button
          type="submit"
          disabled={picked.unknown.length > 0 || pointsInvalid || !fits}
        >
          {t("OnlineExams.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("OnlineExams.cancel")}
        </Button>
      </div>
    </form>
  );
}
