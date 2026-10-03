// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";
import { html, textOf, translatorFor } from "./server-render";

/**
 * Arşiv (nazir 12) as the server renders it, and the two things that can be
 * clicked on it. The read and the portal are stubbed; what is under test is
 * what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  archive: { status: "failed" } as Answer<unknown>,
  asked: [] as unknown[],
};
const refresh = vi.fn();
const restoreItem = vi.fn();
const hideMedrese = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (_what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      archive: {
        listMadrasahArchive: async (request: unknown) => {
          state.asked.push(request);
        },
      },
    });
    return state.archive;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => ({
    status: "ok",
    scopes: [
      {
        kind: "medrese",
        id: "m-1",
        name: "Süleymaniye Medresesi",
        role: "MEDRESE_BASMUDERRIS",
        isImam: false,
        koskName: null,
      },
    ],
  }),
}));
vi.mock("~/features/archive/actions", () => ({
  restoreItem: (type: string, id: string) => restoreItem(type, id),
  hideMedrese: (id: string) => hideMedrese(id),
}));

const self = { id: "u-1", name: "Mehmet Emin Işıkoğlu" };

/** Four of the canvas's six rows, in the order the API sends them (newest hidden first). */
const items = [
  {
    type: "session",
    id: "s-1",
    title: "Mantığın tarifi ve konusu, 26 Eylül 19:00 celsesi",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    madrasahId: "m-1",
    madrasahName: "Süleymaniye Medresesi",
    courseId: "c-1",
    courseTitle: "İsâgûcî ile mantığa giriş",
    weekNumber: 1,
    scheduledAt: null,
    weekCount: null,
    sessionCount: null,
    studentCount: null,
    archivedAt: new Date("2026-10-01T07:05:00Z"),
    archivedBy: {
      id: "u-2",
      name: "Ömer Nasuhi Bilmenoğlu",
      role: "KOSK_NAZIM",
    },
    canRestore: false,
  },
  {
    type: "session",
    id: "s-2",
    title: "Telafi celsesi: altı bâb",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    madrasahId: "m-1",
    madrasahName: "Süleymaniye Medresesi",
    courseId: "c-2",
    courseTitle: "Bina ve İzhar Şerhi",
    weekNumber: 2,
    scheduledAt: null,
    weekCount: null,
    sessionCount: null,
    studentCount: null,
    archivedAt: new Date("2026-09-28T13:10:00Z"),
    archivedBy: { ...self, role: "MUDERRIS" },
    canRestore: true,
  },
  {
    type: "week",
    id: "w-1",
    title: "Hafta 9: Genel tekrar",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    madrasahId: "m-1",
    madrasahName: "Süleymaniye Medresesi",
    courseId: "c-1",
    courseTitle: "İsâgûcî ile mantığa giriş",
    weekNumber: 9,
    scheduledAt: null,
    weekCount: null,
    sessionCount: 3,
    studentCount: null,
    archivedAt: new Date("2026-09-26T09:00:00Z"),
    archivedBy: { ...self, role: "MUDERRIS" },
    canRestore: true,
  },
  {
    type: "course",
    id: "c-9",
    title: "Merâhu’l-ervâh okumaları",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    madrasahId: "m-1",
    madrasahName: "Süleymaniye Medresesi",
    courseId: null,
    courseTitle: null,
    weekNumber: null,
    scheduledAt: null,
    weekCount: 12,
    sessionCount: null,
    studentCount: 14,
    archivedAt: new Date("2026-09-20T14:30:00Z"),
    archivedBy: { ...self, role: "MEDRESE_BASMUDERRIS" },
    canRestore: true,
  },
];
const listing = (over: Record<string, unknown> = {}) => ({
  items,
  total: 4,
  page: 1,
  limit: 10,
  counts: { all: 6, course: 1, week: 1, session: 3, recording: 0 },
  ...over,
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazir: resources.tr.nazir }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const page = async (tabParam?: string, number = 1) => {
  const { ArchivePage } = await import(
    "~/features/archive/components/archive-page"
  );
  return (
    <>
      {wrap(<ArchivePage madrasahId="m-1" tabParam={tabParam} page={number} />)}
    </>
  );
};
const markup = async (tabParam?: string, number = 1) =>
  html(await page(tabParam, number));
const mount = async (tabParam?: string, number = 1) => {
  const { ArchivePage } = await import(
    "~/features/archive/components/archive-page"
  );
  const { expand } = await import("./server-render");
  await render(
    wrap(
      await expand(
        <ArchivePage madrasahId="m-1" tabParam={tabParam} page={number} />
      )
    )
  );
  await settle(40);
};

const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.archive = { status: "ok", data: listing() };
  state.asked = [];
  for (const fn of [refresh, restoreItem, hideMedrese]) fn.mockReset();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Arşiv", () => {
  it("is headed with its sentence and asks for the first ten of everything", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Arşiv<\/h1>/);
    expect(textOf(out)).toContain(
      "Bu medresede gizlenen dersler, haftalar, celseler ve ders kayıtları. Hiçbiri silinmez; öğeyi gizleyen kademe ya da üstü geri alır."
    );
    expect(state.asked).toEqual([
      { id: "m-1", types: undefined, page: 1, limit: 10 },
    ]);
  });

  it("has the four tabs with the API's numbers, as links to their own addresses", async () => {
    const out = await markup();
    const tabs = out.match(/<nav[^>]*mds-tabs[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(textOf(tabs)).toBe(
      "Tümü 6 Dersler 1 Haftalar ve celseler 4 Ders kayıtları 0"
    );
    expect(tabs).toContain('href="/medrese/m-1/arsiv"');
    expect(tabs).toContain('href="/medrese/m-1/arsiv?tur=ders"');
    expect(tabs).toContain('href="/medrese/m-1/arsiv?tur=hafta-celse"');
    expect(tabs).toContain('href="/medrese/m-1/arsiv?tur=kayit"');
    expect(tabs).toMatch(/aria-current="page"[^>]*>Tümü/);
  });

  it("asks the API only for the types of the tab, and for the page", async () => {
    await markup("hafta-celse", 2);
    expect(state.asked).toEqual([
      { id: "m-1", types: "week,session", page: 2, limit: 10 },
    ]);
    expect(textOf(await markup("hafta-celse"))).toMatch(
      /Haftalar ve celseler 4/
    );
  });

  it("lists what is hidden: item and its place, kind, who hid it, when, and the action (criteria 1, 4)", async () => {
    const out = await markup();
    const table = out.slice(out.indexOf('data-testid="archive"'));
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(4);

    expect(rows[0]).toContain(
      "Mantığın tarifi ve konusu, 26 Eylül 19:00 celsesi"
    );
    expect(rows[0]).toContain("İsâgûcî ile mantığa giriş · Hafta 1");
    expect(rows[0]).toContain("Celse");
    expect(rows[0]).toContain("Ömer Nasuhi Bilmenoğlu Köşk nazımı");
    expect(rows[0]).toContain("Dün 10:05");

    expect(rows[1]).toContain("Mehmet Emin Işıkoğlu Müderris (siz)");
    expect(rows[1]).toContain("28 Eyl 16:10");

    expect(rows[2]).toContain("Hafta 9: Genel tekrar");
    expect(rows[2]).toContain("Hafta");

    expect(rows[3]).toContain("Merâhu’l-ervâh okumaları");
    expect(rows[3]).toContain("Nûruosmaniye Köşkü · 12 hafta · 14 talebe");
    expect(rows[3]).toContain("Ders");
    expect(rows[3]).toContain("Medrese başmüderrisi (siz)");
    expect(rows[3]).toContain("20 Eyl 17:30");
  });

  it("puts 'Geri al' on what the caller may bring back and the sentence where they may not (criterion 2)", async () => {
    const out = await markup();
    const table = out.slice(out.indexOf('data-testid="archive"'));
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows[0]).not.toContain("Geri al");
    expect(rows[0]).toContain(
      "Bunu köşk nazımı gizledi; yalnız o kademe ya da üstü geri alabilir."
    );
    for (const row of rows.slice(1)) {
      expect(row).toContain("Geri al");
      expect(row).not.toContain("yalnız o kademe");
    }
    // an appeal is not something the API reports, so it is not drawn
    expect(textOf(out)).not.toContain("İtiraz edildi");
  });

  it("shows 'Medreseyi gizle' under the list, with what it does and what it does not", async () => {
    const out = textOf(await markup());
    expect(out).toContain("Medreseyi gizle");
    expect(out).toContain(
      "Süleymaniye Medresesi ve dersleri bütün listelerden ve aramadan kalkar"
    );
    expect(out).toContain(
      "Hiçbir şey silinmez; medreseyi yalnız Medaris yönetimi geri getirebilir."
    );
  });

  it("says in one sentence what is missing on a tab with nothing hidden", async () => {
    state.archive = {
      status: "ok",
      data: listing({
        items: [],
        total: 0,
        counts: { all: 0, course: 0, week: 0, session: 0, recording: 0 },
      }),
    };
    expect(textOf(await markup())).toContain(
      "Bu medresede gizlenmiş bir öğe yok."
    );
    expect(textOf(await markup("ders"))).toContain(
      "Bu medresede gizlenmiş bir ders yok."
    );
    expect(textOf(await markup("kayit"))).toContain(
      "Bu medresede gizlenmiş bir ders kaydı yok."
    );
  });

  it("pages ten at a time, with links to the page before and after", async () => {
    state.archive = {
      status: "ok",
      data: listing({
        total: 24,
        page: 2,
        counts: { all: 24, course: 0, week: 0, session: 0, recording: 0 },
      }),
    };
    const out = await markup("ders", 2);
    expect(textOf(out)).toContain("11–20 / 24");
    expect(out).toContain('href="/medrese/m-1/arsiv?tur=ders"');
    expect(out).toContain('href="/medrese/m-1/arsiv?tur=ders&amp;sayfa=3"');
    state.archive = { status: "ok", data: listing() };
    expect(textOf(await markup())).not.toContain("Sonraki");
  });

  it("answers a refusal with a notice, without the list or a way to hide the medrese", async () => {
    state.archive = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain('data-testid="archive"');
    expect(textOf(out)).not.toContain("Medreseyi gizle");
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.archive = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Arşiv okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
    expect(text).not.toContain("Medreseyi gizle");
  });

  it("draws bars while the archive is read", async () => {
    const { ArchiveLoading } = await import(
      "~/features/archive/components/archive-page"
    );
    const out = await html(<ArchiveLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/mds-skeleton/g)?.length).toBeGreaterThan(3);
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("'Geri al'", () => {
  const restoreFor = (title: string) =>
    document.querySelector(
      `button[aria-label="Geri al: ${title}"]`
    ) as HTMLButtonElement;

  it("brings the item back at once, says so, and reads the list again (criterion 1)", async () => {
    restoreItem.mockResolvedValue({
      success: true,
      data: { title: "Telafi celsesi: altı bâb" },
    });
    await mount();
    await click(restoreFor("Telafi celsesi: altı bâb"));
    await settle(60);
    expect(restoreItem).toHaveBeenCalledExactlyOnceWith("session", "s-2");
    expect(toast("success")).toContain("Geri alındı");
    expect(toast("success")).toContain(
      "“Telafi celsesi: altı bâb” asıl yerinde yeniden görünür."
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("has no button where the sentence is", async () => {
    await mount();
    expect(
      document.querySelector(
        'button[aria-label="Geri al: Mantığın tarifi ve konusu, 26 Eylül 19:00 celsesi"]'
      )
    ).toBeNull();
    expect(
      document.querySelectorAll("[data-testid=restore-note]")
    ).toHaveLength(1);
  });

  it("says why when the kademe is too low after all, and reads the list again", async () => {
    restoreItem.mockResolvedValue({
      success: false,
      code: "ARCHIVE_FORBIDDEN",
    });
    await mount();
    await click(restoreFor("Hafta 9: Genel tekrar"));
    await settle(60);
    expect(toast("error")).toContain("Geri alınamadı");
    expect(toast("error")).toContain("Bunu geri alma yetkiniz yok");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says a hidden medrese or köşk is the reason, and has nothing to read again", async () => {
    restoreItem.mockResolvedValue({
      success: false,
      code: "ARCHIVE_PARENT_HIDDEN",
    });
    await mount();
    await click(restoreFor("Merâhu’l-ervâh okumaları"));
    await settle(60);
    expect(toast("error")).toContain(
      "Medreseyi yalnız Medaris yönetimi geri getirebilir."
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("'Medreseyi gizle'", () => {
  const open = async () => {
    await mount();
    await click(button(document.body, "Medreseyi gizle"));
    await settle(60);
  };
  const question = () =>
    document.querySelector("[role=alertdialog]") as HTMLElement | null;

  it("asks first, with the focus on 'Vazgeç', and says only Medaris yönetimi brings the medrese back", async () => {
    await open();
    const ask = question() as HTMLElement;
    expect(ask.textContent).toContain("Süleymaniye Medresesi");
    expect(ask.textContent).toContain("Hiçbir şey silinmez");
    expect(ask.textContent).toContain(
      "medreseyi yalnız Medaris yönetimi geri getirebilir"
    );
    expect(document.activeElement).toBe(button(ask, "Vazgeç"));
    expect(hideMedrese).not.toHaveBeenCalled();
  });

  it("hides the medrese on 'Gizle' and says it is done where the button was (criterion 3)", async () => {
    hideMedrese.mockResolvedValue({ success: true, data: null });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(hideMedrese).toHaveBeenCalledExactlyOnceWith("m-1");
    expect(question()).toBeNull();
    expect(toast("success")).toContain("Medrese gizlendi");
    const section = document.querySelector(
      "[data-testid=hide-madrasah]"
    ) as HTMLElement;
    expect(section.textContent).toContain(
      "Geri getirmek için Medaris yönetimiyle görüşün."
    );
    expect(button(section, "Medreseyi gizle")).toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("takes a medrese that is hidden already as done, and says so", async () => {
    hideMedrese.mockResolvedValue({
      success: false,
      code: "MADRASAH_ALREADY_HIDDEN",
    });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(toast("info")).toContain("Bu medrese zaten gizli.");
  });

  it("keeps the button and says why when the API refuses", async () => {
    hideMedrese.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await open();
    await click(button(question() as HTMLElement, "Gizle"));
    await settle(80);
    expect(toast("error")).toContain("Medrese gizlenemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(button(document.body, "Medreseyi gizle")).toBeDefined();
  });

  it("hides nothing on 'Vazgeç'", async () => {
    await open();
    await click(button(question() as HTMLElement, "Vazgeç"));
    await settle(60);
    expect(question()).toBeNull();
    expect(hideMedrese).not.toHaveBeenCalled();
  });
});
