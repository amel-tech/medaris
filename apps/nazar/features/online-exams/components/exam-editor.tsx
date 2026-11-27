"use client";

import type {
  ExamKind,
  ExamQuestionResponse,
  OnlineExamDraftResponse,
  PublishProblemResponse,
} from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { MultiCombobox } from "@medaris/ui/mds/combobox";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import {
  unstable_isUnrecognizedActionError as isStaleAction,
  useRouter,
} from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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
import { setExamQuestionTalebeNotes } from "../notes-actions";
import {
  type AnswerModeValue,
  lacksOf,
  minutesFromText,
  modeFits,
  nextFreeNumber,
  OPTION_FIELDS,
  OPTION_TEXT_MAX,
  OPTIONS_MAX,
  onlineExamErrorKey,
  optionLetter,
  optionsToSave,
  ownHundredthsOf,
  pastedOptions,
  pointsFromText,
  pointsText,
  READS_AGAIN,
  readUnsaved,
  type ScoringValue,
  sharesOf,
  spreadOptions,
  type UnsavedQuestion,
  writeUnsaved,
} from "../online-exams";
import { takesNotes } from "../question-notes";
import { PublishSection } from "./exam-publish";
import {
  HocaSheet,
  LacksMark,
  lackingWords,
  QuestionsBoard,
  useLacking,
  usePickedQuestion,
} from "./question-board";
import { TalebeNotesToggle } from "./talebe-notes-toggle";

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
  /** Whether its talebe may write a note on it (MDRS-248). */
  talebeNotes: boolean;
};

/** The settings the page holds; a çalışma seti's leave the length out (MDRS-248). */
const settingsOf = (
  draft: OnlineExamDraftResponse,
  practice: boolean
): ExamSettings => ({
  title: draft.title,
  instructions: draft.instructions ?? null,
  ...(practice ? {} : { durationMinutes: draft.durationMinutes }),
});

/** A question's own points as typed: on their way, refused, or the API's. */
const typedOwnOf = (q: Question): number | null =>
  q.wantedPoints !== undefined ? q.wantedPoints : ownHundredthsOf(q.ownPoints);

/** The own points the shares are drawn from: a refused value never counts. */
const ownOf = (q: Question): number | null =>
  q.failed ? ownHundredthsOf(q.ownPoints) : typedOwnOf(q);

/**
 * The questions as the server has them, with what this browser kept unsaved
 * laid over them: an edit to a question over it, a new question at the end,
 * each marked "Kaydedilemedi" to try again.
 */
function keptOver(
  base: Question[],
  kept: UnsavedQuestion[],
  kind: ExamKind
): Question[] {
  const next = [...base];
  for (const item of kept) {
    const lacks = lacksOf(item, kind);
    const shown = {
      text: item.text,
      options: item.options.map((o, i) => ({ id: `kept-${i}`, ...o })),
      topicIds: item.topicIds,
      answerMode: item.answerMode,
      scoring: item.scoring,
      wantedPoints: item.points,
      ...(item.talebeNotes === undefined
        ? {}
        : { talebeNotes: item.talebeNotes }),
      lacks,
      complete: lacks.length === 0,
      pending: false,
      failed: true,
    };
    const at = item.id ? next.findIndex((q) => q.id === item.id) : -1;
    if (at >= 0) next[at] = { ...next[at], ...shown };
    else
      next.push({
        ...shown,
        key: localKey(),
        id: "",
        number: next.length + 1,
        ownPoints: null,
        points: "",
      } as Question);
  }
  return next;
}

let localKeys = 0;
const localKey = () => `local-${++localKeys}`;

/**
 * The course's numbered topics, and the exam's questions with their options,
 * correct marks and topics (typed by number). Optimistic: a topic or a
 * question shows at once and the page goes on; the writes run in order in
 * the background, each naming the version the one before handed back. A
 * write that fails keeps what was typed and offers it again; a version
 * someone else moved (EXAM_STALE) reads the page again.
 *
 * With `kind: PRACTICE` it prepares a çalışma seti (MDRS-248): no length,
 * no points and a publish with no date, since a set has no celse and every
 * question of it weighs the same.
 */
export function ExamEditor({
  courseId,
  draft,
  kind = "EXAM",
  publish,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
  kind?: ExamKind;
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
  // The question last picked in the list on the end side (MDRS-248).
  const { picked, pick, setPicked, placeId } = usePickedQuestion();
  const practice = kind === "PRACTICE";
  const [settings, setSettings] = useState<ExamSettings>(() =>
    settingsOf(draft, practice)
  );
  const [settingsState, setSettingsState] = useState<
    "saved" | "pending" | "failed"
  >("saved");
  const [inFlight, setInFlight] = useState(0);
  // The form open for a new question nothing was typed into yet: after a
  // save the next one opens by itself (MDRS-248), and it holds nothing up.
  const blank = questions.find(
    (q) => q.key === editing && q.id === "" && !q.pending && !q.failed
  );
  const [typing, setTyping] = useState(false);
  const [changed, setChanged] = useState(false);
  // What waits on "Değişiklikleri bırak": a saved question's form holds a
  // change, and opening another form would drop it unseen (MDRS-248).
  const [dropThen, setDropThen] = useState<(() => void) | null>(null);
  const version = useRef(draft.version);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The rows whose talebe-notes icon is being written, and the state each
  // write left on the server (by question id), laid over a later read.
  const [notesBusy, setNotesBusy] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const notesSet = useRef(new Map<string, boolean>());

  // Leaving while a write is on its way loses it: the browser asks first.
  useEffect(() => {
    if (inFlight === 0) return;
    const hold = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [inFlight]);

  // What was typed and not saved is kept in this browser: a reload after a
  // new version of Medaris, or a closed tab, brings it back to try again.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const kept = readUnsaved(draft.id, window.localStorage);
    if (kept.length === 0) return;
    setQuestions((all) => keptOver(all, kept, kind));
    notify({
      tone: "info",
      title: t("OnlineExams.restored", { count: kept.length }),
    });
  }, [draft.id, notify, t, kind]);
  useEffect(() => {
    if (!restored.current) return;
    const unsaved: UnsavedQuestion[] = questions
      .filter((q) => q.pending || q.failed)
      .map((q) => ({
        id: q.id,
        text: q.text,
        options: q.options.map((o) => ({ text: o.text, correct: o.correct })),
        topicIds: q.topicIds,
        answerMode: q.answerMode as AnswerModeValue,
        scoring: (q.scoring ?? null) as ScoringValue | null,
        points: typedOwnOf(q),
        talebeNotes: takesNotes(q, kind),
      }));
    writeUnsaved(draft.id, unsaved, window.localStorage);
  }, [draft.id, questions, kind]);

  // A newer read of the exam reaches this editor without remounting it: the
  // router draws the page again after a save that renewed the session, or
  // after EXAM_STALE. It is taken only when nothing of the page's own is on
  // its way or open, since the queue carries the page's version; what was
  // typed and not saved is laid over it again.
  // The form of a new question stays open over it, under the questions read.
  // A talebe-notes write of a row (outside the queue) holds it too, and the
  // icons this page set are laid over the read, which may predate them.
  useEffect(() => {
    if (draft.version <= version.current) return;
    if (inFlight > 0 || (editing !== null && editing !== blank?.key)) return;
    if (notesBusy.size > 0) return;
    version.current = draft.version;
    setTopics(draft.courseTopics);
    setQuestions(
      keptOver(
        draft.questions.map((q) => {
          const set = notesSet.current.get(q.id);
          return set === undefined
            ? { ...q, key: q.id }
            : { ...q, key: q.id, talebeNotes: set };
        }),
        readUnsaved(draft.id, window.localStorage),
        kind
      ).concat(blank ? [blank] : [])
    );
    if (settingsState !== "failed" && settingsState !== "pending") {
      setSettings(settingsOf(draft, practice));
    }
  }, [
    draft,
    inFlight,
    editing,
    blank,
    settingsState,
    practice,
    kind,
    notesBusy,
  ]);

  /** A refusal, worded; false when the write did not go through. */
  const went = (result: Outcome): boolean => {
    if (handleUnauthenticated(result as never)) return false;
    if ("success" in result && result.success === false) {
      notify({
        tone: "error",
        title: t("OnlineExams.failed"),
        description:
          practice && result.code === "EXAM_NOT_READY"
            ? t("Practice.notReady")
            : practice && result.code === "EXAM_LOCKED"
              ? t("Practice.lockedEdit")
              : words(onlineExamErrorKey(result.code)),
      });
      if (READS_AGAIN.has(result.code)) router.refresh();
      return false;
    }
    return true;
  };

  /**
   * A write that threw, said as a refusal is. One that names a Server Action
   * the server no longer has means Medaris was updated while the page was
   * open: only a reload can save, and what was typed is kept for it.
   */
  const threw = (error?: unknown) => {
    if (isStaleAction(error)) {
      notify({
        id: "exam-stale-deploy",
        tone: "error",
        title: t("OnlineExams.staleTitle"),
        description: t("OnlineExams.staleBody"),
        action: {
          label: t("OnlineExams.reload"),
          onClick: () => window.location.reload(),
        },
      });
      return;
    }
    notify({ tone: "error", title: t("OnlineExams.failed") });
  };

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
    const lacks = lacksOf(body, kind);
    patch(key, {
      text: body.text,
      options: body.options.map((o, i) => ({ id: `${key}-${i}`, ...o })),
      topicIds: body.topicIds,
      answerMode: body.answerMode,
      scoring: body.scoring,
      wantedPoints: body.points,
      talebeNotes: body.talebeNotes,
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
          talebeNotes: body.talebeNotes,
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
      } catch (error) {
        threw(error);
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
      } catch (error) {
        threw(error);
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
    // The form open on it closes with it: a form left open on a question
    // no longer listed held "Yayınla" until the page was read again.
    setEditing((open) => (open === key ? null : open));
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
      } catch (error) {
        threw(error);
        restore();
      }
    });
  };

  /**
   * The talebe-notes icon of a saved question's row (MDRS-248): it shows the
   * new state at once and writes it outside the queue, since it names no
   * version and moves none; a refusal takes it back. A question the server
   * does not hold yet, or one being saved, offers it off.
   */
  const notesWrites = useRef(new Set<string>());
  const busy = (key: string, on: boolean) =>
    setNotesBusy((all) => {
      const next = new Set(all);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const toggleNotes = (key: string) => {
    const q = questions.find((it) => it.key === key);
    const id = idOf(key);
    if (!q || id === "" || q.pending || notesWrites.current.has(key)) return;
    const next = !takesNotes(q, kind);
    notesWrites.current.add(key);
    busy(key, true);
    patch(key, { talebeNotes: next });
    const back = () => patch(key, { talebeNotes: !next });
    const refused = () =>
      notify({ tone: "error", title: t("QuestionNotes.toggleFailed") });
    void (async () => {
      try {
        const result = await setExamQuestionTalebeNotes(draft.id, id, next);
        if (handleUnauthenticated(result as never)) return back();
        if (!("data" in result)) {
          back();
          return refused();
        }
        notesSet.current.set(id, result.data.talebeNotes);
        patch(key, { talebeNotes: result.data.talebeNotes });
      } catch (error) {
        back();
        if (isStaleAction(error)) threw(error);
        else refused();
      } finally {
        notesWrites.current.delete(key);
        busy(key, false);
      }
    })();
  };

  /**
   * The new question's form, never saved, is taken off when another
   * question is opened or sent again: it would stay as an empty "Eksik" row.
   */
  const leaveBlank = () => {
    if (blank) removeQuestion(blank.key);
  };

  /** The caret back in the open question's text. */
  const focusOpen = () =>
    document
      .querySelector<HTMLTextAreaElement>(
        `form[data-question="${editing}"] textarea`
      )
      ?.focus();

  /**
   * Another form opens only once the open one's change is kept or let go: a
   * saved question's form with a change asks first; otherwise it goes on.
   */
  const leaveOpen = (next: () => void) => {
    if (editing !== null && editing !== blank?.key && changed) {
      setDropThen(() => next);
      return;
    }
    next();
  };

  /** "Soru ekle": a new question's form already open takes the caret instead. */
  const addQuestion = () => {
    if (blank) {
      focusOpen();
      return;
    }
    leaveOpen(openNewQuestion);
  };

  /** A new question's form at the end of the list, the caret in its text. */
  const openNewQuestion = () => {
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
        // Off for every new question, as the API's (MDRS-248, 2026-11-28):
        // the hoca turns it on with the icon.
        talebeNotes: false,
        complete: false,
        lacks: lacksOf({ text: "", options: [], topicIds: [] }, kind),
      },
    ]);
    setTyping(false);
    setEditing(key);
  };

  /** Shows the topic at once and makes it in the queue; its local id until then. */
  const addTopic = (name: string, number: number | undefined): string => {
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
      } catch (error) {
        threw(error);
        drop();
      }
    });
    return key;
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
      } catch (error) {
        threw(error);
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
    // A set's questions all weigh the same: it shows no points.
    share: practice ? undefined : shares.get(q.key),
  }));
  const view = { ...draft, courseTopics: topics };
  // What the page counts and checks: the questions, without a new one's
  // form that nothing was typed into.
  const listed = numbered.filter((q) => q.key !== blank?.key || typing);
  /** A topic made on this page by the id the server gave it, once it has. */
  const topicOf = (id: string) => topicIdOf.current.get(id) ?? id;

  /** What each question lacks, worded, for its line in the list. */
  const lackingOf = (q: Question) => lackingWords(t, q.lacks, practice);

  /** "Düzenle", or a question's exclamation mark: its form opens in its place. */
  const editQuestion = (key: string) => {
    if (notesBusy.has(key)) return;
    leaveOpen(() => {
      leaveBlank();
      setPicked(key);
      setEditing(key);
    });
  };

  // What the page knows keeps the exam from being published: its length and
  // the questions as they now stand, and what only the server knows (the
  // points total and the zeroth question) as it was read.
  // A set needs one complete question only, as the API's practiceProblems.
  const problems: PublishProblemResponse[] = !publish
    ? []
    : practice
      ? // A question kept here after a failed save is not on the server.
        listed.some(
          (q) => q.lacks.length === 0 && !q.failed && (q.id !== "" || q.pending)
        )
        ? []
        : [{ kind: "NO_QUESTION" as const }]
      : [
          ...(settings.durationMinutes === null
            ? [{ kind: "NO_DURATION" as const }]
            : []),
          ...(listed.length === 0 ? [{ kind: "NO_QUESTION" as const }] : []),
          ...listed
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
  const publishNow = (times: {
    startsAt?: string;
    latestStartMinutes?: number;
  }) => {
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
      } catch (error) {
        threw(error);
      } finally {
        setSending(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-section">
      {/* The questions first, as the talebe will see them (MDRS-248):
          the settings, the topics and the publishing come after them. */}
      <section
        className="flex flex-col gap-3"
        aria-labelledby="questions-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="questions-title" className="mds-h2">
            {t("OnlineExams.questionsTitle", { count: listed.length })}
          </h2>
          <span className="mds-body-sm text-neutral-muted" aria-live="polite">
            {inFlight > 0 ? t("OnlineExams.saving") : ""}
          </span>
        </div>
        {listed.length === 0 && editing === null ? (
          <p className="mds-body-sm text-neutral-muted">
            {t("OnlineExams.noQuestions")}
          </p>
        ) : null}
        {/* Two columns on a desk (question-board.tsx): every question as
            the talebe sees it, or its form while it is written; on the end
            side every question as one line. */}
        <QuestionsBoard
          lines={numbered.map((q) => ({
            key: q.key,
            number: q.number,
            text: q.text,
            lacking: lackingOf(q),
            pending: q.pending,
            failed: q.failed,
          }))}
          picked={picked}
          placeId={placeId}
          onPick={(key) => pick(key)}
          onEdit={editQuestion}
          action={
            <Button variant="secondary" onClick={addQuestion}>
              {t("OnlineExams.addQuestion")}
            </Button>
          }
        >
          {/* Each sheet says "1. soru": the list draws no number of its own. */}
          <ol className="flex list-none flex-col gap-3 ps-0">
            {numbered.map((q) => (
              <li
                key={q.key}
                id={placeId(q.key)}
                className="scroll-mt-4"
                data-picked={q.key === picked || undefined}
              >
                {editing === q.key ? (
                  <QuestionForm
                    practice={practice}
                    kind={kind}
                    draft={view}
                    question={q}
                    topicOf={topicOf}
                    onTyping={setTyping}
                    onChanged={setChanged}
                    onCancel={() =>
                      q.id === "" && !q.pending && q.text === ""
                        ? removeQuestion(q.key)
                        : setEditing(null)
                    }
                    onSave={(body) => {
                      // A new question saved opens the next one's form; an
                      // edit to a saved one closes (MDRS-248).
                      const next = q.key === blank?.key;
                      saveQuestion(q.key, body);
                      if (next) openNewQuestion();
                    }}
                  />
                ) : (
                  <QuestionCard
                    practice={practice}
                    draft={view}
                    topicOf={topicOf}
                    question={q}
                    picked={q.key === picked}
                    onEdit={() => editQuestion(q.key)}
                    onRetry={() => {
                      leaveBlank();
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
                        talebeNotes: takesNotes(q, kind),
                      });
                    }}
                    onRemove={() => removeQuestion(q.key)}
                    notes={{
                      on: takesNotes(q, kind),
                      offered: q.id !== "" && !q.pending,
                      onToggle: () => toggleNotes(q.key),
                    }}
                  />
                )}
              </li>
            ))}
          </ol>
          <div>
            <Button onClick={addQuestion}>
              {t("OnlineExams.addQuestion")}
            </Button>
          </div>
        </QuestionsBoard>
        <AlertDialog
          open={dropThen !== null}
          onOpenChange={(open) => {
            if (open) return;
            setDropThen(null);
            // "Vazgeç": back to the form, its change still there.
            window.setTimeout(focusOpen, 0);
          }}
          title={t("OnlineExams.unsavedTitle")}
          confirmLabel={t("OnlineExams.unsavedDrop")}
          cancelLabel={t("OnlineExams.unsavedKeep")}
          closeLabel={t("Shell.close")}
          confirmVariant="destructive"
          onConfirm={() => {
            const next = dropThen;
            setDropThen(null);
            setEditing(null);
            next?.();
          }}
        >
          {t("OnlineExams.unsavedBody")}
        </AlertDialog>
      </section>
      <SettingsSection
        practice={practice}
        settings={settings}
        state={settingsState}
        onSave={saveSettings}
        onRetry={() => saveSettings(settings)}
      />
      <TopicsSection
        topics={topics}
        onAdd={(name, number) => {
          addTopic(name, number);
        }}
        onRemove={removeTopic}
      />
      {publish ? (
        <PublishSection
          kind={kind}
          problems={problems}
          questionCount={listed.length}
          incompleteCount={listed.filter((q) => q.lacks.length > 0).length}
          durationMinutes={settings.durationMinutes ?? null}
          timeZone={publish.timeZone}
          holding={editing !== null && (editing !== blank?.key || typing)}
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
  practice,
  settings,
  state,
  onSave,
  onRetry,
}: {
  /** A çalışma seti: no length (MDRS-248). */
  practice: boolean;
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
    settings.durationMinutes == null ? "" : String(settings.durationMinutes)
  );
  const [instructions, setInstructions] = useState(settings.instructions ?? "");
  const [problem, setProblem] = useState<"title" | "minutes" | null>(null);
  const blankMinutes = minutes.trim() === "";
  const typed: ExamSettings | null = (() => {
    const durationMinutes = blankMinutes ? null : minutesFromText(minutes);
    if (title.trim() === "") return null;
    const rest = {
      title: title.trim(),
      instructions: instructions.trim() === "" ? null : instructions.trim(),
    };
    if (practice) return rest;
    if (!blankMinutes && durationMinutes === null) return null;
    return { ...rest, durationMinutes };
  })();
  const unchanged =
    typed !== null &&
    typed.title === settings.title &&
    typed.durationMinutes === settings.durationMinutes &&
    typed.instructions === settings.instructions;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim() === "") return setProblem("title");
    if (!practice && !blankMinutes && minutesFromText(minutes) === null) {
      return setProblem("minutes");
    }
    setProblem(null);
    if (typed && !unchanged) onSave(typed);
  };
  // Filled in, it starts folded to one line: the questions are the work.
  const [startOpen] = useState(
    () =>
      settings.title.trim() === "" ||
      (!practice && settings.durationMinutes == null)
  );
  const summary = [
    settings.title,
    ...(practice
      ? []
      : [
          settings.durationMinutes == null
            ? t("OnlineExams.noDurationShort")
            : t("OnlineExams.minutesShort", {
                minutes: settings.durationMinutes,
              }),
        ]),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <FoldingSection
      id="settings-title"
      title={t("OnlineExams.settingsTitle")}
      summary={summary}
      startOpen={startOpen}
      aside={
        <>
          {state === "pending" ? (
            <span className="mds-body-sm text-neutral-muted">
              {t("OnlineExams.saving")}
            </span>
          ) : null}
          {state === "failed" ? (
            <Badge variant="error">{t("OnlineExams.notSaved")}</Badge>
          ) : null}
        </>
      }
    >
      <form
        className="mds-card flex max-inline-measure flex-col gap-3 p-4"
        onSubmit={submit}
        noValidate
        aria-labelledby="settings-title"
      >
        <Field
          label={
            practice
              ? t("Practice.newTitleLabel")
              : t("OnlineExams.examTitleLabel")
          }
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
        {practice ? null : (
          <Field
            label={t("OnlineExams.durationLabel")}
            help={t("OnlineExams.durationHelp")}
            error={
              problem === "minutes"
                ? t("OnlineExams.durationInvalid")
                : undefined
            }
          >
            <Input
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
              className="w-24"
            />
          </Field>
        )}
        <Field
          label={t("OnlineExams.instructionsLabel")}
          help={
            practice
              ? t("Practice.instructionsHelp")
              : t("OnlineExams.instructionsHelp")
          }
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
    </FoldingSection>
  );
}

/**
 * A part of the editor's top that folds away (MDRS-248): it starts open
 * while it wants filling in, else as its title and a one-line summary
 * ("Konular · 13 konu"), so the questions are what the page shows first.
 * Its heading holds a button with `aria-expanded`, so the heading stays in
 * the outline and the part opens by keyboard.
 */
function FoldingSection({
  id,
  title,
  summary,
  startOpen,
  aside,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  startOpen: boolean;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const panel = `${id}-panel`;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-2">
        {/* The heading stays a heading (the outline finds it); the button in
            it opens and folds the part, as the disclosure pattern has it. */}
        <h2 id={id} className="mds-h2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((was) => !was)}
            className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-inherit [font:inherit]"
          >
            <span
              aria-hidden="true"
              className={`inline-flex transition-transform ${open ? "" : "-rotate-90"}`}
            >
              <Icon name="chevronDown" size="sm" />
            </span>
            {title}
          </button>
        </h2>
        <span className="mds-body-sm min-inline-0 truncate text-neutral-muted">
          <bdi>{summary}</bdi>
        </span>
        {aside}
      </div>
      {/* Folded, it stays drawn (hidden): what was typed in it is kept. */}
      {/* `hidden` alone loses to the flex class: the class goes with it. */}
      <div
        id={panel}
        hidden={!open}
        className={open ? "flex flex-col gap-3" : "hidden"}
      >
        {children}
      </div>
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
  // The number field holds the smallest number no topic has (MDRS-248, the
  // owner: "yeni konu numarası otomatik"), the one the API would give, until
  // it is typed over; cleared, the API picks it.
  const [typed, setTyped] = useState<string | null>(null);
  const number =
    typed ?? String(nextFreeNumber(topics.map((topic) => topic.number)));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim() === "") return;
    onAdd(name.trim(), number.trim() === "" ? undefined : Number(number));
    setName("");
    setTyped(null);
  };
  const [startOpen] = useState(() => topics.length === 0);
  return (
    <FoldingSection
      id="topics-title"
      title={t("OnlineExams.topicsTitle")}
      summary={t("OnlineExams.topicsCount", { count: topics.length })}
      startOpen={startOpen}
    >
      {topics.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 ps-0">
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
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
            placeholder={t("OnlineExams.topicNumberPlaceholder")}
            className="w-24"
          />
        </Field>
        <Field label={t("OnlineExams.topicNameLabel")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            dir="auto"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={name.trim() === ""}>
          {t("OnlineExams.addTopic")}
        </Button>
      </form>
    </FoldingSection>
  );
}

/**
 * The open question as the talebe will see it (MDRS-248, the owner:
 * "talebenin gördüğü arayüz ile hocaların gördüğü arayüz aynı değil … sorular
 * da öğrencinin ekranda gördüğü gibi görünmeli ki hoca öğrenciyi daha iyi
 * anlayabilsin"): tedris's own QuestionSheet from @medaris/ui, the same
 * number line, text and option tiles, read only. Laid over it for the hoca
 * only: a ✓ named "Doğru" on the correct options, the topics beside the
 * number, and the talebe-notes icon, "Düzenle" and "Sil" where the talebe
 * has the note icon. A question that is not ready is tinted red, its
 * exclamation mark beside its number.
 */
function QuestionCard({
  practice,
  draft,
  topicOf,
  question,
  picked = false,
  onEdit,
  onRetry,
  onRemove,
  notes,
}: {
  practice: boolean;
  draft: OnlineExamDraftResponse;
  topicOf: (id: string) => string;
  /** picked in the list on the end side: outlined, and focused when it is */
  picked?: boolean;
  question: Question & {
    number: number;
    share?: { hundredths: number; own: boolean };
  };
  onEdit: () => void;
  onRetry: () => void;
  onRemove: () => void;
  /** The talebe-notes icon (MDRS-248); `offered` is false until the server holds the question. */
  notes: { on: boolean; offered: boolean; onToggle: () => void };
}) {
  const t = useTranslations("nazar");
  const format = useFormatter();
  const share = question.share;
  const shown = share
    ? format.number(share.hundredths / 100, { maximumFractionDigits: 2 })
    : "";
  const [asking, setAsking] = useState(false);
  // Its topics by number and name: "11" alone sends the reader up the page.
  const ids = question.topicIds.map(topicOf);
  const named = draft.courseTopics.filter((topic) => ids.includes(topic.id));
  const n = question.number;
  const lacking = useLacking(question, practice);
  const facts = [
    ...(question.answerMode === "MULTIPLE"
      ? [
          t("OnlineExams.modeMultiple"),
          question.scoring === "IN_SHARES"
            ? t("OnlineExams.scoringShares")
            : question.scoring === "ANY_CORRECT"
              ? t("OnlineExams.scoringAny")
              : t("OnlineExams.scoringAll"),
        ]
      : []),
    ...(share
      ? [
          share.own
            ? t("OnlineExams.pointsOwn", { points: shown })
            : t("OnlineExams.pointsShare", { points: shown }),
        ]
      : []),
  ].join(" · ");
  const lacks = lacking.length > 0;
  return (
    <article
      className="flex flex-col gap-2 focus-visible:outline-none"
      aria-label={t("OnlineExams.questionNumber", { number: n })}
      data-lacks-card={lacks ? "" : undefined}
      tabIndex={-1}
    >
      <HocaSheet
        question={question}
        number={n}
        className={
          lacks
            ? "border-error-default bg-error-subtle"
            : picked
              ? "border-brand-default"
              : undefined
        }
        head={
          <>
            {lacks ? <LacksMark lacking={lacking} onEdit={onEdit} /> : null}
            {named.map((topic) => (
              <Badge key={topic.id} variant="outline">
                <bdi>
                  {t("OnlineExams.topicChip", {
                    number: topic.number,
                    name: topic.name,
                  })}
                </bdi>
              </Badge>
            ))}
            {question.pending ? (
              <span className="mds-body-sm text-neutral-muted">
                {t("OnlineExams.saving")}
              </span>
            ) : null}
            {question.failed ? (
              <Badge variant="error">{t("OnlineExams.notSaved")}</Badge>
            ) : null}
          </>
        }
        tools={
          <>
            <TalebeNotesToggle
              on={notes.on}
              disabled={!notes.offered}
              onToggle={notes.onToggle}
            />
            {question.failed ? (
              <Button size="small" onClick={onRetry}>
                {t("OnlineExams.retry")}
              </Button>
            ) : null}
            <IconButton
              size="small"
              variant="ghost"
              icon={<Icon name="edit" size="sm" />}
              label={t("OnlineExams.editQuestion", { number: n })}
              onClick={onEdit}
            />
            {/* Opened by state, as the other nazar dialogs are: a bare `trigger`
                is not wrapped in the kit's AlertDialogTrigger and opened nothing. */}
            <IconButton
              size="small"
              variant="ghost"
              icon={<Icon name="trash" size="sm" />}
              label={t("OnlineExams.removeQuestion", { number: n })}
              onClick={() => setAsking(true)}
            />
          </>
        }
      />
      {facts ? (
        <p className="mds-body-sm m-0 text-neutral-muted">{facts}</p>
      ) : null}
      <AlertDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("OnlineExams.removeTitle", { number: n })}
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
    </article>
  );
}

/** Alt (Option on a Mac) + D, read by the key's place: Option+D types "∂". */
const marksCorrect = (event: KeyboardEvent<HTMLElement>) =>
  event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  (event.code === "KeyD" || event.key.toLowerCase() === "d");

/**
 * A question typed fast (MDRS-248). The caret starts in "Soru"; Tab goes
 * Soru → A → B → … one stop per option, since each "Doğru" box is out of
 * the Tab order (tabIndex -1) and marked from its option instead with
 * Alt/Option + D (named in `aria-keyshortcuts`). The box is still a
 * labelled check box beside its option: a screen reader finds it and a click
 * or Space on it marks it. Cmd/Ctrl + Enter saves from any field. The keys
 * are not written under the form any more (the owner, 2026-11-28); they
 * still work. The topics are a searchable list of several (MultiCombobox):
 * a topic is made under "Konular", not here. Empty options are left out on
 * save, which the form says before it happens.
 */
function QuestionForm({
  practice,
  kind,
  draft,
  question,
  topicOf,
  onTyping,
  onChanged,
  onCancel,
  onSave,
}: {
  /** A çalışma seti's question has no points of its own and needs no topic (MDRS-248). */
  practice: boolean;
  kind: ExamKind;
  draft: OnlineExamDraftResponse;
  question: Question;
  /** A topic made on this page by the id the server gave it, once it has. */
  topicOf: (id: string) => string;
  /** Whether anything is typed in the form, so a blank new one holds nothing up. */
  onTyping: (typing: boolean) => void;
  /** Whether the form differs from the question it opened with: leaving it would lose that. */
  onChanged: (changed: boolean) => void;
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
  const [topicIds, setTopicIds] = useState<string[]>(question.topicIds);
  // The talebe-notes icon (MDRS-248): it goes with the save, as `talebeNotes`.
  const [notes, setNotes] = useState(() => takesNotes(question, kind));
  // The topics as the chips have them: by the server's id once it is known,
  // and only those the course still has.
  const known = new Set(draft.courseTopics.map((topic) => topic.id));
  const picked = [...new Set(topicIds.map(topicOf))].filter((id) =>
    known.has(id)
  );
  const setOption = (i: number, change: Partial<(typeof options)[number]>) =>
    setOptions((all) => all.map((o, j) => (j === i ? { ...o, ...change } : o)));
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId().replace(/[^\w-]/g, "");
  // The caret starts in "Soru": a form opened after a save is typed into at once.
  useEffect(() => {
    formRef.current?.querySelector("textarea")?.focus();
  }, []);
  const typing =
    text.trim() !== "" || options.some((o) => o.text.trim() !== "");
  useEffect(() => {
    onTyping(typing);
  }, [typing, onTyping]);
  // What the form holds against what it opened with: "Soru ekle" or another
  // question's "Düzenle" asks before a change is dropped (MDRS-248).
  const now = JSON.stringify([
    text,
    options,
    topicIds,
    mode,
    scoring,
    points,
    notes,
  ]);
  const [opened] = useState(now);
  const changed = now !== opened;
  useEffect(() => {
    onChanged(changed);
  }, [changed, onChanged]);
  useEffect(() => () => onChanged(false), [onChanged]);
  // The option to put the caret in once it is drawn (Enter on the last one adds it).
  const [focusAt, setFocusAt] = useState<number | null>(null);
  useEffect(() => {
    if (focusAt === null) return;
    formRef.current
      ?.querySelectorAll<HTMLInputElement>("input[data-option]")
      [focusAt]?.focus();
    setFocusAt(null);
  }, [focusAt]);
  // Enter goes on to the next option, and past the last one adds one, so a
  // question's options are typed one after another without the mouse.
  const onOptionKey = (i: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (marksCorrect(event)) {
      event.preventDefault();
      setOption(i, { correct: !options[i]?.correct });
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    // Cmd/Ctrl + Enter is the form's: it saves.
    if (event.metaKey || event.ctrlKey) return;
    // On the last option there can be, Enter sends the form, as before.
    if (i + 1 >= OPTIONS_MAX) return;
    event.preventDefault();
    if (i + 1 >= options.length)
      setOptions((all) => [...all, { text: "", correct: false }]);
    setFocusAt(i + 1);
  };
  // A list pasted into an empty option fills it and the empty ones after it, a line each.
  const onOptionPaste = (
    i: number,
    event: ClipboardEvent<HTMLInputElement>
  ) => {
    // Into an option that holds text, a paste goes in at the caret, as typed.
    if (event.currentTarget.value.trim() !== "") return;
    const lines = pastedOptions(event.clipboardData.getData("text"));
    if (lines.length < 2) return;
    event.preventDefault();
    const spread = spreadOptions(options, i, lines);
    setOptions(spread.options);
    setFocusAt(spread.last);
  };
  const { kept, gaps, blankCorrect } = optionsToSave(options);
  const correctCount = kept.filter((o) => o.correct).length;
  // How it is answered is asked only with two correct options or more; with
  // one it is radio buttons, as the API's modeFits has it.
  const several = correctCount >= 2;
  const answerMode: AnswerModeValue = several ? mode : "SINGLE";
  const answerScoring = answerMode === "MULTIPLE" ? scoring : null;
  const own = practice || points.trim() === "" ? null : pointsFromText(points);
  const pointsInvalid = !practice && points.trim() !== "" && own === null;
  const fits = modeFits(answerMode, answerScoring, correctCount);
  // Nothing typed is not a question: Cmd+Enter pressed once too often
  // sends no empty one (and opens no form after it).
  const empty = text.trim() === "" && kept.length === 0;
  const blocked = pointsInvalid || !fits || blankCorrect >= 0 || empty;

  const save = () => {
    if (blocked) return;
    onSave({
      text: text.trim(),
      options: kept,
      topicIds: picked,
      answerMode,
      scoring: answerScoring,
      points: own,
      talebeNotes: notes,
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save();
  };
  // Cmd/Ctrl + Enter saves from any field of the form. Enter alone in the
  // topics' search picks a topic (or nothing); it never sends the question.
  const onFormKey = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === "Enter" &&
      !event.metaKey &&
      !event.ctrlKey &&
      event.target instanceof HTMLElement &&
      event.target.getAttribute("role") === "combobox"
    ) {
      event.preventDefault();
      return;
    }
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.repeat &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      save();
    }
  };

  return (
    <form
      ref={formRef}
      data-question={question.key}
      // The card keeps the list's width; what is typed in it keeps a reading
      // measure, so an option and its "Doğru" are never a screen apart.
      className="mds-card flex flex-col gap-3 p-4 [&>*]:max-inline-measure"
      onSubmit={submit}
      onKeyDown={onFormKey}
      noValidate
      aria-label={t("OnlineExams.questionNumber", { number: question.number })}
      aria-keyshortcuts="Meta+Enter Control+Enter"
    >
      <Field label={t("OnlineExams.questionTextLabel")}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          {...textProps(text)}
          maxLength={4000}
          // Grows with what is typed where the browser can (field-sizing).
          className="field-sizing-content"
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mds-label">{t("OnlineExams.optionsLabel")}</legend>
        <ol className="flex list-none flex-col gap-1 ps-0">
          {options.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                id={`${uid}-letter-${i}`}
                className="mds-label inline-5 shrink-0 text-center"
              >
                {optionLetter(i)}
              </span>
              <Checkbox
                label={t("OnlineExams.correct")}
                aria-describedby={`${uid}-letter-${i}`}
                checked={o.correct}
                onCheckedChange={(checked) =>
                  setOption(i, { correct: checked === true })
                }
                // One Tab stop per option: the box is marked with Alt+D from it.
                tabIndex={-1}
                className="shrink-0"
              />
              <Input
                aria-label={t("OnlineExams.optionLabel", { n: i + 1 })}
                aria-keyshortcuts="Alt+D"
                data-option=""
                value={o.text}
                onChange={(e) => setOption(i, { text: e.target.value })}
                onKeyDown={(e) => onOptionKey(i, e)}
                onPaste={(e) => onOptionPaste(i, e)}
                {...textProps(o.text)}
                maxLength={OPTION_TEXT_MAX}
                enterKeyHint="next"
                className="min-inline-0 flex-1"
              />
            </li>
          ))}
        </ol>
        {blankCorrect >= 0 ? (
          <p className="mds-error" role="alert">
            {t("OnlineExams.blankCorrect", {
              letter: optionLetter(blankCorrect),
            })}
          </p>
        ) : gaps ? (
          <p className="mds-help" aria-live="polite">
            {t("OnlineExams.blankDropped")}
          </p>
        ) : null}
        {options.length < OPTIONS_MAX ? (
          <div>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setOptions((all) => [...all, { text: "", correct: false }]);
                setFocusAt(options.length);
              }}
            >
              {t("OnlineExams.addOption")}
            </Button>
          </div>
        ) : null}
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
      {practice ? null : (
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
      )}
      {draft.courseTopics.length > 0 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-topics`} className="mds-label">
            {practice
              ? t("OnlineExams.topicsOptional")
              : t("OnlineExams.topicsTitle")}
          </label>
          <MultiCombobox
            id={`${uid}-topics`}
            value={picked}
            onChange={setTopicIds}
            placeholder={t("OnlineExams.topicsSearch")}
            emptyText={t("OnlineExams.topicsNoMatch")}
            removeLabel={(name) => t("OnlineExams.topicUnpick", { name })}
            options={draft.courseTopics.map((topic) => ({
              value: topic.id,
              label: t("OnlineExams.topicChip", {
                number: topic.number,
                name: topic.name,
              }),
            }))}
          />
        </div>
      ) : (
        <p className="mds-body-sm text-neutral-muted">
          {t("OnlineExams.topicsNone")}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={blocked}>
          {t("OnlineExams.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("OnlineExams.cancel")}
        </Button>
        {/* Beside the buttons, never a field of its own: it takes no room. */}
        <span className="ms-auto">
          <TalebeNotesToggle
            on={notes}
            onToggle={() => setNotes((was) => !was)}
          />
        </span>
      </div>
    </form>
  );
}
