import { InvalidQuestionCursorError } from "./errors/invalid-question-cursor.error";

/**
 * A position in a question list: the last row of the previous page.
 * `createdAt` is the database's own text of the timestamp, so no precision is
 * lost on the way through a JavaScript `Date`. `answered` only matters to the
 * staff list, which puts the questions still waiting first.
 */
export interface IQuestionCursor {
  answered: boolean;
  createdAt: string;
  id: string;
}

const UUID_TEXT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_TEXT =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$/;

/** Opaque to clients: base64url of `<0|1>|<created_at text>|<id>`. */
export const encodeQuestionCursor = (cursor: IQuestionCursor): string =>
  Buffer.from(
    `${cursor.answered ? 1 : 0}|${cursor.createdAt}|${cursor.id}`,
    "utf8"
  ).toString("base64url");

export const decodeQuestionCursor = (raw: string): IQuestionCursor => {
  const [answered, createdAt, id, ...rest] = Buffer.from(raw, "base64url")
    .toString("utf8")
    .split("|");
  if (
    rest.length > 0 ||
    (answered !== "0" && answered !== "1") ||
    !createdAt ||
    !TIMESTAMP_TEXT.test(createdAt) ||
    !id ||
    !UUID_TEXT.test(id)
  ) {
    throw new InvalidQuestionCursorError();
  }
  return { answered: answered === "1", createdAt, id };
};
