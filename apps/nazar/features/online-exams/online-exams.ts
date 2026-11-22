import type { DraftCourseTopicResponse } from "@medaris/services/tedrisat";

/** The option fields a new question shows (the owner: five). */
export const OPTION_FIELDS = 5;

/** "3, 7" → the topics of those numbers, and the numbers no topic has. */
export function topicsByNumbers(
  text: string,
  topics: readonly DraftCourseTopicResponse[]
): { ids: string[]; unknown: number[] } {
  const ids: string[] = [];
  const unknown: number[] = [];
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const n = Number(part);
    const topic = topics.find((t) => t.number === n);
    if (!Number.isInteger(n) || !topic) unknown.push(n);
    else if (!ids.includes(topic.id)) ids.push(topic.id);
  }
  return { ids, unknown };
}

/** The topics' numbers as the field shows them: "3, 7". */
export const numbersOf = (
  ids: readonly string[],
  topics: readonly DraftCourseTopicResponse[]
): string =>
  topics
    .filter((t) => ids.includes(t.id))
    .map((t) => t.number)
    .join(", ");

/** The catalog key that words a refusal. */
export function onlineExamErrorKey(code: string): string {
  switch (code) {
    case "EXAM_STALE":
      return "OnlineExams.stale";
    case "TOPIC_EXISTS":
      return "OnlineExams.topicExists";
    case "TOPIC_NUMBER_TAKEN":
      return "OnlineExams.topicNumberTaken";
    case "TOPIC_TOO_LONG":
      return "OnlineExams.topicTooLong";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}

export type Lack = "text" | "option" | "correct" | "topic";

/** What a question still lacks, as the API says it (text, a second option, a correct one, a topic). */
export function lacksOf(q: {
  text: string;
  options: ReadonlyArray<{ text: string; correct: boolean }>;
  topicIds: readonly string[];
}): Lack[] {
  const lacks: Lack[] = [];
  if (q.text.trim() === "") lacks.push("text");
  if (q.options.length < 2) lacks.push("option");
  if (!q.options.some((o) => o.correct)) lacks.push("correct");
  if (q.topicIds.length === 0) lacks.push("topic");
  return lacks;
}

/** The smallest number from 1 up that no topic holds, as the API gives a new topic. */
export const nextFreeNumber = (taken: Iterable<number>): number => {
  const held = new Set(taken);
  let n = 1;
  while (held.has(n)) n += 1;
  return n;
};
