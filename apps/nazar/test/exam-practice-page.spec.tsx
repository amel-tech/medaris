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
  practice: {
    listPracticeSetStats: record("listPracticeSetStats", [
      { setId: "s1", talebeCount: 3, attemptCount: 5, averagePercent: "72.50" },
    ]),
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
  useFormatter: () => ({
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat("tr", options).format(value),
  }),
}));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: vi.fn() }),
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (
    _what: string,
    call: (a: typeof api) => Promise<unknown>
  ) => {
    try {
      return { status: "ok", data: await call(api) };
    } catch {
      return { status: "failed" };
    }
  },
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
    // A table: one-word headers, then one row per set, drafts first.
    expect(markup).toContain("<table");
    expect(text).toContain("Set Durum Soru Talebe Çözülme Ortalama");
    expect(text).toContain("Tarifler Taslak 0 — Yok — Yok — Yok");
    // How a published set was solved, its average a whole percentage.
    expect(text).toContain("Kıyas tekrarı Yayında 4 3 5 %73");
    expect(text.indexOf("Tarifler")).toBeLessThan(
      text.indexOf("Kıyas tekrarı")
    );
    expect(asked).toContainEqual({
      method: "listPracticeSetStats",
      request: { id: "c1" },
    });
    expect(markup).toContain('href="/ders/c1/calisma-sorulari/s1"');
    // A set has no results and no zeroth question.
    expect(markup).not.toContain("/sonuclar");
    expect(asked.map((a) => a.method)).not.toContain("getCourseZerothQuestion");
    expect(asked).toContainEqual({
      method: "listOnlineExams",
      request: { id: "c1", kind: "PRACTICE" },
    });
  });

  it("shows a dash for a published set nobody solved yet", async () => {
    const before = api.practice.listPracticeSetStats;
    api.practice.listPracticeSetStats = record("listPracticeSetStats", []);
    let text: string;
    try {
      text = textOf(await html(<ExamsPage courseId="c1" kind="PRACTICE" />));
    } finally {
      api.practice.listPracticeSetStats = before;
    }
    expect(text).toContain("Kıyas tekrarı Yayında 4 — Yok — Yok — Yok");
    expect(text).not.toContain("Çözülme sayıları şu an okunamadı.");
  });

  it("keeps the table and says so when the figures cannot be read", async () => {
    const before = api.practice.listPracticeSetStats;
    api.practice.listPracticeSetStats = async () => {
      throw new Error("down");
    };
    let text: string;
    try {
      text = textOf(await html(<ExamsPage courseId="c1" kind="PRACTICE" />));
    } finally {
      api.practice.listPracticeSetStats = before;
    }
    expect(text).toContain("Çözülme sayıları şu an okunamadı.");
    expect(text).toContain("Kıyas tekrarı Yayında 4 — Yok");
  });

  it("says there is no set yet, and how to open one", async () => {
    const before = api.onlineExams.listOnlineExams;
    api.onlineExams.listOnlineExams = record("listOnlineExams", []);
    let markup: string;
    try {
      markup = await html(<ExamsPage courseId="c1" kind="PRACTICE" />);
    } finally {
      api.onlineExams.listOnlineExams = before;
    }
    expect(markup).not.toContain("<table");
    expect(textOf(markup)).toContain(
      "Henüz çalışma seti yok. Yukarıya adını yazıp ilk seti açın."
    );
  });

  it("leaves Sınavlar asking for the exams only", async () => {
    await html(<ExamsPage courseId="c1" />);
    expect(asked.map((a) => a.method)).not.toContain("listPracticeSetStats");
    expect(asked).toContainEqual({
      method: "listOnlineExams",
      request: { id: "c1" },
    });
  });
});
