// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLANK,
  counterOf,
  type Filters,
  filtersOf,
  lastPage,
  listRequest,
  pagerOf,
  studentsHref,
} from "~/features/students/students";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Talebeler (nazir 10) as the server renders it, and what can be done on it:
 * filter, search, page and "Yasakla". The reads, the portal and the actions are
 * stubs; what is under test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  students: { status: "failed" } as Answer<unknown>,
  courses: { status: "failed" } as Answer<unknown[]>,
  asked: [] as unknown[],
};
const refresh = vi.fn();
const replace = vi.fn();
const banPerson = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      madrasahs: {
        getMadrasahStudents: async (request: unknown) => {
          state.asked.push(request);
        },
        getMadrasahCourses: async () => {},
      },
    });
    return what.includes("courses") ? state.courses : state.students;
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
vi.mock("~/features/nazirs/actions", () => ({ lookupPerson: vi.fn() }));
vi.mock("~/features/bans/actions", () => ({
  banPerson: (id: string, request: unknown) => banPerson(id, request),
  liftBan: vi.fn(),
  escalateBan: vi.fn(),
  requestPermanentBan: vi.fn(),
}));

const ISAGUCI = { id: "c-1", title: "İsâgûcî ile mantığa giriş" };
const BINA = { id: "c-2", title: "Bina ve İzhar Şerhi" };
const COURSE_ID = "5b6f8d7e-0c1a-4d3b-8a2e-1f9c3d4e5a6b";

const student = (n: number, over: Record<string, unknown> = {}) => ({
  userId: `u-${n}`,
  name: `Talebe ${n}`,
  email: `talebe.${n}@example.com`,
  firstEnrolledAt: new Date("2026-09-30T10:00:00+03:00"),
  ongoingCourses: [{ ...ISAGUCI, completedAt: null }],
  completedCourses: [],
  ...over,
});

/** The first page of the canvas: ten of 48, the last of them with a course finished. */
const first = (): unknown[] => [
  student(1, {
    name: "Sümeyye Nur Ekincioğlu",
    email: "sumeyyenur.ekincioglu@example.com",
  }),
  ...Array.from({ length: 8 }, (_, i) => student(i + 2)),
  student(10, {
    name: "İbrahim Halil Akdoğanlı",
    ongoingCourses: [{ ...BINA, completedAt: null }],
    completedCourses: [
      { ...ISAGUCI, completedAt: new Date("2026-09-02T09:00:00+03:00") },
    ],
    firstEnrolledAt: new Date("2025-12-02T09:00:00+03:00"),
  }),
];
const answer = (items: unknown[], total = 48, page = 1) => ({
  status: "ok" as const,
  data: { items, total, page, limit: 10 },
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

const element = async (filters: Filters = BLANK) => {
  const { StudentsPage } = await import(
    "~/features/students/components/students-page"
  );
  return wrap(<StudentsPage madrasahId="m-1" filters={filters} />);
};
const markup = async (filters?: Filters) => html(await element(filters));
const mount = async (filters?: Filters) => {
  await render((await expand(await element(filters))) as ReactElement);
  await settle(40);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const reason = () =>
  dialog().querySelector("textarea[name=reason]") as HTMLTextAreaElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.students = answer(first());
  state.courses = { status: "ok", data: [ISAGUCI, BINA] };
  state.asked = [];
  for (const fn of [refresh, replace, banPerson]) fn.mockReset();
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("what the list asks the API for", () => {
  it("reads the filters of an address and drops a value nobody knows", () => {
    expect(
      filtersOf({
        ara: " Nur ",
        ders: COURSE_ID,
        durum: "tamamladi",
        sayfa: "3",
      })
    ).toEqual({ q: "Nur", courseId: COURSE_ID, status: "COMPLETED", page: 3 });
    expect(
      filtersOf({ ders: "not-an-id", durum: "bogus", sayfa: "-2" })
    ).toEqual(BLANK);
    expect(filtersOf({ ara: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("writes only what is chosen into the address, and the first page not at all", () => {
    expect(studentsHref("m-1", BLANK)).toBe("/medrese/m-1/talebeler");
    expect(
      studentsHref("m-1", {
        q: "nur",
        courseId: COURSE_ID,
        status: "ENROLLED",
        page: 2,
      })
    ).toBe(
      `/medrese/m-1/talebeler?ara=nur&ders=${COURSE_ID}&durum=devam&sayfa=2`
    );
  });

  it("asks for ten, the page and the filters", () => {
    expect(listRequest(BLANK)).toEqual({
      page: 1,
      limit: 10,
      q: undefined,
      courseId: undefined,
      status: undefined,
    });
    expect(
      listRequest({
        q: "nur",
        courseId: COURSE_ID,
        status: "COMPLETED",
        page: 4,
      })
    ).toEqual({
      page: 4,
      limit: 10,
      q: "nur",
      courseId: COURSE_ID,
      status: "COMPLETED",
    });
  });
});

describe("the pager's words (criterion 2)", () => {
  const t = translatorFor("nazir");
  const pager = (page: number, total = 48) =>
    pagerOf("m-1", BLANK, { total, page, limit: 10 }, t, "tr");

  it("says the page, the pages and which of the talebe are on it", () => {
    expect(pager(1).range).toBe("Sayfa 1 / 5 · 48 talebeden 1–10");
    expect(pager(2).range).toBe("Sayfa 2 / 5 · 48 talebeden 11–20");
    expect(pager(5).range).toBe("Sayfa 5 / 5 · 48 talebeden 41–48");
  });

  it("leads to the pages either side, and to none past the first and the last", () => {
    expect(pager(1)).toMatchObject({
      previousHref: null,
      nextHref: "/medrese/m-1/talebeler?sayfa=2",
    });
    expect(pager(3)).toMatchObject({
      previousHref: "/medrese/m-1/talebeler?sayfa=2",
      nextHref: "/medrese/m-1/talebeler?sayfa=4",
    });
    expect(pager(5)).toMatchObject({
      previousHref: "/medrese/m-1/talebeler?sayfa=4",
      nextHref: null,
    });
    // the first page's link is the list's own address
    expect(pager(2).previousHref).toBe("/medrese/m-1/talebeler");
  });

  it("counts the talebe over every page, and the last page of a list", () => {
    expect(counterOf(48, t, "tr")).toBe("48 talebe");
    expect(counterOf(1480, t, "tr")).toBe("1.480 talebe");
    expect(lastPage(48)).toBe(5);
    expect(lastPage(0)).toBe(1);
  });
});

describe("Talebeler", () => {
  it("is headed with the medrese's possessive and counts the talebe (criterion 2)", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Talebeler<\/h1>/);
    expect(textOf(out)).toContain(
      "Süleymaniye Medresesi’nin bir dersine kayıtlı olan ya da bir dersini tamamlayan herkes"
    );
    expect(out).toMatch(/data-testid="counter"[^>]*>48 talebe</);
  });

  it("asks for the first ten of the medrese, with no filter", async () => {
    await markup();
    expect(state.asked).toEqual([
      {
        id: "m-1",
        page: 1,
        limit: 10,
        q: undefined,
        courseId: undefined,
        status: undefined,
      },
    ]);
  });

  it("lists each talebe with e-mail, the courses attended and finished, and the first enrolment", async () => {
    const out = await markup();
    const table = out.slice(out.indexOf('data-testid="students"'));
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toContain("Sümeyye Nur Ekincioğlu");
    expect(rows[0]).toContain("sumeyyenur.ekincioglu@example.com");
    expect(rows[0]).toContain("İsâgûcî ile mantığa giriş");
    expect(rows[0]).toContain("30 Eyl");
    expect(rows[9]).toContain("Bina ve İzhar Şerhi");
    // a course finished is named with the day the course team marked it
    expect(rows[9]).toContain("İsâgûcî ile mantığa giriş 2 Eyl");
    // an enrolment of another year says the year
    expect(rows[9]).toContain("2 Ara 2025");
  });

  it("says 'Yok' for a talebe who has finished nothing (criterion 3)", async () => {
    const out = await markup();
    const table = out.slice(out.indexOf('data-testid="students"'));
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows[0]).toContain("Yok");
    expect(rows[9]).not.toContain("Yok");
  });

  it("offers 'Yasakla' on every row and says the talebe's outside courses are not listed", async () => {
    const out = await markup();
    expect(out.match(/aria-label="Yasakla: /g)).toHaveLength(10);
    expect(textOf(out)).toContain(
      "Talebenin medrese dışındaki dersleri bu listede yer almaz."
    );
  });

  it("writes the pager under the table, with 'Önceki' off on the first page", async () => {
    const out = await markup();
    expect(textOf(out)).toContain("Sayfa 1 / 5 · 48 talebeden 1–10");
    expect(out).toContain('href="/medrese/m-1/talebeler?sayfa=2"');
    expect(out).toMatch(/aria-disabled="true"[^>]*>[^<]*(<[^>]*>)*[^<]*Önceki/);
  });

  it("asks for the page, and for the filters, an address names (criterion 2: 11–20)", async () => {
    state.students = answer(
      Array.from({ length: 10 }, (_, i) => student(i + 11)),
      48,
      2
    );
    const out = await markup({
      q: "nur",
      courseId: COURSE_ID,
      status: "ENROLLED",
      page: 2,
    });
    expect(state.asked).toEqual([
      {
        id: "m-1",
        page: 2,
        limit: 10,
        q: "nur",
        courseId: COURSE_ID,
        status: "ENROLLED",
      },
    ]);
    expect(textOf(out)).toContain("Sayfa 2 / 5 · 48 talebeden 11–20");
  });

  it("goes to the last page when the address names one past it", async () => {
    state.students = answer([], 48, 9);
    await expect(markup({ ...BLANK, page: 9 })).rejects.toThrow(
      "NEXT_REDIRECT /medrese/m-1/talebeler?sayfa=5"
    );
  });

  it("offers every course of the medrese and the two states in the filters", async () => {
    const out = await markup();
    const bar = out.slice(out.indexOf("<fieldset"), out.indexOf("</fieldset>"));
    expect(textOf(bar)).toContain("Bütün dersler");
    expect(textOf(bar)).toContain("Bütün durumlar");
    expect(textOf(bar)).toContain("48 talebe");
    state.courses = { status: "failed" };
    expect(textOf(await markup())).toContain("Bütün dersler");
  });

  it("says in one sentence that nobody is listed, and what to do about a filter that hides everyone", async () => {
    state.students = answer([], 0);
    const empty = await markup();
    expect(textOf(empty)).toContain(
      "Bu medresenin derslerine kayıtlı talebe henüz yok."
    );
    expect(textOf(empty)).not.toContain("Sayfa 1");
    const filtered = textOf(await markup({ ...BLANK, q: "zzz" }));
    expect(filtered).toContain("Bu süzgece uyan talebe yok.");
    expect(filtered).toContain("Süzgeçleri temizle");
  });

  it("answers a refusal with a notice, without the list", async () => {
    state.students = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain('data-testid="students"');
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.students = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Talebeler okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the talebe are read", async () => {
    const { StudentsLoading } = await import(
      "~/features/students/components/students-page"
    );
    const out = await html(<StudentsLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the filters and the search", () => {
  const choose = async (select: string, option: string) => {
    await click(byLabel(select));
    await settle(40);
    const row = [...document.querySelectorAll("[role=option]")].find(
      (o) => o.textContent?.trim() === option
    );
    await click(row as Element);
    await settle(40);
  };

  it("ask the server for the narrowed list by changing the address, from the first page", async () => {
    await mount({ ...BLANK, page: 3 });
    await choose("Ders", "Bina ve İzhar Şerhi");
    expect(replace).toHaveBeenLastCalledWith("/medrese/m-1/talebeler?ders=c-2");
  });

  it("keep the other filters when one changes, and clear with 'Bütün durumlar'", async () => {
    state.courses = { status: "ok", data: [{ id: COURSE_ID, title: "Bina" }] };
    await mount({ q: "", courseId: COURSE_ID, status: "COMPLETED", page: 1 });
    await choose("Durum", "Devam ediyor");
    expect(replace).toHaveBeenLastCalledWith(
      `/medrese/m-1/talebeler?ders=${COURSE_ID}&durum=devam`
    );
    await choose("Durum", "Bütün durumlar");
    expect(replace).toHaveBeenLastCalledWith(
      `/medrese/m-1/talebeler?ders=${COURSE_ID}`
    );
  });

  it("search once the person has stopped typing, and from the first page", async () => {
    vi.useRealTimers();
    await mount({ ...BLANK, page: 1 });
    const field = document.querySelector(
      "input[type=search]"
    ) as HTMLInputElement;
    await typeInto(field, "Nur");
    expect(replace).not.toHaveBeenCalled();
    await settle(450);
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/medrese/m-1/talebeler?ara=Nur"
    );
  });
});

describe("'Yasakla' (nazir 10)", () => {
  const open = async (name = "Sümeyye Nur Ekincioğlu") => {
    await mount();
    await click(byLabel(`Yasakla: ${name}`));
    await settle(80);
  };
  const submit = () => buttonIn(dialog(), "Yasakla");
  const radios = () => [...dialog().querySelectorAll("[role=radio]")];

  it("opens a dialog for that talebe, with their courses and the whole medrese to choose from", async () => {
    await open("İbrahim Halil Akdoğanlı");
    expect(dialog().textContent).toContain("İbrahim Halil Akdoğanlı");
    expect(dialog().textContent).toContain("Süleymaniye Medresesi");
    // the courses they attend, then the ones they finished, then the medrese
    const labels = radios().map((r) => r.closest("label")?.textContent?.trim());
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain("Bina ve İzhar Şerhi");
    expect(labels[1]).toContain("İsâgûcî ile mantığa giriş");
    expect(labels[2]).toContain("Medrese düzeyi");
    // the narrowest scope is the one chosen
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("keeps the button off until a reason is written, and says so once the field is left empty (_kurallar 14)", async () => {
    await open();
    expect(submit().disabled).toBe(true);
    await act(async () => {
      reason().focus();
      reason().blur();
    });
    expect(dialog().textContent).toContain("Bir gerekçe yazın.");
    await typeInto(reason(), "   ");
    expect(submit().disabled).toBe(true);
    await typeInto(reason(), "Ders kayıtlarını izinsiz paylaştı.");
    expect(submit().disabled).toBe(false);
  });

  it("bars the talebe from the chosen course with the reason trimmed, says so and reads the list again", async () => {
    banPerson.mockResolvedValue({ success: true, data: null });
    await open();
    await typeInto(reason(), "  Derste reklam yaptı.  ");
    await click(submit());
    await settle(60);

    expect(banPerson).toHaveBeenCalledExactlyOnceWith("m-1", {
      userId: "u-1",
      scope: "COURSE",
      courseId: "c-1",
      reason: "Derste reklam yaptı.",
    });
    expect(toast("success")).toContain("Yasak kaydedildi");
    expect(toast("success")).toContain(
      "Sümeyye Nur Ekincioğlu artık “İsâgûcî ile mantığa giriş” dersine erişemez."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("bars the talebe from the whole medrese when that is chosen", async () => {
    banPerson.mockResolvedValue({ success: true, data: null });
    await open();
    await click(radios()[1] as Element);
    await typeInto(reason(), "Hesabını paylaştı.");
    await click(submit());
    await settle(60);

    expect(banPerson).toHaveBeenCalledExactlyOnceWith("m-1", {
      userId: "u-1",
      scope: "MADRASAH",
      reason: "Hesabını paylaştı.",
    });
    expect(toast("success")).toContain(
      "Sümeyye Nur Ekincioğlu artık medresenin hiçbir dersine erişemez."
    );
  });

  it("keeps the dialog and the reason, and says why, when the API refuses", async () => {
    banPerson.mockResolvedValue({ success: false, code: "BAN_TARGET_INVALID" });
    await open();
    await typeInto(reason(), "Derste reklam yaptı.");
    await click(submit());
    await settle(60);

    expect(toast("error")).toContain("Yasak konamadı");
    expect(toast("error")).toContain("Bu kişi yasaklanamaz");
    expect(dialog()).not.toBeNull();
    expect(reason().value).toBe("Derste reklam yaptı.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes on 'Vazgeç' without sending anything", async () => {
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(banPerson).not.toHaveBeenCalled();
  });
});
