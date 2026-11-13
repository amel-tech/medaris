import { describe, expect, it } from "vitest";
import { lessonCalendarSummary } from "../../../src/course/calendar/lesson-calendar";
import { isScoreInRange } from "../../../src/course/domain/exam";
import { buildExamReminderMail } from "../../../src/exam/exam-reminder-mail";

/** "Ara sınav" (MDRS-248): the pure parts — the score bound, the calendar title and the reminder mail. */
describe("exams", () => {
  it("takes a whole score from 0 to tam puan, nothing else", () => {
    expect(isScoreInRange(0, 100)).toBe(true);
    expect(isScoreInRange(100, 100)).toBe(true);
    expect(isScoreInRange(101, 100)).toBe(false);
    expect(isScoreInRange(-1, 100)).toBe(false);
    expect(isScoreInRange(50.5, 100)).toBe(false);
    expect(isScoreInRange(21, 20)).toBe(false);
  });

  it("marks an exam's calendar title in the reader's language", () => {
    expect(lessonCalendarSummary("Sarf", "Ara sınav")).toBe("Sarf — Ara sınav");
    expect(lessonCalendarSummary("Sarf", "Birinci bab", { locale: "tr" })).toBe(
      "Sarf — Sınav: Birinci bab"
    );
    expect(lessonCalendarSummary("Sarf", "Birinci bab", { locale: "en" })).toBe(
      "Sarf — Exam: Birinci bab"
    );
  });

  it("writes the reminder with the page and no HTML from the titles", () => {
    const mail = buildExamReminderMail({
      locale: "tr",
      courseTitle: "Sarf <b>",
      lessonTitle: "Ara sınav",
      startsAt: new Date("2026-12-01T07:00:00Z"),
      timeZone: "Europe/Istanbul",
      sessionPageUrl: "https://tedris.example/courses/c/lessons/l",
      accountUrl: "https://tedris.example/account",
    });
    expect(mail.subject).toBe("Sınav yarın: Sarf <b> — Ara sınav");
    expect(mail.text).toContain("https://tedris.example/courses/c/lessons/l");
    expect(mail.html).toContain("Sarf &lt;b&gt;");
    expect(mail.html).not.toContain("<b>");
    const ar = buildExamReminderMail({
      locale: "ar",
      courseTitle: "صرف",
      lessonTitle: "اختبار",
      startsAt: new Date("2026-12-01T07:00:00Z"),
      timeZone: "Europe/Istanbul",
      sessionPageUrl: "https://tedris.example/x",
      accountUrl: "https://tedris.example/account",
    });
    expect(ar.html).toContain('dir="rtl"');
  });
});
