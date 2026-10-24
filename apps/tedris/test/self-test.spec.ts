import { describe, expect, it } from "vitest";
import {
  markCard,
  ratingFor,
  retryMissed,
  startSelfTest,
  summarize,
} from "~/features/courses/self-test";

describe("Kendini sına", () => {
  it("starts with every card in play and none marked", () => {
    const test = startSelfTest(["a", "b", "c"]);
    expect(summarize(test)).toEqual({
      total: 3,
      marked: 0,
      known: 0,
      missed: [],
      done: false,
    });
  });

  it("counts the marks, and is done when every card is marked", () => {
    let test = startSelfTest(["a", "b", "c"]);
    test = markCard(test, "a", "known");
    test = markCard(test, "b", "missed");
    expect(summarize(test)).toMatchObject({ marked: 2, done: false });
    test = markCard(test, "c", "known");
    expect(summarize(test)).toEqual({
      total: 3,
      marked: 3,
      known: 2,
      missed: ["b"],
      done: true,
    });
  });

  it("keeps a card's first mark, and ignores a card outside the round", () => {
    let test = startSelfTest(["a"]);
    test = markCard(test, "a", "missed");
    test = markCard(test, "a", "known");
    test = markCard(test, "z", "known");
    expect(test.marks).toEqual({ a: "missed" });
  });

  it("starts the next round with the missed cards alone, unmarked", () => {
    let test = startSelfTest(["a", "b", "c"]);
    test = markCard(test, "a", "missed");
    test = markCard(test, "b", "known");
    test = markCard(test, "c", "missed");
    expect(retryMissed(test)).toEqual({ round: ["a", "c"], marks: {} });
  });

  it("is never done with an empty round", () => {
    expect(summarize(startSelfTest([])).done).toBe(false);
  });

  it("rates a missed card hard and a known one easy", () => {
    expect(ratingFor("missed")).toBe("HARD");
    expect(ratingFor("known")).toBe("EASY");
  });
});
