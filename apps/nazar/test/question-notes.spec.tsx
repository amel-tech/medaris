// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  ExamQuestionNoteResponse,
  NotificationResponse,
} from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notificationHref,
  titleKey,
  titleValues,
} from "~/features/notifications/notifications";
import { PracticeSetsTable } from "~/features/online-exams/components/practice-sets-table";
import { TalebeNotesSection } from "~/features/online-exams/components/talebe-notes-section";
import { QuestionNotesSwitch } from "~/features/online-exams/components/talebe-notes-toggle";
import {
  notesHref,
  takesNotes,
  teacherOrder,
  unansweredOf,
} from "~/features/online-exams/question-notes";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

/**
 * Talebe notları on the hoca's side (MDRS-248): the icon on a published
 * question, the notes part of a set's page with its answers, the badge in
 * the list, and the notification that leads there. The actions are stubs.
 */
const notesActions = {
  setExamQuestionTalebeNotes: vi.fn(),
  replyQuestionNote: vi.fn(),
};
vi.mock("~/features/online-exams/notes-actions", () => ({
  setExamQuestionTalebeNotes: (...a: unknown[]) =>
    notesActions.setExamQuestionTalebeNotes(...a),
  replyQuestionNote: (...a: unknown[]) => notesActions.replyQuestionNote(...a),
}));
// The set's "Sil" in the table row: not what this spec is about.
vi.mock("~/features/online-exams/actions", () => ({
  deletePracticeSet: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const held: Array<() => void> = [];
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => held.push(() => resolve(value)));

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

afterEach(async () => {
  await cleanup();
  held.length = 0;
  vi.clearAllMocks();
});

const COURSE = "11111111-1111-4111-8111-111111111111";
const SET = "22222222-2222-4222-8222-222222222222";

const note = (
  id: string,
  change: Partial<ExamQuestionNoteResponse> = {}
): ExamQuestionNoteResponse => ({
  id,
  questionId: `q-${id}`,
  questionNumber: 1,
  questionText: "Kıyasın rükünleri kaç tanedir?",
  talebe: { id: `u-${id}`, name: `Talebe ${id}` },
  body: `Not ${id}`,
  sharedAt: new Date("2026-11-20T10:00:00Z"),
  updatedAt: new Date("2026-11-20T10:00:00Z"),
  editedAfterReply: false,
  teacherReply: null,
  repliedAt: null,
  repliedBy: null,
  ...change,
});

const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;
const cards = (root: HTMLElement) =>
  [...root.querySelectorAll("article[data-note]")] as HTMLElement[];

describe("the hoca's order of the notes", () => {
  it("puts the notes waiting for an answer first, longest waiting first, then the latest answered", () => {
    const list = [
      note("answered-old", {
        teacherReply: "Evet",
        repliedAt: new Date("2026-11-21T10:00:00Z"),
      }),
      note("waiting-new", { sharedAt: new Date("2026-11-22T10:00:00Z") }),
      note("answered-new", {
        teacherReply: "Hayır",
        repliedAt: new Date("2026-11-23T10:00:00Z"),
      }),
      note("waiting-old", { sharedAt: new Date("2026-11-19T10:00:00Z") }),
    ];
    expect([...list].sort(teacherOrder).map((n) => n.id)).toEqual([
      "waiting-old",
      "waiting-new",
      "answered-new",
      "answered-old",
    ]);
    expect(unansweredOf(list)).toBe(2);
  });

  it("leads to the notes part of the set's or the exam's page", () => {
    expect(notesHref("c1", "PRACTICE", "s1")).toBe(
      "/ders/c1/calisma-sorulari/s1#talebe-notlari"
    );
    expect(notesHref("c1", "EXAM", "e1")).toBe(
      "/ders/c1/sinavlar/e1#talebe-notlari"
    );
  });

  it("reads a question without the field by the API's default", () => {
    expect(takesNotes({}, "PRACTICE")).toBe(true);
    expect(takesNotes({}, "EXAM")).toBe(false);
    expect(takesNotes({ talebeNotes: false }, "PRACTICE")).toBe(false);
  });
});

describe("Talebe notları on a set's page", () => {
  it("lists the waiting notes first with a badge, each with its question, talebe, note and date", async () => {
    const root = await render(
      wrap(
        <TalebeNotesSection
          notes={[
            note("a", {
              teacherReply: "Dört rükün",
              repliedAt: new Date("2026-11-21T10:00:00Z"),
            }),
            note("b", { questionNumber: 3, body: "Bu soruda emin değilim" }),
          ]}
        />
      )
    );
    const section = root.querySelector("#talebe-notlari") as HTMLElement;
    expect(section.querySelector("h2")?.textContent).toBe("Talebe notları");
    expect(section.textContent).toContain("1 cevapsız");
    const [first, second] = cards(root);
    expect(first?.textContent).toContain("3. soru");
    expect(first?.textContent).toContain("Talebe b");
    expect(first?.textContent).toContain("Bu soruda emin değilim");
    expect(first?.textContent).toContain("Cevapsız");
    expect(first?.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-11-20T10:00:00.000Z"
    );
    expect(second?.textContent).toContain("Cevaplandı");
    expect(second?.textContent).toContain("Dört rükün");
  });

  it("says so when no note was sent, and when the read failed", async () => {
    const empty = await render(wrap(<TalebeNotesSection notes={[]} />));
    expect(empty.textContent).toContain(
      "Henüz size gönderilmiş talebe notu yok."
    );
    await cleanup();
    const failed = await render(wrap(<TalebeNotesSection notes={null} />));
    expect(failed.textContent).toContain("Talebe notları şu an okunamadı.");
  });

  it("answers a note in place, and moves it under the waiting ones", async () => {
    notesActions.replyQuestionNote.mockImplementation(
      async (id: string, reply: string) => ({
        success: true,
        data: note(id, {
          teacherReply: reply,
          repliedAt: new Date("2026-11-24T10:00:00Z"),
          repliedBy: "h1",
        }),
      })
    );
    const root = await render(
      wrap(<TalebeNotesSection notes={[note("a"), note("b")]} />)
    );
    const first = cards(root)[0] as HTMLElement;
    expect(button(first, "Cevapla").disabled).toBe(true);
    await typeInto(
      first.querySelector("textarea") as HTMLTextAreaElement,
      "  Dört rükün vardır.  "
    );
    await click(button(first, "Cevapla"));
    await settle();
    expect(notesActions.replyQuestionNote).toHaveBeenCalledWith(
      "a",
      "Dört rükün vardır."
    );
    const [top, bottom] = cards(root);
    expect(top?.getAttribute("data-note")).toBe("b");
    expect(bottom?.textContent).toContain("Dört rükün vardır.");
    expect(button(bottom as HTMLElement, "Cevabı düzenle")).toBeTruthy();
    expect(root.textContent).toContain("1 cevapsız");
  });

  it("edits and removes an answer; a removed one goes back to waiting with its text in the field", async () => {
    notesActions.replyQuestionNote.mockImplementation(
      async (id: string, reply: string) => ({
        success: true,
        data: note(id, {
          teacherReply: reply === "" ? null : reply,
          repliedAt: reply === "" ? null : new Date("2026-11-24T10:00:00Z"),
          repliedBy: reply === "" ? null : "h1",
        }),
      })
    );
    const root = await render(
      wrap(
        <TalebeNotesSection
          notes={[
            note("a", {
              teacherReply: "Eski cevap",
              repliedAt: new Date("2026-11-21T10:00:00Z"),
            }),
          ]}
        />
      )
    );
    let card = cards(root)[0] as HTMLElement;
    await click(button(card, "Cevabı düzenle"));
    const field = card.querySelector("textarea") as HTMLTextAreaElement;
    expect(field.value).toBe("Eski cevap");
    await typeInto(field, "Yeni cevap");
    await click(button(card, "Cevabı kaydet"));
    await settle();
    expect(notesActions.replyQuestionNote).toHaveBeenLastCalledWith(
      "a",
      "Yeni cevap"
    );
    card = cards(root)[0] as HTMLElement;
    expect(card.textContent).toContain("Yeni cevap");
    await click(button(card, "Cevabı kaldır"));
    await settle();
    expect(notesActions.replyQuestionNote).toHaveBeenLastCalledWith("a", "");
    card = cards(root)[0] as HTMLElement;
    expect(card.textContent).toContain("Cevapsız");
    expect((card.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Yeni cevap"
    );
    expect(root.textContent).toContain("1 cevapsız");
  });

  it("keeps the answer typed and says so when the API refuses it", async () => {
    notesActions.replyQuestionNote.mockResolvedValue({
      success: false,
      code: "QUESTION_NOTE_NOT_FOUND",
    });
    const root = await render(wrap(<TalebeNotesSection notes={[note("a")]} />));
    const card = cards(root)[0] as HTMLElement;
    await typeInto(card.querySelector("textarea") as HTMLElement, "Cevap");
    await click(button(card, "Cevapla"));
    await settle();
    expect(document.body.textContent).toContain("Cevap gönderilemedi");
    expect(document.body.textContent).toContain(
      "Talebe bu notu artık size göndermiyor."
    );
    expect((card.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Cevap"
    );
  });

  it("draws an Arabic note and question by the Arabic text standard", async () => {
    const root = await render(
      wrap(
        <TalebeNotesSection
          notes={[
            note("a", {
              questionText: "مَا مَعْنَى الْقِيَاسِ؟",
              body: "الْحَمْدُ لِلَّهِ",
            }),
          ]}
        />
      )
    );
    const arabic = [...root.querySelectorAll('[lang="ar"]')];
    expect(arabic.map((el) => el.textContent)).toEqual(
      expect.arrayContaining(["مَا مَعْنَى الْقِيَاسِ؟", "الْحَمْدُ لِلَّهِ"])
    );
    for (const el of arabic) expect(el.getAttribute("dir")).toBe("rtl");
  });
});

describe("the talebe-notes icon on a published question", () => {
  const icon = (root: HTMLElement) =>
    root.querySelector("button[data-talebe-notes]") as HTMLButtonElement;

  it("shows the new state at once and keeps it when the API takes it", async () => {
    notesActions.setExamQuestionTalebeNotes.mockReturnValue(
      later({ success: true, data: { questionId: "q1", talebeNotes: false } })
    );
    const root = await render(
      wrap(
        <QuestionNotesSwitch
          examId="s1"
          kind="PRACTICE"
          question={{ id: "q1", talebeNotes: true }}
        />
      )
    );
    expect(icon(root).getAttribute("aria-pressed")).toBe("true");
    await click(icon(root));
    expect(icon(root).getAttribute("aria-pressed")).toBe("false");
    expect(notesActions.setExamQuestionTalebeNotes).toHaveBeenCalledWith(
      "s1",
      "q1",
      false
    );
    // A second press while the first is on its way is not taken.
    await click(icon(root));
    expect(notesActions.setExamQuestionTalebeNotes).toHaveBeenCalledTimes(1);
    held.shift()?.();
    await settle();
    expect(icon(root).getAttribute("aria-pressed")).toBe("false");
  });

  it("takes the state back with a toast when the write fails", async () => {
    notesActions.setExamQuestionTalebeNotes.mockResolvedValue({
      success: false,
      code: "EXAM_NOT_FOUND",
    });
    const root = await render(
      wrap(
        <QuestionNotesSwitch examId="e1" kind="EXAM" question={{ id: "q1" }} />
      )
    );
    expect(icon(root).getAttribute("aria-pressed")).toBe("false");
    await click(icon(root));
    await settle();
    expect(icon(root).getAttribute("aria-pressed")).toBe("false");
    expect(document.body.textContent).toContain(
      "Talebe notu ayarı kaydedilemedi"
    );
  });
});

describe("the notes badge in Çalışma Soruları", () => {
  it("shows how many notes wait beside a set, leading to its notes; none waiting, none shown", async () => {
    const row = {
      title: "Siyer",
      draft: false,
      locked: false,
      questionCount: 4,
      talebeCount: null,
      attemptCount: null,
      averagePercent: null,
    };
    const root = await render(
      wrap(
        <PracticeSetsTable
          courseId="c1"
          rows={[
            { ...row, id: "s1", unansweredNotes: 3 },
            { ...row, id: "s2", title: "Fıkıh", unansweredNotes: 0 },
          ]}
        />
      )
    );
    const badges = [
      ...root.querySelectorAll('a[href*="#talebe-notlari"]'),
    ] as HTMLAnchorElement[];
    expect(badges).toHaveLength(1);
    expect(badges[0]?.getAttribute("href")).toBe(
      "/ders/c1/calisma-sorulari/s1#talebe-notlari"
    );
    expect(badges[0]?.textContent).toBe("3 not");
    expect(badges[0]?.getAttribute("aria-label")).toBe(
      "“Siyer”: 3 cevapsız talebe notu"
    );
  });
});

describe("the notification of a note sent to the hoca", () => {
  const shared = (params: Record<string, unknown>): NotificationResponse =>
    ({
      id: "n1",
      type: "QUESTION_NOTE_SHARED",
      targetType: "COURSE",
      targetId: COURSE,
      params,
      readAt: null,
      createdAt: new Date("2026-11-20T10:00:00Z"),
    }) as unknown as NotificationResponse;

  it("names the set or the exam, and words a note with no title plainly", () => {
    const t = createTranslator({
      locale: "tr",
      messages: resources.tr.nazar,
      namespace: "Notifications",
    }) as unknown as (key: string, values: Record<string, string>) => string;
    const word = (n: NotificationResponse) =>
      t(titleKey(n.type), titleValues(n));
    expect(
      word(
        shared({ setTitle: "Siyer", examKind: "PRACTICE", courseId: COURSE })
      )
    ).toBe("“Siyer” setine talebe notu geldi");
    expect(word(shared({ setTitle: "Ara sınav", examKind: "EXAM" }))).toBe(
      "“Ara sınav” sınavına talebe notu geldi"
    );
    expect(word(shared({}))).toBe("Talebe notu geldi");
  });

  it("leads to the notes of its set here in Nazar, built from its ids only", () => {
    expect(
      notificationHref(
        shared({ courseId: COURSE, examId: SET, examKind: "PRACTICE" }),
        "http://localhost:4000"
      )
    ).toBe(`/ders/${COURSE}/calisma-sorulari/${SET}#talebe-notlari`);
    expect(
      notificationHref(
        shared({ courseId: COURSE, examId: SET, examKind: "EXAM" }),
        null
      )
    ).toBe(`/ders/${COURSE}/sinavlar/${SET}#talebe-notlari`);
    expect(
      notificationHref(shared({ courseId: COURSE, examId: "../x" }), null)
    ).toBeNull();
  });
});
