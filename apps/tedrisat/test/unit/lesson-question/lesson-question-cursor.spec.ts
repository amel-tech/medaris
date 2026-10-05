import { InvalidQuestionCursorError } from "../../../src/lesson-question/errors/invalid-question-cursor.error";
import {
  decodeQuestionCursor,
  encodeQuestionCursor,
} from "../../../src/lesson-question/lesson-question-cursor";

const ID = "e1510000-0000-4000-8000-000000000001";
const encode = (text: string) => Buffer.from(text).toString("base64url");

describe("question cursor (MDRS-150)", () => {
  it.each([
    [true, "2026-10-01 08:00:00.123456+00"],
    [false, "2026-10-01 11:00:00+03"],
  ])("round-trips a position (answered %s)", (answered, createdAt) => {
    const cursor = { answered, createdAt, id: ID };
    expect(decodeQuestionCursor(encodeQuestionCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ["empty", ""],
    ["no separator", encode("hello")],
    ["a flag that is not 0 or 1", encode(`2|2026-10-01 08:00:00+00|${ID}`)],
    ["a time that is not a timestamp", encode(`0|yesterday|${ID}`)],
    ["an id that is not a uuid", encode("0|2026-10-01 08:00:00+00|nope")],
    ["a fourth part", encode(`0|2026-10-01 08:00:00+00|${ID}|x`)],
  ])("refuses a cursor with %s", (_what, raw) => {
    expect(() => decodeQuestionCursor(raw)).toThrow(InvalidQuestionCursorError);
  });
});
