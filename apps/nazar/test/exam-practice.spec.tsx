// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  OnlineExamDraftResponse,
  PracticeSetStatsResponse,
} from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamWorkspace } from "~/features/online-exams/components/exam-workspace";
import { NewExamForm } from "~/features/online-exams/components/new-exam-form";
import { navFor } from "~/features/shell/nav";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push }),
  unstable_isUnrecognizedActionError: () => false,
}));

const actions = {
  addExamQuestion: vi.fn(),
  saveExamQuestion: vi.fn(),
  removeExamQuestion: vi.fn(),
  createCourseTopic: vi.fn(),
  createOnlineExam: vi.fn(),
  setExamQuestionPoints: vi.fn(),
  removeCourseTopic: vi.fn(),
  saveExamSettings: vi.fn(),
  publishOnlineExam: vi.fn(),
  unpublishOnlineExam: vi.fn(),
};
vi.mock("~/features/online-exams/actions", () => ({
  addExamQuestion: (...a: unknown[]) => actions.addExamQuestion(...a),
  saveExamQuestion: (...a: unknown[]) => actions.saveExamQuestion(...a),
  removeExamQuestion: (...a: unknown[]) => actions.removeExamQuestion(...a),
  createCourseTopic: (...a: unknown[]) => actions.createCourseTopic(...a),
  createOnlineExam: (...a: unknown[]) => actions.createOnlineExam(...a),
  setExamQuestionPoints: (...a: unknown[]) =>
    actions.setExamQuestionPoints(...a),
  removeCourseTopic: (...a: unknown[]) => actions.removeCourseTopic(...a),
  saveExamSettings: (...a: unknown[]) => actions.saveExamSettings(...a),
  publishOnlineExam: (...a: unknown[]) => actions.publishOnlineExam(...a),
  unpublishOnlineExam: (...a: unknown[]) => actions.unpublishOnlineExam(...a),
}));

const complete = {
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
  points: "50.00",
  complete: true,
  lacks: [],
};
const incomplete = {
  ...complete,
  id: "q2",
  number: 2,
  text: "",
  options: [],
  complete: false,
  lacks: ["text", "option", "correct"],
};
const set = {
  id: "s1",
  courseId: "c1",
  kind: "PRACTICE",
  title: "Kıyas tekrarı",
  durationMinutes: null,
  instructions: null,
  zerothQuestion: null,
  zerothOptions: null,
  courseTopics: [
    { id: "t3", number: 3, name: "Kıyas", picked: true, questionCount: 1 },
  ],
  topicIds: ["t3"],
  questions: [complete, incomplete],
  pointsTotal: "100.00",
  status: "DRAFT",
  startsAt: null,
  latestStartAt: null,
  problems: [],
  version: 3,
} as unknown as OnlineExamDraftResponse;
const published = {
  ...set,
  status: "OPEN",
  version: 4,
} as unknown as OnlineExamDraftResponse;

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
const page = (
  draft: OnlineExamDraftResponse,
  practiceStats?: PracticeSetStatsResponse | null
) =>
  render(
    wrap(
      <ExamWorkspace
        courseId="c1"
        draft={draft}
        timeZone="Europe/Istanbul"
        locale="tr"
        practiceStats={practiceStats}
      />
    )
  );
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
const labels = () =>
  [...document.querySelectorAll(".mds-label, legend")].map(
    (l) => l.textContent
  );
const dialog = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement;

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

describe("Çalışma Soruları in the course menu (MDRS-248)", () => {
  it("sits under Sınavlar, for a holder of exam.prepare only", () => {
    const ids = (held?: ReadonlySet<string>) =>
      navFor(
        { kind: "ders", id: "c-1" },
        { panoHref: "/medrese/m-1", counts: {}, held }
      )
        .flatMap((s) => s.items)
        .map((i) => i.id);
    expect(ids(new Set(["course.view"]))).not.toContain("practice");
    const held = ids(new Set(["exam.prepare"]));
    expect(held.indexOf("practice")).toBe(held.indexOf("exams") + 1);
    const item = navFor(
      { kind: "ders", id: "c-1" },
      { panoHref: "/medrese/m-1", counts: {}, held: new Set(["exam.prepare"]) }
    )
      .flatMap((s) => s.items)
      .find((i) => i.id === "practice");
    expect(item).toMatchObject({
      href: "/ders/c-1/calisma-sorulari",
      labelKey: "ders.practice",
    });
    expect(resources.tr.nazar.Nav.ders.practice).toBe("Çalışma Soruları");
  });
});

describe("Yeni çalışma seti (MDRS-248)", () => {
  it("opens a set with kind PRACTICE and goes to it under Çalışma Soruları", async () => {
    actions.createOnlineExam.mockResolvedValue({
      success: true,
      data: { id: "s9" },
    });
    const root = await render(
      wrap(<NewExamForm courseId="c1" kind="PRACTICE" />)
    );
    expect(labels()).toContain("Çalışma setinin adı");
    await typeInto(
      root.querySelector("input") as HTMLInputElement,
      "Kıyas tekrarı"
    );
    await click(button(root, "Yeni çalışma seti") as HTMLButtonElement);
    await settle(40);
    expect(actions.createOnlineExam).toHaveBeenCalledWith(
      "c1",
      "Kıyas tekrarı",
      "PRACTICE"
    );
    expect(push).toHaveBeenCalledWith("/ders/c1/calisma-sorulari/s9");
  });

  it("leaves Yeni sınav as it was", async () => {
    actions.createOnlineExam.mockResolvedValue({
      success: true,
      data: { id: "e9" },
    });
    const root = await render(wrap(<NewExamForm courseId="c1" />));
    await typeInto(root.querySelector("input") as HTMLInputElement, "Ara");
    await click(button(root, "Yeni sınav") as HTMLButtonElement);
    await settle(40);
    expect(actions.createOnlineExam).toHaveBeenCalledWith("c1", "Ara", "EXAM");
    expect(push).toHaveBeenCalledWith("/ders/c1/sinavlar/e9");
  });
});

describe("preparing a çalışma seti (MDRS-248)", () => {
  it("asks for no length, no points and no date", async () => {
    const root = await page(set);
    const fields = labels();
    expect(fields).not.toContain("Süre (dakika)");
    expect(fields).toContain("Çalışma setinin adı");
    expect(root.textContent).not.toContain("puan");
    await click(button(root, "Düzenle") as HTMLButtonElement);
    expect(labels()).not.toContain("Kendi puanı");
    // No day, no time, no late window: one "Yayınla".
    expect(labels()).not.toContain("En erken başlama");
    expect(root.querySelector("input[type=date]")).toBeNull();
  });

  it("saves its settings with no length, which the API refuses on a set", async () => {
    actions.saveExamSettings.mockResolvedValue({
      success: true,
      data: { version: 4 },
    });
    const root = await page(set);
    const title = [...document.querySelectorAll(".mds-field")]
      .find(
        (f) =>
          f.querySelector(".mds-label")?.textContent === "Çalışma setinin adı"
      )
      ?.querySelector("input") as HTMLInputElement;
    await typeInto(title, "Kıyas, ikinci tekrar");
    await click(button(root, "Ayarları kaydet") as HTMLButtonElement);
    await settle(40);
    const [, sent] = actions.saveExamSettings.mock.calls[0];
    expect(sent).toEqual({
      title: "Kıyas, ikinci tekrar",
      instructions: null,
      version: 3,
    });
    expect("durationMinutes" in sent).toBe(false);
  });

  it("publishes with no times after asking once, then offers Yayından kaldır", async () => {
    actions.publishOnlineExam.mockResolvedValue({
      success: true,
      data: published,
    });
    const root = await page(set);
    // An incomplete question does not keep a set from being published.
    expect(root.textContent).not.toContain(
      "Yayınlamak için en az bir tamamlanmış soru gerekir."
    );
    await click(button(root, "Yayınla") as HTMLButtonElement);
    await settle(40);
    // Asked once: a talebe's start makes it impossible to take back.
    expect(actions.publishOnlineExam).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain(
      "Bir talebe çözmeye başladıktan sonra set yayından kaldırılamaz."
    );
    await click(button(dialog(), "Yayınla") as HTMLButtonElement);
    await settle(60);
    expect(actions.publishOnlineExam).toHaveBeenCalledWith("s1", {
      version: 3,
    });
    expect(root.textContent).toContain("Yayında");
    expect(button(root, "Yayından kaldır")).toBeTruthy();
    expect(button(root, "Soru ekle")).toBeUndefined();
  });

  it("is not published without a complete question", async () => {
    const root = await page({
      ...set,
      questions: [incomplete],
    } as unknown as OnlineExamDraftResponse);
    expect(root.textContent).toContain(
      "Yayınlamak için en az bir tamamlanmış soru gerekir."
    );
    expect((button(root, "Yayınla") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says which part a question lacks, and that the talebe never gets it", async () => {
    const root = await page(set);
    expect(
      root.querySelector('article[aria-label="1. soru"]')?.textContent
    ).toContain("3. Kıyas");
    expect(root.textContent).toContain(
      "2. sorunun doğru şıkkı işaretli değil."
    );
    expect(root.textContent).toContain(
      "1 soru eksik; talebeler yalnız tamamlanmış soruları çözer."
    );
    expect(root.textContent).toContain(
      "Talebe bunu çalışma setleri listesinde, setin adının altında okur."
    );
  });

  it("shows how a published set was solved, and no Yayından kaldır once it was", async () => {
    const root = await page(published, {
      setId: "s1",
      talebeCount: 1,
      attemptCount: 2,
      averagePercent: "72.50",
    });
    expect(root.textContent).toContain("1 talebe 2 kez çözdü · ortalama %73");
    expect(root.textContent).toContain(
      "Talebeler bu seti başlattı; artık yayından kaldırılamaz."
    );
    expect(button(root, "Yayından kaldır")).toBeUndefined();
  });

  it("offers no Yayından kaldır on a set the API calls locked, before anyone finished it (MDRS-248)", async () => {
    const root = await page({
      ...published,
      locked: true,
    } as unknown as OnlineExamDraftResponse);
    expect(root.textContent).toContain(
      "Talebeler bu seti başlattı; artık yayından kaldırılamaz."
    );
    expect(button(root, "Yayından kaldır")).toBeUndefined();
  });

  it("goes back to a draft with Yayından kaldır", async () => {
    actions.unpublishOnlineExam.mockResolvedValue({
      success: true,
      data: { ...set, version: 5 },
    });
    const root = await page(published);
    expect(root.textContent).toContain(
      "Dersin talebeleri bu seti istedikleri zaman, süre sınırı olmadan çözebilir."
    );
    await click(button(root, "Yayından kaldır") as HTMLButtonElement);
    await settle(40);
    await click(button(dialog(), "Yayından kaldır") as HTMLButtonElement);
    await settle(60);
    expect(actions.unpublishOnlineExam).toHaveBeenCalledWith("s1", 4);
    expect(button(root, "Soru ekle")).toBeTruthy();
  });

  it("says so when a talebe has already started it", async () => {
    actions.unpublishOnlineExam.mockResolvedValue({
      success: false,
      code: "EXAM_LOCKED",
    });
    const root = await page(published);
    await click(button(root, "Yayından kaldır") as HTMLButtonElement);
    await settle(40);
    await click(button(dialog(), "Yayından kaldır") as HTMLButtonElement);
    await settle(60);
    expect(document.body.textContent).toContain(
      "Bir talebe bu seti çözmeye başladı; yayından kaldırılamaz."
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("lays a published set's Arabic question out right to left (MDRS-248)", async () => {
    const root = await page({
      ...published,
      questions: [{ ...complete, text: "مَا مَعْنَى «الْحَمْدُ»؟" }],
    } as unknown as OnlineExamDraftResponse);
    const run = root.querySelector("li p [lang=ar]") as HTMLElement;
    expect(run.textContent).toBe("مَا مَعْنَى «الْحَمْدُ»؟");
    expect(run.closest("p")?.getAttribute("dir")).toBe("rtl");
  });
});
