import { describe, expect, it } from "vitest";
import {
  TEACHER_NOTE_MAX,
  teacherNoteBody,
  teacherNoteChanged,
  teacherNoteLength,
  teacherNoteTooLong,
} from "~/features/teacher-note/teacher-note";

describe("teacherNoteBody", () => {
  it("sends a note of only whitespace as null, which removes it", () => {
    expect(teacherNoteBody("")).toBeNull();
    expect(teacherNoteBody(" \n\t ")).toBeNull();
  });

  it("trims the tail only: leading whitespace is Markdown's", () => {
    expect(teacherNoteBody("    girinti\n\n")).toBe("    girinti");
    expect(teacherNoteBody("## Mâzî\n- نَصَرَ")).toBe("## Mâzî\n- نَصَرَ");
  });
});

describe("the length the API counts", () => {
  it("is the trimmed body's, so trailing blank lines never refuse a note", () => {
    const full = "x".repeat(TEACHER_NOTE_MAX);
    expect(teacherNoteLength(`${full}\n\n`)).toBe(TEACHER_NOTE_MAX);
    expect(teacherNoteTooLong(`${full}\n\n`)).toBe(false);
    expect(teacherNoteTooLong(`${full}x`)).toBe(true);
    expect(teacherNoteLength("   ")).toBe(0);
  });
});

describe("teacherNoteChanged", () => {
  it("compares what would be sent with what is kept", () => {
    expect(teacherNoteChanged("", null)).toBe(false);
    expect(teacherNoteChanged("  \n", null)).toBe(false);
    expect(teacherNoteChanged("not", null)).toBe(true);
    expect(teacherNoteChanged("not\n", "not")).toBe(false);
    expect(teacherNoteChanged("", "not")).toBe(true);
  });
});
