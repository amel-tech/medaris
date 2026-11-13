// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { MyGradesResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import {
  ExamBadge,
  examDaysLeft,
  MyGradesTab,
} from "~/features/courses/components/exam-grades";
import { describeNotification } from "~/features/notifications/notification-view";
import { cleanup, render, settle } from "./dom";

/**
 * "Ara sınav" on tedris (MDRS-248): the "Sınav" mark with its countdown and
 * "Notlarım", where a score shows only once tedrisat released it.
 */

const tr = resources.tr.tedris.CoursePage;
const ZONE = "Europe/Istanbul";

const mount = async (element: React.ReactElement) => {
  await render(
    <NextIntlClientProvider
      locale="tr"
      timeZone={ZONE}
      messages={{ tedris: resources.tr.tedris }}
    >
      {element}
    </NextIntlClientProvider>
  );
  await settle();
};

afterEach(async () => {
  await cleanup();
});

describe("the countdown", () => {
  const now = new Date("2026-11-13T09:00:00Z").getTime();
  it("counts calendar days in the course's zone, and stops once it begins", () => {
    expect(examDaysLeft("2026-11-13T15:00:00Z", now, ZONE)).toBe(0);
    expect(examDaysLeft("2026-11-14T07:00:00Z", now, ZONE)).toBe(1);
    expect(examDaysLeft("2026-11-16T07:00:00Z", now, ZONE)).toBe(3);
    expect(examDaysLeft("2026-11-13T08:00:00Z", now, ZONE)).toBeNull();
    expect(examDaysLeft(null, now, ZONE)).toBeNull();
  });

  it("marks an exam, a make-up, and the days left", async () => {
    await mount(
      <ExamBadge startsAt="2026-11-16T07:00:00Z" now={now} timeZone={ZONE} />
    );
    expect(document.body.textContent).toBe(`${tr.examBadge} · 3 gün kaldı`);
    await cleanup();
    await mount(<ExamBadge isRetake now={now} timeZone={ZONE} />);
    expect(document.body.textContent).toBe(tr.retakeBadge);
  });
});

describe("Notlarım", () => {
  const grades: MyGradesResponse = {
    exams: [
      {
        lessonId: "x-1",
        title: "Ara sınav",
        weekNumber: 4,
        scheduledAt: null,
        maxScore: 100,
        isRetake: false,
        released: true,
        score: 85,
        absent: false,
      },
      {
        lessonId: "x-2",
        title: "Telafi",
        weekNumber: 6,
        scheduledAt: null,
        maxScore: 20,
        isRetake: true,
        released: false,
        score: null,
        absent: null,
      },
    ],
    memorizations: [
      {
        lessonId: "m-1",
        title: "Emsile",
        weekNumber: 1,
        scheduledAt: null,
        status: "FULL",
      },
      {
        lessonId: "m-2",
        title: "Bina",
        weekNumber: 2,
        scheduledAt: null,
        status: null,
      },
    ],
  };

  it("shows a released score, says a closed one is not out, and the marks", async () => {
    await mount(<MyGradesTab grades={grades} />);
    const exams = [
      ...document.querySelectorAll('[data-testid="grade-exam"]'),
    ].map((row) => row.textContent);
    expect(exams[0]).toContain("85/100");
    expect(exams[1]).toContain(tr.gradesClosed);
    expect(exams[1]).toContain(tr.retakeBadge);
    const marks = [
      ...document.querySelectorAll('[data-testid="grade-memorization"]'),
    ].map((row) => row.textContent);
    expect(marks[0]).toContain(tr.gradesFull);
    expect(marks[1]).toContain(tr.gradesPending);
  });

  it("says there is nothing yet when the course has neither", async () => {
    await mount(<MyGradesTab grades={{ exams: [], memorizations: [] }} />);
    expect(document.body.textContent).toContain(tr.gradesEmpty);
  });
});

describe("exam notifications", () => {
  it("are known types with their own sentence", () => {
    const t = (key: string) => key;
    for (const type of [
      "EXAM_SCHEDULED",
      "EXAM_REMINDER",
      "EXAM_RESULTS_RELEASED",
    ]) {
      const text = describeNotification(
        {
          id: "n",
          type,
          targetType: "SESSION",
          targetId: "l",
          params: { courseTitle: "Sarf", sessionAt: "2026-11-14T07:00:00Z" },
          readAt: null,
          createdAt: new Date(),
        } as never,
        { t, locale: "tr", timeZone: ZONE }
      );
      expect(text.title).toBe(`types.${type}.title`);
    }
  });
});
