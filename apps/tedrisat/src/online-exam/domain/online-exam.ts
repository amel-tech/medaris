/**
 * Online multiple-choice exams (MDRS-299): what the course team prepares on
 * nazar's exam page before an exam is published. The contract is
 * `graphs/domain/planned-exams.yaml`; the screens are `graphs/nazar/exams/edit`.
 *
 * Everything here is pure: the rules the service and the page share.
 */

/** "Tek seçim" (radio buttons) or "Çoklu seçim" (check boxes). */
export enum AnswerMode {
  SINGLE = "SINGLE",
  MULTIPLE = "MULTIPLE",
}

/** How a MULTIPLE question is scored: "Hepsi ya da hiç" or "Kesirli, yanlış düşer". */
export enum Scoring {
  ALL_OR_NOTHING = "ALL_OR_NOTHING",
  IN_SHARES = "IN_SHARES",
}

/** A new draft's length, "Süre (dakika)"; there is no upper bound (the owner: "Sınır yok"). */
export const ONLINE_EXAM_DEFAULT_MINUTES = 60;
/** The longest title, instructions, zeroth question and its options, question text and option, in characters. */
export const ONLINE_EXAM_TITLE_MAX = 200;
export const ONLINE_EXAM_INSTRUCTIONS_MAX = 4000;
export const ZEROTH_QUESTION_MAX = 1000;
export const ZEROTH_OPTION_MAX = 300;
/** A medrese's zeroth question offers at least two options and at most ten. */
export const ZEROTH_OPTIONS_MIN = 2;
export const ZEROTH_OPTIONS_MAX = 10;
export const QUESTION_TEXT_MAX = 4000;
export const OPTION_TEXT_MAX = 1000;
/** The number of questions suggested, never a limit ("50/50 soru"). */
export const QUESTIONS_SUGGESTED = 50;

/** A topic is one to three words (the owner), at most this many characters. */
export const TOPIC_NAME_MAX = 60;
export const TOPIC_WORDS_MAX = 3;
/** A topic's number in its course (the owner, 22 Nov 2026: typed to pick it). */
export const TOPIC_NUMBER_MAX = 999;

/** The points of an exam, in hundredths: 100 points. */
export const TOTAL_HUNDREDTHS = 10_000;

/** A topic name as typed, with its spaces collapsed. */
export const topicNameOf = (name: string): string =>
  name.trim().replace(/\s+/g, " ");

/** The key two names are the same by: Turkish lower case, so "İcma" and "icma" clash. */
export const topicNameKey = (name: string): string =>
  topicNameOf(name).toLocaleLowerCase("tr-TR");

export const topicWordCount = (name: string): number =>
  topicNameOf(name) === "" ? 0 : topicNameOf(name).split(" ").length;

/** The smallest number from 1 up that no topic of the course holds. */
export const nextFreeTopicNumber = (taken: Iterable<number>): number => {
  const held = new Set(taken);
  let n = 1;
  while (held.has(n)) n += 1;
  return n;
};

/** What a question still lacks before it counts as complete, in the order the form shows the fields. */
export type QuestionLack = "text" | "option" | "correct" | "topic";

export interface QuestionShape {
  text: string;
  options: Array<{ text: string; correct: boolean }>;
  topicIds: readonly string[];
}

/** A question is complete with its text, two options at least, one correct at least and a topic. */
export const lacksOf = (q: QuestionShape): QuestionLack[] => {
  const lacks: QuestionLack[] = [];
  if (q.text.trim() === "") lacks.push("text");
  if (q.options.length < 2) lacks.push("option");
  if (!q.options.some((o) => o.correct)) lacks.push("correct");
  if (q.topicIds.length === 0) lacks.push("topic");
  return lacks;
};

/**
 * Whether the answer mode and its scoring fit the options: check boxes
 * (MULTIPLE) only with two correct options or more, and a scoring only with
 * check boxes, where one is required. Radio buttons fit any number of
 * correct options: any correct choice gets the points.
 */
export const modeFits = (
  mode: AnswerMode,
  scoring: Scoring | null,
  correctCount: number
): boolean =>
  mode === AnswerMode.MULTIPLE
    ? correctCount >= 2 && scoring !== null
    : scoring === null;

/**
 * Points as typed ("12", "12,5", "12.50") in hundredths; null when it is not
 * a number with at most two decimals from 0.01 to 100.
 */
export const pointsFromText = (text: string): number | null => {
  const m = /^([0-9]{1,3})(?:[.,]([0-9]{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const hundredths =
    Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  return hundredths >= 1 && hundredths <= TOTAL_HUNDREDTHS ? hundredths : null;
};

/** Hundredths as the API writes points: "12.50". */
export const pointsText = (hundredths: number): string =>
  `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;

export interface PointsShare {
  /** Each question's points in exact hundredths: own, or its share as a fraction. */
  points: Map<string, { numerator: number; denominator: number; own: boolean }>;
  /** What the questions with no points of their own share, in hundredths. */
  left: number;
  /** How many questions share it. */
  sharing: number;
}

/**
 * The points of every question (decision 4): its own, or an equal share of
 * what the own points leave of 100, kept exact as a fraction.
 */
export const sharePoints = (
  questions: ReadonlyArray<{ id: string; ownHundredths: number | null }>
): PointsShare => {
  const own = questions.reduce((sum, q) => sum + (q.ownHundredths ?? 0), 0);
  const sharing = questions.filter((q) => q.ownHundredths === null).length;
  const left = TOTAL_HUNDREDTHS - own;
  const points = new Map<
    string,
    { numerator: number; denominator: number; own: boolean }
  >();
  for (const q of questions) {
    points.set(
      q.id,
      q.ownHundredths === null
        ? {
            numerator: Math.max(left, 0),
            denominator: Math.max(sharing, 1),
            own: false,
          }
        : { numerator: q.ownHundredths, denominator: 1, own: true }
    );
  }
  return { points, left, sharing };
};

/** An exact share in points with two decimals, rounded half up: 10000/3 hundredths is "33.33". */
export const shareText = (p: {
  numerator: number;
  denominator: number;
}): string =>
  pointsText(
    Math.floor((2 * p.numerator + p.denominator) / (2 * p.denominator))
  );

/**
 * Whether own points fit: their sum is at most 100, and when some questions
 * share, something is left for them. `left` is what may still be given.
 */
export const pointsFit = (
  questions: ReadonlyArray<{ ownHundredths: number | null }>
): { fits: boolean; left: number } => {
  const own = questions.reduce((sum, q) => sum + (q.ownHundredths ?? 0), 0);
  const sharing = questions.some((q) => q.ownHundredths === null);
  const left = TOTAL_HUNDREDTHS - own;
  return { fits: sharing ? left > 0 : left >= 0, left };
};

// ----- publishing ------------------------------------------------------------------------------

/**
 * The latest start the page fills in: the earliest plus ten minutes. Those
 * who asked for exams, relayed on 22 Nov 2026: "'sınava en geç başlama
 * saati' de defaultta 10 dakika sonra olacak".
 */
export const LATEST_START_DEFAULT_MINUTES = 10;

/** What keeps an exam from being published, in the order the page lists them. */
export type PublishProblem =
  | { kind: "NO_QUESTION" }
  | { kind: "QUESTION"; number: number; lacks: QuestionLack[] }
  | { kind: "POINTS"; total: string }
  | { kind: "NO_ZEROTH" };

/**
 * An exam is published with one question at least, every question complete,
 * points that total 100 and its madrasah's zeroth question. `pointsTotal` is
 * the total as the draft reads it ("100.00").
 */
export const publishProblems = (exam: {
  questions: ReadonlyArray<QuestionShape>;
  pointsTotal: string;
  hasZeroth: boolean;
}): PublishProblem[] => {
  const problems: PublishProblem[] = [];
  if (exam.questions.length === 0) problems.push({ kind: "NO_QUESTION" });
  exam.questions.forEach((q, i) => {
    const lacks = lacksOf(q);
    if (lacks.length > 0) {
      problems.push({ kind: "QUESTION", number: i + 1, lacks });
    }
  });
  if (
    exam.questions.length > 0 &&
    exam.pointsTotal !== pointsText(TOTAL_HUNDREDTHS)
  ) {
    problems.push({ kind: "POINTS", total: exam.pointsTotal });
  }
  if (!exam.hasZeroth) problems.push({ kind: "NO_ZEROTH" });
  return problems;
};

/** The minute an instant falls in: the celse's time has no seconds. */
export const toMinute = (at: Date): Date =>
  new Date(Math.floor(at.getTime() / 60_000) * 60_000);

/** Why a start cannot be published; null when it can. */
export type PublishTimeProblem = "START_PASSED" | "LATEST_BEFORE_START";

/**
 * The earliest start is this minute or later, and the latest start is not
 * before it. Both are whole minutes (`toMinute`).
 */
export const publishTimeProblem = (
  startsAt: Date,
  latestStartAt: Date,
  now: Date
): PublishTimeProblem | null => {
  if (startsAt.getTime() < toMinute(now).getTime()) return "START_PASSED";
  if (latestStartAt.getTime() < startsAt.getTime()) {
    return "LATEST_BEFORE_START";
  }
  return null;
};

export type OnlineExamStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";

/**
 * Where an exam stands: a draft until it is published; scheduled until its
 * celse starts; open until the last who may start, starting at the latest
 * start, has used the whole time; closed after that, or once closed early.
 */
export const examStatus = (
  exam: {
    publishedAt: Date | null;
    closedEarlyAt: Date | null;
    startsAt: Date | null;
    latestStartAt: Date | null;
    durationMinutes: number;
  },
  now: Date
): OnlineExamStatus => {
  if (exam.closedEarlyAt) return "CLOSED";
  if (!exam.publishedAt || !exam.startsAt) return "DRAFT";
  if (now.getTime() < exam.startsAt.getTime()) return "SCHEDULED";
  const lastEnd =
    (exam.latestStartAt ?? exam.startsAt).getTime() +
    exam.durationMinutes * 60_000;
  return now.getTime() < lastEnd ? "OPEN" : "CLOSED";
};
