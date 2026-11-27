// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { OnlineExamDraftResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamWorkspace } from "~/features/online-exams/components/exam-workspace";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const actions = {
  addExamQuestion: vi.fn(),
  saveExamQuestion: vi.fn(),
  removeExamQuestion: vi.fn(),
  createCourseTopic: vi.fn(),
  createOnlineExam: vi.fn(),
  publishOnlineExam: vi.fn(),
  unpublishOnlineExam: vi.fn(),
};
vi.mock("~/features/online-exams/actions", () => ({
  addExamQuestion: (...a: unknown[]) => actions.addExamQuestion(...a),
  saveExamQuestion: (...a: unknown[]) => actions.saveExamQuestion(...a),
  removeExamQuestion: (...a: unknown[]) => actions.removeExamQuestion(...a),
  createCourseTopic: (...a: unknown[]) => actions.createCourseTopic(...a),
  createOnlineExam: (...a: unknown[]) => actions.createOnlineExam(...a),
  publishOnlineExam: (...a: unknown[]) => actions.publishOnlineExam(...a),
  unpublishOnlineExam: (...a: unknown[]) => actions.unpublishOnlineExam(...a),
}));

const question = {
  id: "q1",
  number: 1,
  text: "Kıyasın rükünleri kaç tanedir?",
  options: [
    { id: "o1", text: "Üç", correct: false },
    { id: "o2", text: "Dört", correct: true },
  ],
  answerMode: "SINGLE",
  scoring: null,
  topicIds: ["t3"],
  ownPoints: null,
  points: "100.00",
  complete: true,
  lacks: [],
};
const ready = {
  id: "e1",
  courseId: "c1",
  title: "Ara sınav",
  durationMinutes: 60,
  instructions: null,
  zerothQuestion: "",
  zerothOptions: [],
  courseTopics: [
    { id: "t3", number: 3, name: "Kıyas", picked: true, questionCount: 1 },
  ],
  topicIds: ["t3"],
  questions: [question],
  pointsTotal: "100.00",
  status: "DRAFT",
  startsAt: null,
  latestStartAt: null,
  problems: [],
  version: 3,
} as unknown as OnlineExamDraftResponse;
const scheduled = (startsAt: string, latestStartAt: string) =>
  ({
    ...ready,
    status: "SCHEDULED",
    startsAt,
    latestStartAt,
    version: 4,
  }) as unknown as OnlineExamDraftResponse;

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);
const page = (draft: OnlineExamDraftResponse) =>
  render(
    wrap(
      <ExamWorkspace
        courseId="c1"
        draft={draft}
        timeZone="Europe/Istanbul"
        locale="tr"
      />
    )
  );
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;
const dialog = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement;
const minutesField = () => {
  const label = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.startsWith("Geç kalanlar kaç dakika")
  ) as HTMLLabelElement;
  return (document.getElementById(label.htmlFor) ??
    label.querySelector("input")) as HTMLInputElement;
};
const fieldsUnder = (legend: string) => {
  const set = [...document.querySelectorAll("fieldset")].find(
    (f) => f.querySelector("legend")?.textContent === legend
  ) as HTMLFieldSetElement;
  const [date, time] = [...set.querySelectorAll("input")];
  return { date, time };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-30T09:20:00Z"));
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("publishing an online exam (MDRS-299)", () => {
  it("schedules it at the day and time chosen, the latest start ten minutes later", async () => {
    actions.publishOnlineExam.mockImplementation(async (_id, input) => ({
      success: true,
      data: scheduled(
        input.startsAt,
        new Date(
          new Date(input.startsAt).getTime() + input.latestStartMinutes * 60_000
        ).toISOString()
      ),
    }));
    const root = await page(ready);
    const earliest = fieldsUnder("En erken başlama");
    // The next whole hour on the viewer's clock, and ten minutes after it.
    expect([earliest.date.value, earliest.time.value]).toEqual([
      "2026-11-30",
      "13:00",
    ]);
    await typeInto(earliest.date, "2026-12-02");
    await typeInto(earliest.time, "20:00");
    // Ten minutes for late starters, and the time they come to.
    expect(minutesField().value).toBe("10");
    expect(root.textContent).toContain("20:10 saatine kadar başlayabilir");

    await click(button(root, "Zamanla"));
    await settle(80);
    expect(dialog().textContent).toContain(
      "Talebeler 60 dakikalık, 1 soruluk bir sınav görecek."
    );
    await click(button(dialog(), "Zamanla"));
    await settle(80);
    expect(actions.publishOnlineExam).toHaveBeenCalledWith("e1", {
      version: 3,
      startsAt: "2026-12-02T17:00:00.000Z",
      latestStartMinutes: 10,
    });
    // The published exam, with no read of the page.
    expect(root.textContent).toContain("Zamanlandı");
    expect(root.textContent).toContain("Açılış: 2 Aralık 2026 20:00");
    expect(button(root, "Taslağa al")).toBeTruthy();
    expect(button(root, "Soru ekle")).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("publishes now with the late window counted from the press, twenty minutes when the hoca says so", async () => {
    actions.publishOnlineExam.mockImplementation(async () => ({
      success: true,
      data: scheduled("2026-11-30T09:32:00.000Z", "2026-11-30T09:52:00.000Z"),
    }));
    const root = await page(ready);
    const now = [...root.querySelectorAll("[role=radio]")].find(
      (r) =>
        document.getElementById(r.getAttribute("aria-labelledby") ?? "")
          ?.textContent === "Şimdi yayınla" ||
        r.closest("label")?.textContent?.includes("Şimdi yayınla")
    ) as HTMLElement;
    await click(now);
    await settle(20);
    await typeInto(minutesField(), "20");
    // 12:20 in Istanbul, and twenty minutes after it if published now.
    expect(root.textContent).toContain("12:40 saatine kadar");
    // The hoca reads it over for twelve minutes before pressing.
    vi.setSystemTime(new Date("2026-11-30T09:32:00Z"));
    await click(button(root, "Yayınla"));
    await settle(80);
    await click(button(dialog(), "Yayınla"));
    await settle(80);
    // No start: the server opens it at its own now and counts twenty from there.
    expect(actions.publishOnlineExam).toHaveBeenCalledWith("e1", {
      version: 3,
      latestStartMinutes: 20,
    });
  });

  it("lists what keeps it from being published, and offers no button", async () => {
    const root = await page({
      ...ready,
      questions: [
        {
          ...question,
          options: [],
          complete: false,
          lacks: ["option", "correct"],
        },
      ],
      durationMinutes: null,
      problems: [{ kind: "NO_DURATION" }, { kind: "NO_ZEROTH" }],
    } as unknown as OnlineExamDraftResponse);
    expect(root.textContent).toContain("Sınav henüz yayınlanamaz");
    expect(root.textContent).toContain(
      'Sınavın süresi girilmedi: Ayarlar\'daki "Süre (dakika)" alanına yazılır.'
    );
    expect(root.textContent).toContain("1. sorunun en az iki şıkkı olmalı.");
    expect(root.textContent).toContain(
      "1. sorunun doğru şıkkı işaretli değil."
    );
    expect(root.textContent).toContain(
      "Sıfırıncı soru yok: Sınavlar sayfasından bu ders için yazılabilir"
    );
    expect(button(root, "Zamanla")).toBeUndefined();
  });

  it("refuses a late window of no minutes, and sends nothing", async () => {
    const root = await page(ready);
    await typeInto(minutesField(), "0");
    await click(button(root, "Zamanla"));
    await settle(80);
    expect(root.textContent).toContain("1 ile 10080 arasında bir dakika yaz.");
    expect(dialog()).toBeNull();
    expect(actions.publishOnlineExam).not.toHaveBeenCalled();
  });

  it("takes a scheduled exam back to a draft, and gives the editor back", async () => {
    actions.unpublishOnlineExam.mockResolvedValue({
      success: true,
      data: { ...ready, version: 5 },
    });
    const root = await page(
      scheduled("2026-12-02T17:00:00.000Z", "2026-12-02T17:10:00.000Z")
    );
    await click(button(root, "Taslağa al"));
    await settle(80);
    await click(button(dialog(), "Taslağa al"));
    await settle(80);
    expect(actions.unpublishOnlineExam).toHaveBeenCalledWith("e1", 4);
    expect(button(root, "Soru ekle")).toBeTruthy();
  });

  it("offers no Taslağa al once the API calls the exam locked, and says why (MDRS-248)", async () => {
    const root = await page({
      ...scheduled("2026-12-02T17:00:00.000Z", "2026-12-02T17:10:00.000Z"),
      locked: true,
    } as unknown as OnlineExamDraftResponse);
    expect(root.textContent).toContain(
      "Celse başladı; sınav artık taslağa alınamaz."
    );
    expect(button(root, "Taslağa al")).toBeUndefined();
  });
});
