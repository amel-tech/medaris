// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Filters } from "~/features/courses/courses";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Dersler (nazir 07) as the server renders it, and the three things that can
 * be done on it: filter, change a course's müderrisler (nazir 17) and hide it
 * (nazir 18). The reads, the portal and the actions are stubs; what is under
 * test is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  courses: { status: "failed" } as Answer<unknown[]>,
  hosting: { status: "failed" } as Answer<unknown[]>,
  asked: [] as unknown[],
  /** Whether `GET /me` calls the viewer the başnazım. */
  systemAdmin: false,
};
const refresh = vi.fn();
const replace = vi.fn();
const lookupPerson = vi.fn();
const replaceMuderris = vi.fn();
const hideCourse = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
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
        getMadrasahCourses: async (request: unknown) => {
          state.asked.push(request);
        },
        getMadrasahHostingKosks: async () => {},
      },
    });
    return what.includes("hosting") ? state.hosting : state.courses;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({
    id: "u-1",
    timeZone: "Europe/Istanbul",
    roles: { systemAdmin: state.systemAdmin },
  }),
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
      {
        kind: "ders",
        id: "c-1",
        name: "Bina ve İzhar Şerhi",
        role: "MUDERRIS",
        isImam: true,
        koskName: "Nûruosmaniye Köşkü",
      },
    ],
  }),
}));
vi.mock("~/features/nazirs/actions", () => ({
  lookupPerson: (email: string) => lookupPerson(email),
}));
vi.mock("~/features/courses/actions", () => ({
  openCourse: vi.fn(),
  replaceMuderris: (id: string, courseId: string, request: unknown) =>
    replaceMuderris(id, courseId, request),
  hideCourse: (id: string, courseId: string) => hideCourse(id, courseId),
}));

const person = (userId: string, name: string, over = {}) => ({
  userId,
  name,
  title: null,
  email: `${userId}@example.com`,
  isImam: false,
  ...over,
});
const ISIKOGLU = person("u-1", "Mehmet Emin Işıkoğlu", { isImam: true });
const KARAOSMANOGLU = person("u-2", "Abdülhamit Karaosmanoğlu");

/** The three courses of the canvas: two published with talebe waiting, one draft opened today. */
const courses = [
  {
    id: "c-1",
    title: "Bina ve İzhar Şerhi",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    status: "PUBLISHED",
    requiresApproval: false,
    closed: false,
    createdAt: new Date("2026-09-20T09:00:00Z"),
    studentCount: 35,
    pendingCount: 2,
    muderris: [ISIKOGLU, KARAOSMANOGLU],
  },
  {
    id: "c-2",
    title: "İsâgûcî ile mantığa giriş",
    koskId: "k-2",
    koskName: "Fatih Köşkü",
    status: "PUBLISHED",
    requiresApproval: false,
    closed: false,
    createdAt: new Date("2026-09-21T09:00:00Z"),
    studentCount: 24,
    pendingCount: 2,
    muderris: [ISIKOGLU],
  },
  {
    id: "c-3",
    title: "Maksûd şerhi",
    koskId: "k-1",
    koskName: "Nûruosmaniye Köşkü",
    status: "DRAFT",
    requiresApproval: false,
    closed: false,
    createdAt: new Date("2026-10-02T10:00:00+03:00"),
    studentCount: 0,
    pendingCount: 0,
    muderris: [ISIKOGLU, person("u-3", "Ayşe Nur Kılıçarslan")],
  },
];
const kosks = [
  {
    id: "k-1",
    name: "Nûruosmaniye Köşkü",
    courseCount: 2,
  },
  { id: "k-2", name: "Fatih Köşkü", courseCount: 1 },
];
const none: Filters = { kosk: null, status: null };

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

const element = async (filters: Filters = none) => {
  const { CoursesPage } = await import(
    "~/features/courses/components/courses-page"
  );
  return wrap(<CoursesPage madrasahId="m-1" filters={filters} />);
};
const markup = async (filters?: Filters) => html(await element(filters));
const mount = async (filters?: Filters) => {
  await render((await expand(await element(filters))) as ReactElement);
  await settle(40);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const emailField = () =>
  dialog().querySelector("input[type=email]") as HTMLInputElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.courses = { status: "ok", data: courses };
  state.hosting = { status: "ok", data: kosks };
  state.asked = [];
  state.systemAdmin = false;
  for (const fn of [
    refresh,
    replace,
    lookupPerson,
    replaceMuderris,
    hideCourse,
  ]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Dersler", () => {
  it("is headed with the medrese's own possessive and has the two buttons of the canvas", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Dersler<\/h1>/);
    expect(textOf(out)).toContain(
      "Süleymaniye Medresesi’nin dersleri, açıldıkları köşkle birlikte."
    );
    expect(out).toContain('href="/medrese/m-1/dersler/yeni"');
    expect(out).toContain('href="/medrese/m-1/dersler/talep"');
    expect(textOf(out)).toContain("Medrese dışı ders talebi gönder");
    expect(textOf(out)).toContain("Medrese dersi aç");
  });

  it("asks for every course of the medrese when nothing is chosen", async () => {
    await markup();
    expect(state.asked).toEqual([
      { id: "m-1", koskId: undefined, status: undefined },
    ]);
  });

  it("lists the courses with their köşk, müderrisler, talebe and state (criteria 1, 3, 4)", async () => {
    const out = await markup();
    const table = out.slice(out.indexOf('data-testid="courses"'));
    const rows = table.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(3);

    expect(rows[0]).toContain("Bina ve İzhar Şerhi");
    expect(rows[0]).toContain("Nûruosmaniye Köşkü");
    expect(rows[0]).not.toContain("bugün açıldı");
    expect(rows[0]).toContain(
      "Mehmet Emin Işıkoğlu Dersin imamı Abdülhamit Karaosmanoğlu"
    );
    expect(rows[0]).toContain("35");
    expect(rows[0]).toContain("2 onay bekliyor");
    expect(rows[0]).toContain("Yayında");

    expect(rows[1]).toContain("Fatih Köşkü");
    expect(rows[1]).toContain("24");

    expect(rows[2]).toContain("Maksûd şerhi");
    expect(rows[2]).toContain("Nûruosmaniye Köşkü · bugün açıldı");
    expect(rows[2]).toContain("Henüz talebe yok");
    expect(rows[2]).not.toContain("onay bekliyor");
    expect(rows[2]).toContain("Taslak");
  });

  it("counts the courses and the köşks on screen", async () => {
    expect(textOf(await markup())).toContain("3 ders · 2 köşkte");
  });

  it("names a course's page only where the caller holds a scope in it", async () => {
    const out = await markup();
    expect(out).toContain('href="/ders/c-1"');
    expect(out).not.toContain('href="/ders/c-2"');
  });

  it("names every course's page for the başnazım, who opens any course by its address", async () => {
    state.systemAdmin = true;
    const out = await markup();
    for (const id of ["c-1", "c-2", "c-3"]) {
      expect(out).toContain(`href="/ders/${id}"`);
    }
  });

  it("lists the köşks that host the medrese beside the table, with their courses", async () => {
    const out = await markup();
    const side = out.slice(out.indexOf('data-testid="hosting-kosks"'));
    expect(textOf(side)).toContain("Nûruosmaniye Köşkü 2 medrese dersi");
    expect(textOf(side)).toContain("Fatih Köşkü 1 medrese dersi");
    expect(textOf(side)).not.toContain("Arapça dil ilimleri");
    expect(textOf(out)).toContain("Ders açabileceğiniz köşkler");
    expect(textOf(out)).toContain("Medrese dışı ders");
  });

  it("closes the note that hidden courses are in the Arşiv, with a link there", async () => {
    const out = await markup();
    expect(textOf(out)).toContain(
      "Gizlenen dersler bu listede yer almaz; Arşiv ’de görünür."
    );
    expect(out).toContain('href="/medrese/m-1/arsiv"');
  });

  it("asks the API for the köşk and the state chosen (criterion 2)", async () => {
    await markup({ kosk: "k-2", status: "DRAFT" });
    expect(state.asked).toEqual([
      { id: "m-1", koskId: "k-2", status: "DRAFT" },
    ]);
  });

  it("shows the filter as chosen, and still offers every köşk that hosts the medrese", async () => {
    const out = await markup({ kosk: "k-2", status: null });
    const bar = out.slice(out.indexOf("<fieldset"), out.indexOf("</fieldset>"));
    expect(textOf(bar)).toContain("Köşk: Fatih Köşkü");
    expect(textOf(bar)).toContain("Durum: tümü");
    state.courses = { status: "ok", data: [courses[1]] };
    expect(textOf(await markup({ kosk: "k-2", status: null }))).toContain(
      "1 ders · 1 köşkte"
    );
  });

  it("says in one sentence that nothing is listed, and what to do about a filter that hides everything", async () => {
    state.courses = { status: "ok", data: [] };
    const none1 = await markup();
    expect(textOf(none1)).toContain("Bu medresede henüz ders yok.");
    expect(textOf(none1)).toContain("Gösterilecek ders yok");
    const filtered = await markup({ kosk: "k-2", status: "DRAFT" });
    expect(textOf(filtered)).toContain("Bu süzgece uyan ders yok.");
    expect(textOf(filtered)).toContain("Süzgeçleri temizle");
    expect(filtered).toContain('href="/medrese/m-1/dersler"');
  });

  it("turns 'Medrese dersi aç' off where no köşk hosts the medrese, and says why", async () => {
    state.hosting = { status: "ok", data: [] };
    const out = await markup();
    expect(out).toMatch(
      /<a[^>]*aria-disabled="true"[^>]*>[^<]*(<[^>]*>)*[^<]*Medrese dersi aç/
    );
    expect(out).not.toContain('href="/medrese/m-1/dersler/yeni"');
    expect(textOf(out)).toContain(
      "Henüz hiçbir köşk medresenize barındırma hakkı vermedi."
    );
  });

  it("keeps the list and the button when only the köşks cannot be read", async () => {
    state.hosting = { status: "failed" };
    const out = await markup();
    expect(textOf(out)).toContain("Köşkler şu an okunamadı.");
    expect(out).toContain('href="/medrese/m-1/dersler/yeni"');
    expect(textOf(out)).toContain("Bina ve İzhar Şerhi");
  });

  it("answers a refusal with a notice, without the list or the buttons that open a course", async () => {
    state.courses = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain('data-testid="courses"');
    expect(textOf(out)).not.toContain("Medrese dersi aç");
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.courses = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Dersler okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the courses are read", async () => {
    const { CoursesLoading } = await import(
      "~/features/courses/components/courses-page"
    );
    const out = await html(<CoursesLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/mds-skeleton/g)?.length).toBeGreaterThan(3);
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the filters", () => {
  const choose = async (select: string, option: string) => {
    await click(byLabel(select));
    await settle(40);
    const row = [...document.querySelectorAll("[role=option]")].find(
      (o) => o.textContent?.trim() === option
    );
    await click(row as Element);
    await settle(40);
  };

  it("ask the server for the narrowed list by changing the address", async () => {
    await mount();
    await choose("Durum", "Durum: Taslak");
    expect(replace).toHaveBeenLastCalledWith(
      "/medrese/m-1/dersler?durum=taslak"
    );
    await choose("Köşk", "Köşk: Fatih Köşkü");
    expect(replace).toHaveBeenLastCalledWith("/medrese/m-1/dersler?kosk=k-2");
  });

  it("keep the other filter when one changes, and clear with 'tümü'", async () => {
    await mount({ kosk: "k-2", status: "PUBLISHED" });
    await choose("Durum", "Durum: Taslak");
    expect(replace).toHaveBeenLastCalledWith(
      "/medrese/m-1/dersler?kosk=k-2&durum=taslak"
    );
    await choose("Köşk", "Köşk: tümü");
    expect(replace).toHaveBeenLastCalledWith(
      "/medrese/m-1/dersler?durum=yayinda"
    );
  });
});

describe("'Müderrisleri değiştir' (nazir 17)", () => {
  const open = async (title = "Bina ve İzhar Şerhi") => {
    await mount();
    await click(byLabel(`Diğer işlemler: ${title}`));
    await settle(40);
    const item = [...document.querySelectorAll("[role=menuitem]")].find(
      (i) => i.textContent?.trim() === "Müderrisleri değiştir"
    );
    await click(item as Element);
    await settle(80);
  };
  const search = async (address: string) => {
    await typeInto(emailField(), address);
    await key(emailField(), "Enter");
    await settle(40);
  };
  const found = {
    kind: "found",
    person: {
      id: "u-9",
      name: "Ayşe Nur Kılıçarslan",
      email: "a.kilicarslan@example.com",
    },
  };
  const save = () => buttonIn(dialog(), "Kaydet");

  it("opens for the course, with its müderrisler, the imam marked, and nothing to save yet", async () => {
    await open();
    expect(dialog().textContent).toContain("Bina ve İzhar Şerhi");
    expect(dialog().textContent).toContain("Müderrisleri değiştir");
    expect(dialog().textContent).toContain(
      "Müderris listesini medrese adına siz değiştirirsiniz; köşk nazımı değiştiremez."
    );
    expect(dialog().textContent).toContain("Mehmet Emin Işıkoğlu");
    expect(dialog().textContent).toContain("u-1@example.com");
    expect(dialog().textContent).toContain("Abdülhamit Karaosmanoğlu");
    expect(dialog().textContent).toContain("2 müderris");
    expect(dialog().querySelectorAll("[role=radio]")).toHaveLength(2);
    expect(
      dialog()
        .querySelector(
          '[role=radio][aria-label="Dersin imamı: Mehmet Emin Işıkoğlu"]'
        )
        ?.getAttribute("aria-checked")
    ).toBe("true");
    expect(save().disabled).toBe(true);
    // a form dialog starts in its first field
    expect(document.activeElement).toBe(emailField());
  });

  it("takes the second müderris off and saves the list without them (criteria 2 and 4)", async () => {
    replaceMuderris.mockResolvedValue({ success: true, data: null });
    await open();
    await click(byLabel("Çıkar: Abdülhamit Karaosmanoğlu"));
    expect(dialog().textContent).toContain("1 müderris");
    // a lone müderris is the imam: no radio to choose with
    expect(dialog().querySelectorAll("[role=radio]")).toHaveLength(0);
    expect(dialog().textContent).toContain("Dersin imamı");
    expect(save().disabled).toBe(false);
    await click(save());
    await settle(60);

    expect(replaceMuderris).toHaveBeenCalledExactlyOnceWith("m-1", "c-1", {
      muderrisUserIds: ["u-1"],
      imamUserId: "u-1",
    });
    expect(toast("success")).toContain("Müderrisler kaydedildi");
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("will not take the last müderris off (criterion 1)", async () => {
    await open("İsâgûcî ile mantığa giriş");
    const last = byLabel("Çıkar: Mehmet Emin Işıkoğlu") as HTMLButtonElement;
    expect(last.disabled).toBe(true);
    expect(save().disabled).toBe(true);
  });

  it("adds the person an exact address finds, once, and sends the whole list", async () => {
    lookupPerson.mockResolvedValue(found);
    replaceMuderris.mockResolvedValue({ success: true, data: null });
    await open();
    await search("a.kilicarslan@example.com");

    expect(lookupPerson).toHaveBeenCalledExactlyOnceWith(
      "a.kilicarslan@example.com"
    );
    expect(dialog().textContent).toContain("3 müderris");
    expect(dialog().textContent).toContain("a.kilicarslan@example.com");
    expect(emailField().value).toBe("");
    // the imam stays the one who was
    expect(
      dialog()
        .querySelector(
          '[role=radio][aria-label="Dersin imamı: Mehmet Emin Işıkoğlu"]'
        )
        ?.getAttribute("aria-checked")
    ).toBe("true");
    await click(save());
    await settle(60);
    expect(replaceMuderris).toHaveBeenCalledExactlyOnceWith("m-1", "c-1", {
      muderrisUserIds: ["u-1", "u-2", "u-9"],
      imamUserId: "u-1",
    });
  });

  it("says so when the person is already listed, when no account has the address and when the directory is down", async () => {
    await open();
    lookupPerson.mockResolvedValue({
      kind: "found",
      person: { id: "U-2", name: "Abdülhamit Karaosmanoğlu", email: null },
    });
    await search("a.karaosmanoglu@example.com");
    expect(dialog().textContent).toContain("Bu kişi zaten listede.");
    expect(dialog().textContent).toContain("2 müderris");

    lookupPerson.mockResolvedValue({ kind: "none" });
    await search("kimse@example.com");
    expect(dialog().textContent).toContain(
      "Bu e-posta adresiyle kayıtlı bir hesap bulunamadı."
    );
    lookupPerson.mockResolvedValue({ kind: "unavailable" });
    await search("baska@example.com");
    expect(dialog().textContent).toContain(
      "Arama şu an yapılamıyor. Biraz sonra yeniden deneyin."
    );
    expect(save().disabled).toBe(true);
  });

  it("does not search text that cannot be an address", async () => {
    await open();
    await search("abdulhamit");
    expect(lookupPerson).not.toHaveBeenCalled();
  });

  it("asks for the imam when the imam leaves among several, and sends the one chosen (criterion 2)", async () => {
    lookupPerson.mockResolvedValue(found);
    replaceMuderris.mockResolvedValue({ success: true, data: null });
    await open();
    await search("a.kilicarslan@example.com");
    await click(byLabel("Çıkar: Mehmet Emin Işıkoğlu"));

    expect(dialog().textContent).toContain("Dersin imamını seçin.");
    expect(save().disabled).toBe(true);
    await click(
      dialog().querySelector(
        '[role=radio][aria-label="Dersin imamı: Ayşe Nur Kılıçarslan"]'
      ) as Element
    );
    expect(dialog().textContent).not.toContain("Dersin imamını seçin.");
    expect(save().disabled).toBe(false);
    await click(save());
    await settle(60);
    expect(replaceMuderris).toHaveBeenCalledExactlyOnceWith("m-1", "c-1", {
      muderrisUserIds: ["u-2", "u-9"],
      imamUserId: "u-9",
    });
  });

  it("shows a müderris with no account without a radio or a way to take them off, and sends only accounts", async () => {
    state.courses = {
      status: "ok",
      data: [
        {
          ...courses[2],
          muderris: [
            person("u-1", "Mehmet Emin Işıkoğlu", { isImam: true }),
            person("", "Konuk Müderris", { userId: null, email: null }),
          ],
        },
      ],
    };
    await open("Maksûd şerhi");
    expect(dialog().textContent).toContain("Konuk Müderris");
    expect(dialog().textContent).toContain(
      "Hesabı olmayan müderris; bu listeden değiştirilemez."
    );
    expect(byLabel("Çıkar: Konuk Müderris")).toBeNull();
    expect(dialog().querySelectorAll("[role=radio]")).toHaveLength(0);
    expect(dialog().textContent).toContain("2 müderris");
    // the one account is the last: it stays
    expect(
      (byLabel("Çıkar: Mehmet Emin Işıkoğlu") as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("keeps the dialog and says why when the API refuses (criterion 3: a köşk nazımı is refused)", async () => {
    replaceMuderris.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await open();
    await click(byLabel("Çıkar: Abdülhamit Karaosmanoğlu"));
    await click(save());
    await settle(60);

    expect(toast("error")).toContain("Müderrisler kaydedilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(dialog()).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and reads the list again when the course is gone", async () => {
    replaceMuderris.mockResolvedValue({
      success: false,
      code: "MADRASAH_COURSE_NOT_FOUND",
    });
    await open();
    await click(byLabel("Çıkar: Abdülhamit Karaosmanoğlu"));
    await click(save());
    await settle(60);
    expect(toast("error")).toContain("Bu ders artık yok.");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("closes on 'Vazgeç' without sending anything", async () => {
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(replaceMuderris).not.toHaveBeenCalled();
  });
});

describe("'Dersi gizle' (nazir 18)", () => {
  const open = async (title = "Bina ve İzhar Şerhi") => {
    await mount();
    await click(byLabel(`Diğer işlemler: ${title}`));
    await settle(40);
    const item = [...document.querySelectorAll("[role=menuitem]")].find(
      (i) => i.textContent?.trim() === "Dersi gizle"
    );
    await click(item as Element);
    await settle(80);
  };

  it("asks first, in the canvas's words, with the real number of talebe (criterion 1)", async () => {
    await open();
    const ask = document.querySelector(
      ".mds-dialog[role=alertdialog]"
    ) as HTMLElement;
    expect(ask).not.toBeNull();
    expect(ask.textContent).toContain("Süleymaniye Medresesi");
    expect(ask.textContent).toContain("Dersi gizle");
    expect(textOf(ask.textContent ?? "")).toContain(
      "Bina ve İzhar Şerhi talebelerden, ziyaretçilerden ve Nûruosmaniye Köşkü’nün sayfasından gizlenecek; celseleri talebelerin takviminden düşecek. 35 talebe celselere ve ders kayıtlarına erişemez."
    );
    expect(ask.textContent).toContain(
      "Hiçbir şey silinmez; Arşiv’den geri alabilirsiniz. Öğeyi gizleyen kademe ya da üstü geri alır."
    );
    expect(hideCourse).not.toHaveBeenCalled();
    // the focus starts on 'Vazgeç' (_kurallar 13)
    expect(document.activeElement?.textContent).toBe("Vazgeç");
  });

  it("leaves the sentence about talebe out for a course nobody has joined", async () => {
    await open("Maksûd şerhi");
    const ask = document.querySelector(
      ".mds-dialog[role=alertdialog]"
    ) as HTMLElement;
    expect(ask.textContent).toContain("Maksûd şerhi talebelerden");
    expect(ask.textContent).not.toContain("erişemez");
  });

  it("does nothing on 'Vazgeç'", async () => {
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(hideCourse).not.toHaveBeenCalled();
    expect(document.querySelector(".mds-dialog[role=alertdialog]")).toBeNull();
  });

  it("hides the course, says so, and reads the list again so it leaves it (criterion 2)", async () => {
    hideCourse.mockResolvedValue({ success: true, data: null });
    await open();
    await click(buttonIn(dialog(), "Gizle"));
    await settle(60);

    expect(hideCourse).toHaveBeenCalledExactlyOnceWith("m-1", "c-1");
    expect(toast("success")).toContain("Ders gizlendi");
    expect(toast("success")).toContain(
      "“Bina ve İzhar Şerhi” listeden kalktı; Arşiv’de görünür."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(document.querySelector(".mds-dialog[role=alertdialog]")).toBeNull();
  });

  it("takes 'zaten gizli' for what it is, not an error: the list is read again", async () => {
    hideCourse.mockResolvedValue({
      success: false,
      code: "MADRASAH_COURSE_ALREADY_HIDDEN",
    });
    await open();
    await click(buttonIn(dialog(), "Gizle"));
    await settle(60);
    expect(toast("info")).toContain("Ders zaten gizli");
    expect(document.querySelector(".mds-toast--error")).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says so in a toast that stays when the API refuses (criterion 4), and leaves the list as it was", async () => {
    hideCourse.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await open();
    await click(buttonIn(dialog(), "Gizle"));
    await settle(60);
    expect(toast("error")).toContain("Ders gizlenemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(refresh).not.toHaveBeenCalled();
    expect(document.querySelector(".mds-dialog[role=alertdialog]")).toBeNull();
  });

  it("reads the list again when the course is gone", async () => {
    hideCourse.mockResolvedValue({
      success: false,
      code: "MADRASAH_COURSE_NOT_FOUND",
    });
    await open();
    await click(buttonIn(dialog(), "Gizle"));
    await settle(60);
    expect(toast("error")).toContain("Bu ders artık yok.");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
