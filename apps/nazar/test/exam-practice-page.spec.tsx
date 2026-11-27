import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamsPage } from "~/features/online-exams/components/exams-page";
import { html, textOf, translatorFor } from "./server-render";

/**
 * "Çalışma Soruları" (MDRS-248) as the server renders it: the course's
 * çalışma setleri, asked for with `kind: PRACTICE`, with no results and no
 * zeroth question. The reads are stubbed.
 */
const asked: Array<{ method: string; request: unknown }> = [];
const sets = [
  {
    id: "s1",
    kind: "PRACTICE",
    title: "Kıyas tekrarı",
    questionCount: 4,
    status: "OPEN",
    startsAt: null,
    updatedAt: new Date("2026-11-27T08:00:00Z"),
  },
  {
    id: "s2",
    kind: "PRACTICE",
    title: "Tarifler",
    questionCount: 0,
    status: "DRAFT",
    startsAt: null,
    updatedAt: new Date("2026-11-27T07:00:00Z"),
  },
];
const record =
  (method: string, answer: unknown) => async (request: unknown) => {
    asked.push({ method, request });
    return answer;
  };
const api = {
  onlineExams: {
    listOnlineExams: record("listOnlineExams", sets),
    getCourseZerothQuestion: record("getCourseZerothQuestion", {
      own: null,
      madrasah: null,
    }),
  },
  courses: {
    getMyCoursePermissions: record("getMyCoursePermissions", {
      permissions: ["course.view", "exam.prepare"],
    }),
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => translatorFor(namespace),
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: vi.fn() }),
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (
    _what: string,
    call: (a: typeof api) => Promise<unknown>
  ) => ({
    status: "ok",
    data: await call(api),
  }),
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/online-exams/actions", () => ({
  createOnlineExam: vi.fn(),
  saveCourseZerothQuestion: vi.fn(),
  removeCourseZerothQuestion: vi.fn(),
}));

afterEach(() => {
  asked.length = 0;
});

describe("Çalışma Soruları (MDRS-248)", () => {
  it("lists the course's sets with their state and question count", async () => {
    const markup = await html(<ExamsPage courseId="c1" kind="PRACTICE" />);
    const text = textOf(markup);
    expect(text).toContain("Çalışma Soruları");
    expect(text).toContain(
      "Talebeler bu soruları süre sınırı olmadan, istedikleri zaman çözebilir."
    );
    expect(text).toContain("Yeni çalışma seti");
    expect(text).toContain("Kıyas tekrarı 4 soru Yayında");
    expect(text).toContain("Tarifler 0 soru Taslak");
    expect(markup).toContain('href="/ders/c1/calisma-sorulari/s1"');
    // A set has no results and no zeroth question.
    expect(markup).not.toContain("/sonuclar");
    expect(asked.map((a) => a.method)).not.toContain("getCourseZerothQuestion");
    expect(asked).toContainEqual({
      method: "listOnlineExams",
      request: { id: "c1", kind: "PRACTICE" },
    });
  });

  it("leaves Sınavlar asking for the exams only", async () => {
    await html(<ExamsPage courseId="c1" />);
    expect(asked).toContainEqual({
      method: "listOnlineExams",
      request: { id: "c1" },
    });
  });
});
