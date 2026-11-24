// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { OnlineExamResultsResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESULTS_REFRESH_MS,
  ResultsView,
} from "~/features/online-exams/components/results-view";
import { cleanup, click, render, settle } from "./dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

/** Server answers the test lets through when it wants. */
const held: Array<() => void> = [];
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => held.push(() => resolve(value)));
const actions = {
  readExamResults: vi.fn(),
  closeExamEarly: vi.fn(),
  releaseExamResults: vi.fn(),
};
vi.mock("~/features/online-exams/results-actions", () => ({
  readExamResults: (...a: unknown[]) => actions.readExamResults(...a),
  closeExamEarly: (...a: unknown[]) => actions.closeExamEarly(...a),
}));
vi.mock("~/features/evaluation/actions", () => ({
  releaseExamResults: (...a: unknown[]) => actions.releaseExamResults(...a),
}));

const results = (
  change: Partial<OnlineExamResultsResponse> = {}
): OnlineExamResultsResponse =>
  ({
    exam: {
      id: "e1",
      courseId: "c1",
      lessonId: "l1",
      title: "Ara sınav",
      durationMinutes: 30,
      startsAt: new Date("2026-11-28T17:00:00Z"),
      latestStartAt: new Date("2026-11-28T17:10:00Z"),
      closedEarlyAt: null,
      closed: false,
      mayClose: true,
    },
    talebe: [
      {
        userId: "u1",
        name: "Zeynep Örnek",
        state: "IN_PROGRESS",
        startedAt: new Date("2026-11-28T17:02:00Z"),
        finishedAt: null,
        finishedBy: null,
        score: null,
        right: null,
        wrong: null,
        blank: null,
        switches: [{ at: new Date("2026-11-28T17:05:00Z") }],
        zerothOptionId: "z1",
        topics: [],
      },
    ],
    counts: {
      seats: 1,
      started: 1,
      inProgress: 1,
      finished: 0,
      missed: 0,
      average: null,
    },
    topics: [],
    questions: [],
    zeroth: {
      question: "Bu hadisi ne zaman öğrendin?",
      options: [{ id: "z1", text: "Bu dönem", count: 1 }],
    },
    released: false,
    releasedAt: null,
    mayRelease: true,
    releasable: true,
    ...change,
  }) as OnlineExamResultsResponse;

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

const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;
const dialog = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement;

afterEach(async () => {
  await cleanup();
  held.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("an online exam's results page (MDRS-299)", () => {
  it("draws a talebe's state, switches and zeroth answer", async () => {
    const root = await render(wrap(<ResultsView initial={results()} />));
    expect(root.textContent).toContain("Zeynep Örnek");
    expect(root.textContent).toContain("Devam ediyor");
    expect(root.textContent).toContain("1 kez");
    expect(root.textContent).toContain("20:05:00");
    expect(root.textContent).toContain("Bu dönem: 1 talebe");
    expect(root.textContent).toContain(
      "Sınav sürüyor; bu sayfa kendiliğinden yenilenir."
    );
    // "Sınavda kalmak" is failing it: the words say whose exam goes on.
    expect(root.textContent).toContain(
      "1 talebeden 1 talebe başladı: 1 talebenin sınavı devam ediyor, 0 talebe bitirdi; 0 talebe girmedi."
    );
  });

  it("ends the exam at once on 'Erken bitir', and reads the scores after", async () => {
    actions.closeExamEarly.mockReturnValue(
      later({ success: true, data: { examId: "e1", finished: 1 } })
    );
    actions.readExamResults.mockResolvedValue({
      success: true,
      data: results({
        exam: { ...results().exam, closed: true, mayClose: false },
        talebe: [
          {
            ...results().talebe[0],
            state: "FINISHED",
            finishedBy: "CLOSED_EARLY",
            score: "50.00",
          },
        ],
      }),
    });
    const root = await render(wrap(<ResultsView initial={results()} />));
    await click(button(root, "Sınavı erken bitir"));
    await settle(80);
    expect(dialog().textContent).toContain(
      "Şu an 1 talebenin sınavı devam ediyor."
    );
    await click(button(dialog(), "Erken bitir"));
    await settle(80);
    // Before tedrisat answers.
    expect(root.textContent).toContain("Erken bitirildi");
    expect(root.textContent).toContain("Sınav herkes için bitti.");
    expect(button(root, "Sınavı erken bitir")).toBeUndefined();
    held.shift()?.();
    await settle(80);
    expect(actions.closeExamEarly).toHaveBeenCalledWith("e1");
    expect(actions.readExamResults).toHaveBeenCalledWith("e1");
    expect(root.textContent).toContain("50.00");
  });

  it("puts the exam back when the close is refused, and says why", async () => {
    actions.closeExamEarly.mockResolvedValue({
      success: false,
      code: "EXAM_NOT_OPEN",
    });
    const root = await render(wrap(<ResultsView initial={results()} />));
    await click(button(root, "Sınavı erken bitir"));
    await settle(80);
    await click(button(dialog(), "Erken bitir"));
    await settle(80);
    expect(root.textContent).toContain("Devam ediyor");
    expect(document.body.textContent).toContain(
      "Sınav açık değil: henüz açılmadı ya da bitti."
    );
  });

  it("says the release ends the exam for everyone, ends it at once, and reads the scores after", async () => {
    actions.releaseExamResults.mockReturnValue(
      later({ success: true, data: { lessonId: "l1" } })
    );
    actions.readExamResults.mockResolvedValue({
      success: true,
      data: results({
        exam: { ...results().exam, closed: true, mayClose: false },
        talebe: [
          {
            ...results().talebe[0],
            state: "FINISHED",
            finishedBy: "CLOSED_EARLY",
            score: "50.00",
          },
        ],
        released: true,
        releasedAt: new Date("2026-11-28T17:20:00Z"),
      }),
    });
    const root = await render(wrap(<ResultsView initial={results()} />));
    await click(button(root, "Sonuçları talebelere aç"));
    await settle(80);
    const asked = dialog().textContent ?? "";
    expect(asked).toContain(
      "Sonuçları açarsanız sınav herkes için biter ve kimse yeni başlayamaz."
    );
    expect(asked).toContain(
      "Şu an 1 talebenin sınavı devam ediyor; sınavları kaydedilmiş cevaplarıyla biter."
    );
    expect(asked).toContain(
      "Her talebe kendi puanını, konulardaki durumunu ve cevaplarını doğru cevaplarıyla birlikte görür ve bildirim alır. Bu geri alınamaz."
    );
    expect(asked).not.toContain("sınavda");
    await click(button(dialog(), "Sonuçları aç"));
    await settle(80);
    // Before tedrisat answers: released, and over for everyone.
    expect(root.textContent).toContain("tarihinde açıldı");
    expect(root.textContent).toContain("Erken bitirildi");
    expect(root.textContent).toContain("Sınav herkes için bitti.");
    expect(button(root, "Sınavı erken bitir")).toBeUndefined();
    held.shift()?.();
    await settle(80);
    expect(actions.releaseExamResults).toHaveBeenCalledWith("l1");
    expect(actions.readExamResults).toHaveBeenCalledWith("e1");
    expect(root.textContent).toContain("50.00");
  });

  it("does not say the release ends an exam that has closed for everyone", async () => {
    const closed = results({
      exam: { ...results().exam, closed: true, mayClose: false },
      talebe: [
        {
          ...results().talebe[0],
          state: "FINISHED",
          finishedBy: "TALEBE",
          score: "50.00",
        },
      ],
      counts: { ...results().counts, inProgress: 0, finished: 1 },
    });
    const root = await render(wrap(<ResultsView initial={closed} />));
    await click(button(root, "Sonuçları talebelere aç"));
    await settle(80);
    const asked = dialog().textContent ?? "";
    expect(asked).not.toContain("sınav herkes için biter");
    expect(asked).not.toContain("devam ediyor");
    expect(asked).toContain("doğru cevaplarıyla birlikte görür");
  });

  it("offers the release only once the exam has opened, and not to one who may not", async () => {
    const scheduled = results({
      exam: { ...results().exam, closed: false, mayClose: false },
      talebe: [
        {
          ...results().talebe[0],
          state: "NOT_STARTED",
          startedAt: null,
          switches: [],
          zerothOptionId: null,
        },
      ],
      counts: { ...results().counts, started: 0, inProgress: 0 },
    });
    const before = await render(wrap(<ResultsView initial={scheduled} />));
    expect(button(before, "Sonuçları talebelere aç")).toBeUndefined();
    expect(before.textContent).toContain(
      "Sonuçlar açılana kadar talebe puanını göremez."
    );

    await cleanup();
    const other = await render(
      wrap(<ResultsView initial={results({ mayRelease: false })} />)
    );
    expect(button(other, "Sonuçları talebelere aç")).toBeUndefined();
    expect(other.textContent).toContain(
      "Sonuçlar açılana kadar talebe puanını göremez."
    );
  });

  it("reads again while the exam is open, and not once it has closed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    actions.readExamResults.mockResolvedValue({
      success: true,
      data: results(),
    });
    await render(wrap(<ResultsView initial={results()} />));
    vi.advanceTimersByTime(RESULTS_REFRESH_MS);
    expect(actions.readExamResults).toHaveBeenCalledTimes(1);

    await cleanup();
    actions.readExamResults.mockClear();
    await render(
      wrap(
        <ResultsView
          initial={results({
            exam: { ...results().exam, closed: true, mayClose: false },
          })}
        />
      )
    );
    vi.advanceTimersByTime(RESULTS_REFRESH_MS * 2);
    expect(actions.readExamResults).not.toHaveBeenCalled();
  });
});
