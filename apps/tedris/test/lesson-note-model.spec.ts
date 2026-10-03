import { describe, expect, it } from "vitest";
import {
  canWriteNotes,
  formatOffset,
  LESSON_NOTE_OFFSET_MAX,
  parseOffset,
  sortNotes,
} from "~/features/courses/lesson-note-model";
import { playerApiUrlOf } from "~/features/courses/recordings-model";

describe("a note's time", () => {
  it("is written as minutes and seconds, with hours only when there are some", () => {
    expect(formatOffset(0)).toBe("0:00");
    expect(formatOffset(59)).toBe("0:59");
    expect(formatOffset(754)).toBe("12:34");
    expect(formatOffset(3600)).toBe("1:00:00");
    expect(formatOffset(3723)).toBe("1:02:03");
    expect(formatOffset(LESSON_NOTE_OFFSET_MAX)).toBe("99:59:59");
  });

  it("is read back from digits, minutes:seconds and hours:minutes:seconds", () => {
    expect(parseOffset("754")).toEqual({ ok: true, seconds: 754 });
    expect(parseOffset("12:34")).toEqual({ ok: true, seconds: 754 });
    expect(parseOffset("1:02:03")).toEqual({ ok: true, seconds: 3723 });
    expect(parseOffset(" 0:05 ")).toEqual({ ok: true, seconds: 5 });
    expect(parseOffset("75:00")).toEqual({ ok: true, seconds: 4500 });
  });

  it("is empty when nothing is typed", () => {
    expect(parseOffset("")).toEqual({ ok: true, seconds: null });
    expect(parseOffset("   ")).toEqual({ ok: true, seconds: null });
  });

  it.each([
    "abc",
    "-5",
    "1.5",
    "12:60",
    "1:60:00",
    "1:00:60",
    "1:2:3:4",
    "12:",
    ":30",
    "999999",
    "100:00:00",
  ])("refuses %s", (text) => {
    expect(parseOffset(text)).toEqual({ ok: false });
  });

  it("round-trips whatever it writes", () => {
    for (const seconds of [0, 1, 59, 60, 754, 3599, 3600, 3723, 86_399]) {
      expect(parseOffset(formatOffset(seconds))).toEqual({
        ok: true,
        seconds,
      });
    }
  });
});

describe("the order of the notes", () => {
  const note = (id: string, offsetSeconds: number | null, at: number) => ({
    id,
    offsetSeconds,
    createdAt: new Date(at),
  });

  it("is by position, then without one, each oldest first", () => {
    const sorted = sortNotes([
      note("none-late", null, 30),
      note("far", 600, 10),
      note("none-early", null, 20),
      note("near", 5, 40),
      note("far-twin", 600, 5),
    ]);
    expect(sorted.map((n) => n.id)).toEqual([
      "near",
      "far-twin",
      "far",
      "none-early",
      "none-late",
    ]);
  });

  it("leaves the list it was given alone", () => {
    const list = [note("b", 9, 1), note("a", 1, 2)];
    sortNotes(list);
    expect(list.map((n) => n.id)).toEqual(["b", "a"]);
  });
});

describe("who may write", () => {
  it("is an enrolled or a completed talebe, and no one else", () => {
    expect(canWriteNotes("ENROLLED")).toBe(true);
    expect(canWriteNotes("COMPLETED")).toBe(true);
    expect(canWriteNotes("PENDING")).toBe(false);
    expect(canWriteNotes("REVOKED")).toBe(false);
    expect(canWriteNotes(undefined)).toBe(false);
    expect(canWriteNotes(null)).toBe(false);
  });
});

describe("the player API address", () => {
  it("switches the API on for a YouTube embed only", () => {
    expect(
      playerApiUrlOf("https://www.youtube-nocookie.com/embed/ybHyHDBiRoE")
    ).toBe("https://www.youtube-nocookie.com/embed/ybHyHDBiRoE?enablejsapi=1");
    expect(
      playerApiUrlOf("https://drive.google.com/file/d/abc123/preview")
    ).toBe("https://drive.google.com/file/d/abc123/preview");
    expect(playerApiUrlOf(null)).toBeNull();
  });
});
