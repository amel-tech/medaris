import { resources } from "@medaris/i18n";
import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const lookup = (key: string, values?: Record<string, unknown>) => {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
  return Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    text
  );
};
vi.mock("next-intl/server", () => ({
  getTranslations: async () => lookup,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));

const NOW = new Date("2026-10-03T17:52:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const lesson = (id: string, over: Partial<LessonResponse>): LessonResponse =>
  ({
    id,
    weekId: "w",
    title: id,
    type: "LIVE",
    durationMinutes: 45,
    scheduledAt: at(60),
    isPreview: false,
    orderIndex: 0,
    cancelledAt: null,
    replacementLessonId: null,
    ...over,
  }) as LessonResponse;

const week = (
  weekNumber: number,
  title: string,
  ...lessons: LessonResponse[]
): WeekResponse =>
  ({
    id: `week-${weekNumber}`,
    courseId: "c1",
    weekNumber,
    title,
    summary: null,
    orderIndex: weekNumber,
    lessons,
  }) as WeekResponse;

const course = {
  id: "c1",
  timeZone: "Europe/Istanbul",
  weeks: [
    week(
      4,
      "Mezîd fiiller",
      lesson("old", { title: "Eski celse", scheduledAt: at(-9000) })
    ),
    week(
      5,
      "Mehmûz fiiller",
      lesson("now", {
        title: "Mehmûz fiiller: kara’e ve emr-i hâzır",
        scheduledAt: at(8),
        durationMinutes: 60,
        kaynak: "Bina, s. 20–24",
      }),
      lesson("cancelled", {
        title: "Hafta sonu müzakeresi",
        scheduledAt: at(60 * 24),
        cancelledAt: NOW,
        replacementLessonId: "makeup",
      }),
      lesson("makeup", {
        title: "Hafta sonu müzakeresi (telafi)",
        scheduledAt: at(60 * 24 * 4),
      })
    ),
    week(
      6,
      "Muzâaf fiiller",
      lesson("later", { scheduledAt: new Date("2026-10-10T18:00:00Z") })
    ),
  ],
} as unknown as CourseDetailResponse;

const render = async (viewingId?: string) => {
  const { SessionProgramme } = await import(
    "~/features/courses/components/session-programme"
  );
  return renderToStaticMarkup(
    await SessionProgramme({ course, now: NOW, viewingId })
  );
};

/** Whether the week's trigger says its panel is open. */
const expanded = (html: string, weekTitle: string) => {
  const trigger = html
    .split("<button")
    .find((part) => part.includes(weekTitle));
  return trigger?.match(/aria-expanded="(true|false)"/)?.[1];
};

/** The `<li>` of one row, by its link. */
const row = (html: string, id: string) =>
  html
    .split("<li")
    .find((part) => part.includes(`href="/courses/c1/lessons/${id}"`)) ?? "";

describe("session page programme (design tedris/15, Müfredat)", () => {
  it("heads the block with the week count and badges each week by its state", async () => {
    const html = await render();
    expect(html).toContain("Müfredat");
    expect(html).toContain("3 hafta");
    expect(html).toContain('mds-badge--success">Sona erdi');
    expect(html).toContain("Devam ediyor");
  });

  it("counts the sessions that stand and their minutes, and dates a week still ahead", async () => {
    const html = await render();
    // the active week: two standing sessions, 60 + 45 minutes
    expect(html).toContain("2 celse");
    expect(html).toContain("105 dk");
    expect(html).toContain(
      '<time dateTime="2026-10-10">10 Ekim</time> tarihinde açılır'
    );
  });

  it("marks the next session, finished ones and the cancelled one", async () => {
    const html = await render();
    expect(html).toContain("Sıradaki");
    expect(html).toContain("is-done");
    expect(html).toContain('mds-badge--outline">İptal edildi');
    expect(html).toContain("Bina, s. 20–24");
  });

  it("links every row to its session page", async () => {
    const html = await render();
    for (const id of ["old", "now", "cancelled", "makeup", "later"]) {
      expect(html).toContain(`href="/courses/c1/lessons/${id}"`);
    }
  });

  it("marks the session being read as the page and opens its week (no viewing: the clock's week only)", async () => {
    const plain = await render();
    expect(plain).not.toContain('aria-current="page"');
    expect(expanded(plain, "Mehmûz fiiller")).toBe("true");
    expect(expanded(plain, "Muzâaf fiiller")).toBe("false");

    const html = await render("later");
    const later = row(html, "later");
    expect(later).toContain("is-viewing");
    expect(later).toContain('aria-current="page"');
    expect(later).toContain("Bu celse");
    expect(expanded(html, "Muzâaf fiiller")).toBe("true");
    // the clock's week stays open and its next session keeps its words
    expect(expanded(html, "Mehmûz fiiller")).toBe("true");
    const next = row(html, "now");
    expect(next).toContain('aria-current="step"');
    expect(next).toContain("Sıradaki");
    expect(next).not.toContain("is-viewing");
  });

  it("is both the page and the next session when the reader opens the next one", async () => {
    const now = row(await render("now"), "now");
    expect(now).toContain('aria-current="page"');
    expect(now).toContain("Bu celse");
    expect(now).toContain("Sıradaki");
  });
});
