// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  LessonSubmissionResponse,
  SubmissionFileResponse,
} from "@medaris/services/tedrisat";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

/**
 * "Ödevim" on a celse's detail page (MDRS-290): the talebe's own homework,
 * read and changed through Server Actions, a file added through this app's
 * upload route and downloaded through its download route. Where the card is
 * drawn is `session-homework.spec.ts`; the routes are `file-routes.spec.ts`.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTimeZone: () => "Europe/Istanbul",
    useTranslations: (namespace: string) => {
      const read = (key: string) =>
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string;
      return (key: string, values?: Record<string, string | number>) =>
        read(key).replace(/\{(\w+)\}/g, (_, name) =>
          String(values?.[name] ?? "")
        );
    },
  };
});

vi.mock("~/features/courses/actions/submissions", () => ({
  getMySubmission: mocks.get,
  saveMySubmissionNote: mocks.save,
  deleteMySubmissionFile: mocks.remove,
}));
vi.mock("../features/courses/actions/submissions", () => ({
  getMySubmission: mocks.get,
  saveMySubmissionNote: mocks.save,
  deleteMySubmissionFile: mocks.remove,
}));
// The hand-off itself is `send-to-sign-in.spec.ts`; here only that the card
// hands an "unauthenticated" answer to it and draws nothing else.
const isSignedOut = (value: unknown) =>
  (value as { kind?: unknown } | null)?.kind === "unauthenticated";
vi.mock("~/lib/send-to-sign-in", () => ({ sendToSignIn: mocks.signIn }));

const LESSON = "11111111-1111-4111-8111-111111111111";
const F1 = "22222222-2222-4222-8222-222222222222";
const F2 = "33333333-3333-4333-8333-333333333333";
const F3 = "44444444-4444-4444-8444-444444444444";
const F4 = "55555555-5555-4555-8555-555555555555";
const F5 = "66666666-6666-4666-8666-666666666666";
const MB = 1024 * 1024;
const tr = resources.tr.tedrisLearn.Homework;

const pdf = (
  id = F1,
  over: Partial<SubmissionFileResponse> = {}
): SubmissionFileResponse => ({
  id,
  name: `${id.slice(0, 4)}.pdf`,
  contentType: "application/pdf",
  sizeBytes: 1.5 * MB,
  createdAt: new Date("2026-10-12T08:00:00Z"),
  downloadUrl: `/lessons/${LESSON}/submission/files/${id}`,
  ...over,
});

const submission = (
  over: Partial<LessonSubmissionResponse> = {}
): LessonSubmissionResponse => ({
  id: "s1",
  lessonId: LESSON,
  note: null,
  createdAt: new Date("2026-10-12T08:00:00Z"),
  updatedAt: new Date("2026-10-12T09:05:00Z"),
  files: [],
  ...over,
});

const ok = <T>(data: T) => ({ success: true as const, data });
const own = (s: LessonSubmissionResponse | null) =>
  ok({ submission: s, maxFiles: 5, maxFileBytes: 25 * MB });

const fetchMock = vi.fn();

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.get.mockResolvedValue(own(null));
  mocks.signIn.mockImplementation(isSignedOut);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

const mount = async () => {
  const { SessionHomework } = await import(
    "~/features/courses/components/session-homework"
  );
  const host = await render(
    createElement(SessionHomework, { lessonId: LESSON })
  );
  await settle();
  return host;
};

const fileInput = (host: HTMLElement) =>
  host.querySelector('input[type="file"]') as HTMLInputElement;
const textarea = (host: HTMLElement) =>
  host.querySelector("textarea") as HTMLTextAreaElement;
const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const named = (host: HTMLElement, name: string) =>
  host.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
const alerts = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="alert"]')].map((a) => a.textContent);

const file = (name: string, size: number, type = "application/pdf") => {
  const f = new File(["%PDF-1.7"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const choose = async (host: HTMLElement, files: File[]) => {
  const input = fileInput(host);
  await act(async () => {
    Object.defineProperty(input, "files", {
      value: files,
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** The homework as tedrisat's JSON carries it: times as strings. */
const wire = (s: LessonSubmissionResponse) => JSON.parse(JSON.stringify(s));

const set = async (el: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("the card", () => {
  it("names itself and who reads it, and says there is nothing handed in yet", async () => {
    const host = await mount();
    expect(mocks.get).toHaveBeenCalledWith(LESSON);
    const text = host.textContent ?? "";
    expect(host.querySelector("h2")?.textContent).toBe("Ödevim");
    expect(text).toContain("Müderris ve ders ekibi görür.");
    expect(text).toContain("Henüz dosya eklemedin.");
    expect(host.querySelector('[data-testid="homework-files"]')).toBeNull();
    expect(text).not.toContain(tr.updatedAt);
  });

  it("offers the picker with the allowed types, several at once, and the limits in one line", async () => {
    const host = await mount();
    const input = fileInput(host);
    expect(input.multiple).toBe(true);
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("accept")?.split(",")).toEqual(
      expect.arrayContaining([
        ".pdf",
        ".png",
        ".jpg",
        ".webp",
        ".docx",
        ".xlsx",
        ".pptx",
        ".txt",
      ])
    );
    expect(input.getAttribute("accept")).not.toMatch(/svg|html|zip/);
    expect(host.textContent).toContain("Dosya ekle");
    expect(host.textContent).toContain(
      "En çok 5 dosya, her biri en çok 25 MB: PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint ya da metin."
    );
  });

  it("lists what was handed in, each a download through this app with its type and size, the note and when it last changed", async () => {
    mocks.get.mockResolvedValue(
      own(
        submission({
          note: "Üçüncü soruyu yapamadım.",
          files: [
            pdf(F1, { name: "cevaplar.pdf" }),
            pdf(F2, {
              name: "tablo.docx",
              contentType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              sizeBytes: 20 * 1024,
            }),
          ],
        })
      )
    );
    const host = await mount();
    const links = [
      ...host.querySelectorAll('[data-testid="homework-files"] a'),
    ];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      `/api/files/lessons/${LESSON}/submission/files/${F1}`,
      `/api/files/lessons/${LESSON}/submission/files/${F2}`,
    ]);
    // A plain link: a refusal comes back to the page with ?fileError=.
    expect(links.some((a) => a.hasAttribute("download"))).toBe(false);
    expect(links.some((a) => a.hasAttribute("target"))).toBe(false);
    expect(links[0].textContent).toBe("cevaplar.pdf (indirilir)");
    const rows = host.querySelector(
      '[data-testid="homework-files"]'
    )?.textContent;
    expect(rows).toContain("PDF");
    expect(rows).toContain("1,5 MB");
    expect(rows).toContain("DOCX");
    expect(rows).toContain("20 kB");
    expect(textarea(host).value).toBe("Üçüncü soruyu yapamadım.");
    expect(host.textContent).toContain("Son değişiklik: 12 Ekim 12:05");
    expect(host.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-10-12T09:05:00.000Z"
    );
    expect(host.textContent).not.toContain("Henüz dosya eklemedin.");
  });

  it("says when it could not be read, and reads again on 'Yeniden dene'", async () => {
    mocks.get.mockResolvedValue({ success: false, error: "x", status: 500 });
    const host = await mount();
    expect(alerts(host)[0]).toContain("Ödevin açılamadı.");
    expect(fileInput(host)).toBeNull();
    mocks.get.mockResolvedValue(own(submission({ files: [pdf()] })));
    await click(button(host, "Yeniden dene"));
    await settle();
    expect(host.querySelector('[data-testid="homework-files"]')).not.toBeNull();
  });

  it("sends a talebe whose session is over to sign in, and draws no error", async () => {
    mocks.get.mockResolvedValue({
      kind: "unauthenticated",
      success: false,
      error: "Unauthenticated",
      status: 401,
    });
    const host = await mount();
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "unauthenticated" })
    );
    expect(alerts(host)).toEqual([]);
  });
});

describe("adding files", () => {
  it("posts each file to this app's upload route as the multipart field 'file', and lists it once added", async () => {
    let answer: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (answer = resolve))
    );
    const host = await mount();
    await choose(host, [file("cevaplar.pdf", 2 * MB)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/files/lessons/${LESSON}/submission/files`);
    expect(init.method).toBe("POST");
    const sent = (init.body as FormData).get("file") as File;
    expect(sent.name).toBe("cevaplar.pdf");
    // While it travels, it says so.
    expect(
      host.querySelector('[data-testid="homework-uploads"]')?.textContent
    ).toContain("cevaplar.pdf");
    expect(host.textContent).toContain("Yükleniyor…");

    await act(async () =>
      answer(
        json(
          201,
          wire(submission({ files: [pdf(F1, { name: "cevaplar.pdf" })] }))
        )
      )
    );
    await settle();
    expect(host.querySelector('[data-testid="homework-uploads"]')).toBeNull();
    expect(
      host.querySelector('[data-testid="homework-files"] a')?.textContent
    ).toContain("cevaplar.pdf");
    expect(host.querySelector("output[aria-live]")?.textContent).toBe(
      "cevaplar.pdf eklendi."
    );
    expect(host.textContent).toContain("Son değişiklik: 12 Ekim 12:05");
  });

  it("sends several one after the other, in the order chosen", async () => {
    fetchMock
      .mockResolvedValueOnce(json(201, wire(submission({ files: [pdf(F1)] }))))
      .mockResolvedValueOnce(
        json(201, wire(submission({ files: [pdf(F1), pdf(F2)] })))
      );
    const host = await mount();
    await choose(host, [file("a.pdf", MB), file("b.pdf", MB)]);
    const names = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).body as FormData).get("file") as File
    );
    expect(names.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(
      host.querySelectorAll('[data-testid="homework-files"] li')
    ).toHaveLength(2);
  });

  it.each([
    [
      413,
      "FILE_TOO_LARGE",
      "Bu dosya çok büyük: bir dosya en çok 25 MB olabilir.",
    ],
    [
      415,
      "FILE_TYPE_NOT_ALLOWED",
      "Bu dosya türü kabul edilmiyor. PDF, PNG, JPEG, WebP, Word, Excel, PowerPoint ya da metin dosyası ekleyebilirsin.",
    ],
    [
      409,
      "SUBMISSION_FILE_LIMIT",
      "En çok 5 dosya ekleyebilirsin. Yenisi için birini kaldır.",
    ],
    [
      403,
      "SUBMISSION_FORBIDDEN",
      "Ödev teslim etmek için derse kayıtlı olman gerekir.",
    ],
    [
      503,
      "STORAGE_UNAVAILABLE",
      "Dosyalar şu an kaydedilemiyor. Biraz sonra yeniden dene.",
    ],
  ])("says why tedrisat refused a file (%i %s), beside its name", async (status, code, message) => {
    fetchMock.mockResolvedValue(json(status, { code, status }));
    const host = await mount();
    await choose(host, [file("odev.pdf", MB)]);
    const uploads = host.querySelector('[data-testid="homework-uploads"]');
    expect(uploads?.textContent).toContain("odev.pdf");
    expect(alerts(host)).toEqual([message]);
    expect(host.querySelector('[data-testid="homework-files"]')).toBeNull();
    // A refusal can be put away.
    await click(named(host, "Kapat: odev.pdf"));
    expect(host.querySelector('[data-testid="homework-uploads"]')).toBeNull();
  });

  it("says it could not add a file when the route is not reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    const host = await mount();
    await choose(host, [file("odev.pdf", MB)]);
    expect(alerts(host)).toEqual([
      "Dosya eklenemedi. Biraz sonra yeniden dene.",
    ]);
  });

  it("refuses a file over 25 MB, and an empty one, before sending it", async () => {
    const host = await mount();
    await choose(host, [file("video.pdf", 25 * MB + 1), file("bos.pdf", 0)]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(alerts(host)).toEqual([
      "Bu dosya çok büyük: bir dosya en çok 25 MB olabilir.",
      "Dosya boş ya da okunamadı.",
    ]);
  });

  it("sends only as many as there is room for, and says why the rest stayed", async () => {
    mocks.get.mockResolvedValue(
      own(submission({ files: [pdf(F1), pdf(F2), pdf(F3), pdf(F4)] }))
    );
    fetchMock.mockResolvedValue(
      json(
        201,
        wire(
          submission({ files: [pdf(F1), pdf(F2), pdf(F3), pdf(F4), pdf(F5)] })
        )
      )
    );
    const host = await mount();
    await choose(host, [file("besinci.pdf", MB), file("altinci.pdf", MB)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      ((fetchMock.mock.calls[0][1] as RequestInit).body as FormData).get(
        "file"
      ) as File
    ).toHaveProperty("name", "besinci.pdf");
    expect(alerts(host)).toEqual([
      "En çok 5 dosya ekleyebilirsin. Yenisi için birini kaldır.",
    ]);
  });

  it("closes the picker once five files are in, and says why", async () => {
    mocks.get.mockResolvedValue(
      own(
        submission({
          files: [pdf(F1), pdf(F2), pdf(F3), pdf(F4), pdf(F5)],
        })
      )
    );
    const host = await mount();
    expect(fileInput(host).disabled).toBe(true);
    expect(host.textContent).toContain(
      "5 dosyanın hepsini ekledin; yenisi için birini kaldır."
    );
  });

  it("hands a 401 from the upload route to sign-in and draws no error", async () => {
    fetchMock.mockResolvedValue(
      json(401, { kind: "unauthenticated", reauth: true })
    );
    const host = await mount();
    await choose(host, [file("odev.pdf", MB)]);
    expect(mocks.signIn).toHaveBeenLastCalledWith({
      kind: "unauthenticated",
      reauth: true,
    });
    expect(alerts(host)).toEqual([]);
  });
});

describe("removing a file", () => {
  const withTwo = () =>
    own(
      submission({
        files: [pdf(F1, { name: "bir.pdf" }), pdf(F2, { name: "iki.pdf" })],
      })
    );

  it("asks first, then removes it through the action and reads the homework again", async () => {
    mocks.get.mockResolvedValue(withTwo());
    mocks.remove.mockResolvedValue(ok(undefined));
    const host = await mount();
    await click(named(host, "Kaldır: bir.pdf"));
    expect(host.textContent).toContain("Bu dosya kaldırılsın mı?");
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.get.mockResolvedValue(
      own(submission({ files: [pdf(F2, { name: "iki.pdf" })] }))
    );
    await click(button(host, "Kaldır"));
    await settle();
    expect(mocks.remove).toHaveBeenCalledWith(LESSON, F1);
    const names = [
      ...host.querySelectorAll('[data-testid="homework-files"] a'),
    ].map((a) => a.textContent);
    expect(names).toEqual(["iki.pdf (indirilir)"]);
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(host.querySelector("output[aria-live]")?.textContent).toBe(
      "bir.pdf kaldırıldı."
    );
  });

  it("keeps it on 'Vazgeç'", async () => {
    mocks.get.mockResolvedValue(withTwo());
    const host = await mount();
    await click(named(host, "Kaldır: iki.pdf"));
    await click(button(host, "Vazgeç"));
    expect(host.textContent).not.toContain("Bu dosya kaldırılsın mı?");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(
      host.querySelectorAll('[data-testid="homework-files"] li')
    ).toHaveLength(2);
  });

  it("says why it could not be removed, and keeps it", async () => {
    mocks.get.mockResolvedValue(withTwo());
    mocks.remove.mockResolvedValue({ success: false, error: "x", status: 503 });
    const host = await mount();
    await click(named(host, "Kaldır: bir.pdf"));
    await click(button(host, "Kaldır"));
    await settle();
    expect(alerts(host)).toEqual([
      "Dosyalar şu an kaydedilemiyor. Biraz sonra yeniden dene.",
    ]);
    expect(
      host.querySelectorAll('[data-testid="homework-files"] li')
    ).toHaveLength(2);
  });

  it("hands an expired session to sign-in", async () => {
    mocks.get.mockResolvedValue(withTwo());
    mocks.remove.mockResolvedValue({
      kind: "unauthenticated",
      success: false,
      error: "Unauthenticated",
      status: 401,
    });
    const host = await mount();
    await click(named(host, "Kaldır: bir.pdf"));
    await click(button(host, "Kaldır"));
    await settle();
    expect(mocks.signIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "unauthenticated" })
    );
    expect(alerts(host)).toEqual([]);
  });
});

describe("the note", () => {
  const submit = async (host: HTMLElement) => {
    await act(async () => {
      host
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await settle();
  };

  it("saves what the talebe wrote and says so", async () => {
    mocks.save.mockImplementation(async (_id: string, note: string) =>
      ok(submission({ note }))
    );
    const host = await mount();
    expect(button(host, "Notu kaydet").disabled).toBe(true);
    await set(textarea(host), "Cevaplar ekte.");
    expect(button(host, "Notu kaydet").disabled).toBe(false);
    await submit(host);
    expect(mocks.save).toHaveBeenCalledWith(LESSON, "Cevaplar ekte.");
    expect(host.textContent).toContain("Not kaydedildi.");
    // tedrisat made the homework with the note: it now says when it changed.
    expect(host.textContent).toContain("Son değişiklik:");
  });

  it("clears it with a blank one", async () => {
    mocks.get.mockResolvedValue(own(submission({ note: "Eski not" })));
    mocks.save.mockResolvedValue(ok(submission({ note: null })));
    const host = await mount();
    await set(textarea(host), "   ");
    await submit(host);
    expect(mocks.save).toHaveBeenCalledWith(LESSON, null);
    expect(textarea(host).value).toBe("");
  });

  it("keeps a note to 4000 characters and counts near the end", async () => {
    const host = await mount();
    expect(textarea(host).maxLength).toBe(4000);
    await set(textarea(host), "a".repeat(3700));
    expect(host.textContent).toContain("3700/4000 karakter");
  });

  it("says why it was not saved", async () => {
    mocks.save.mockResolvedValue({ success: false, error: "x", status: 403 });
    const host = await mount();
    await set(textarea(host), "Not");
    await submit(host);
    expect(alerts(host)).toEqual([
      "Ödev teslim etmek için derse kayıtlı olman gerekir.",
    ]);
    mocks.save.mockResolvedValue({ success: false, error: "x", status: 500 });
    await submit(host);
    expect(alerts(host)).toEqual([
      "Not kaydedilemedi. Biraz sonra yeniden dene.",
    ]);
  });
});

describe("the Homework messages", () => {
  type Tree = { [key: string]: string | Tree };
  const flatten = (node: Tree, prefix = ""): string[] =>
    Object.entries(node).flatMap(([k, v]) =>
      typeof v === "string" ? [prefix + k] : flatten(v, `${prefix}${k}.`)
    );
  const keys = (locale: "tr" | "en" | "ar") =>
    flatten(resources[locale].tedrisLearn.Homework as unknown as Tree).sort();

  it("has the same keys in tr, en and ar", () => {
    expect(keys("en")).toEqual(keys("tr"));
    expect(keys("ar")).toEqual(keys("tr"));
  });
});
