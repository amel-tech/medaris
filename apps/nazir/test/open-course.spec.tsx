// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Medrese dersi aç (nazir 08) as the server renders it, and the form: what it
 * will not send, what it sends, and what it does with each answer. The reads,
 * the portal and the actions are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  hosting: { status: "failed" } as Answer<unknown[]>,
  settings: { status: "failed" } as Answer<unknown>,
};
const refresh = vi.fn();
const push = vi.fn();
const lookupPerson = vi.fn();
const openCourse = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string) =>
    what.includes("hosting") ? state.hosting : state.settings,
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
vi.mock("~/features/nazirs/actions", () => ({
  lookupPerson: (email: string) => lookupPerson(email),
}));
vi.mock("~/features/courses/actions", () => ({
  openCourse: (id: string, request: unknown) => openCourse(id, request),
  replaceMuderris: vi.fn(),
  hideCourse: vi.fn(),
}));

const kosks = [
  {
    id: "k-1",
    name: "Nûruosmaniye Köşkü",
    courseCount: 1,
  },
  { id: "k-2", name: "Fatih Köşkü", courseCount: 1 },
];
const settings = (policies: Record<string, boolean> = {}) => ({
  status: "ok" as const,
  data: {
    name: "Süleymaniye Medresesi",
    policies: {
      closedCourseRequired: false,
      alwaysApproval: false,
      noPublicRecordings: false,
      ...policies,
    },
  },
});
const found = (id: string, name: string, email: string) => ({
  kind: "found",
  person: { id, name, email },
});
const ISIKOGLU = found("u-1", "Mehmet Emin Işıkoğlu", "m.isikoglu@example.com");
const KILICARSLAN = found(
  "u-2",
  "Ayşe Nur Kılıçarslan",
  "a.kilicarslan@example.com"
);
const KARAOSMANOGLU = found(
  "u-3",
  "Abdülhamit Karaosmanoğlu",
  "a.karaosmanoglu@example.com"
);

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

const element = async () => {
  const { OpenCoursePage } = await import(
    "~/features/courses/components/open-course-page"
  );
  return wrap(<OpenCoursePage madrasahId="m-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const form = () =>
  document.querySelector("[data-testid=open-course-form]") as HTMLFormElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button, a.mds-btn")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLElement;
const titleField = () =>
  document.querySelector("input[name=title]") as HTMLInputElement;
const emailField = () =>
  document.querySelector("input[type=email]") as HTMLInputElement;
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const choice = (label: string) =>
  [...document.querySelectorAll("label.mds-choice")].find((l) =>
    l.textContent?.includes(label)
  ) as HTMLElement;
const checkbox = (label: string) =>
  choice(label).querySelector("[role=checkbox]") as HTMLElement;
const submit = () => buttonIn(form(), "Dersi aç");
const search = async (who: { person: { email: string } }) => {
  await typeInto(emailField(), who.person.email);
  await key(emailField(), "Enter");
  await settle(40);
};

beforeEach(() => {
  state.hosting = { status: "ok", data: kosks };
  state.settings = settings();
  for (const fn of [refresh, push, lookupPerson, openCourse]) fn.mockReset();
});
afterEach(cleanup);

describe("Medrese dersi aç", () => {
  it("is headed with its way back and the sentence of the canvas", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Medrese dersi aç<\/h1>/);
    expect(out).toContain('href="/medrese/m-1/dersler"');
    expect(textOf(out)).toContain("Dersler / Medrese dersi aç");
    expect(textOf(out)).toContain(
      "Ders Süleymaniye Medresesi adına, barındırma hakkı olan bir köşkte açılır. Müderrisleri şimdi seçersiniz."
    );
  });

  it("offers only the köşks that host the medrese, the first chosen (criterion 1)", async () => {
    const out = await markup();
    const choice = out.slice(out.indexOf('name="kosk"') - 400);
    expect(textOf(choice)).toContain(
      "Nûruosmaniye Köşkü medresenin burada 1 dersi var"
    );
    expect(textOf(choice)).toContain(
      "Fatih Köşkü medresenin burada 1 dersi var"
    );
    expect(textOf(choice)).not.toContain("Arapça dil ilimleri");
    expect(textOf(out)).toContain(
      "Yalnız medresenizin barındırma hakkı olan köşkler listelenir."
    );
    expect(out.match(/role="radio"[^>]*aria-checked="true"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Nûruosmaniye Köşkü/);
  });

  it("has the name, the search, the list and the two settings, with the draft sentence", async () => {
    const text = textOf(await markup());
    expect(text).toContain("Ders adı");
    expect(text).toContain(
      "Talebeler bu adı görür; müderrisler sonradan değiştirebilir."
    );
    expect(text).toContain("Müderris");
    expect(text).toContain(
      "Kayıtlı hesabın e-posta adresini eksiksiz yazın; her arama denetim kaydına yazılır."
    );
    expect(text).toContain("Seçilen müderrisler");
    expect(text).toContain("Ders ayarları");
    expect(text).toContain("Kapalı ders");
    expect(text).toContain("Kayıt onayı gereksin");
    expect(text).toContain("Ders taslak olarak açılır.");
    expect(text).toContain("Vazgeç");
    expect(text).toContain("Dersi aç");
  });

  it("leaves both settings open and unsaid while the medrese has no policy", async () => {
    const out = await markup();
    expect(out).not.toContain('data-testid="policy-lock"');
    expect(out).not.toMatch(/role="checkbox"[^>]*aria-checked="true"/);
    expect(out).not.toMatch(/role="checkbox"[^>]*aria-disabled="true"/);
  });

  it("shows 'Kayıt onayı gereksin' on and off limits where the medrese always approves, and says whose it is (criterion 5)", async () => {
    state.settings = settings({ alwaysApproval: true });
    const out = await markup();
    const lock = out.slice(out.indexOf('data-testid="policy-lock"'));
    expect(textOf(lock)).toContain(
      "Medresenin “Kayıt her zaman onaylı” politikası bu ayarı kilitler. Politikayı Medrese ayarları ’ndan değiştirebilirsiniz."
    );
    expect(lock).toContain('href="/medrese/m-1/ayarlar"');
    expect(textOf(lock)).not.toContain("Kapalı ders zorunlu");
  });

  it("locks 'Kapalı ders' where the medrese requires closed courses, and both where it requires both", async () => {
    state.settings = settings({ closedCourseRequired: true });
    expect(textOf(await markup())).toContain(
      "Medresenin “Kapalı ders zorunlu” politikası bu ayarı kilitler."
    );
    state.settings = settings({
      closedCourseRequired: true,
      alwaysApproval: true,
    });
    const text = textOf(await markup());
    expect(text).toContain("“Kapalı ders zorunlu”");
    expect(text).toContain("“Kayıt her zaman onaylı”");
  });

  it("leaves the settings open and says the server applies the policies when they cannot be read", async () => {
    state.settings = { status: "failed" };
    const out = await markup();
    expect(textOf(out)).toContain(
      "Medresenin politikaları şu an okunamadı; ders açılırken sunucu uygular."
    );
    expect(out).toContain('data-testid="open-course-form"');
  });

  it("says there is nothing to open a course in where no köşk hosts the medrese", async () => {
    state.hosting = { status: "ok", data: [] };
    const out = await markup();
    expect(textOf(out)).toContain("Ders açılabilecek köşk yok");
    expect(out).not.toContain('data-testid="open-course-form"');
    expect(out).toContain('href="/medrese/m-1/dersler"');
  });

  it("answers a refusal with a notice and no form (criterion 6 reaches the page as a 403)", async () => {
    state.hosting = { status: "forbidden" };
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain('data-testid="open-course-form"');
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.hosting = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain("Köşkler okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("draws bars while the köşks are read", async () => {
    const { OpenCourseLoading } = await import(
      "~/features/courses/components/open-course-page"
    );
    const out = await html(<OpenCourseLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("'Dersi aç'", () => {
  it("is never off, and says what is missing under the fields instead of sending (criterion 2)", async () => {
    await mount();
    expect(submit().getAttribute("aria-disabled")).toBeNull();
    await click(submit());
    await settle(20);

    expect(openCourse).not.toHaveBeenCalled();
    expect(form().textContent).toContain("Ders adı boş olamaz.");
    expect(form().textContent).toContain("En az bir müderris seçin.");
    // the focus goes to the first thing wrong
    expect(document.activeElement).toBe(titleField());
  });

  it("says only what is still missing once the name is there", async () => {
    await mount();
    await typeInto(titleField(), "Maksûd şerhi");
    await click(submit());
    expect(form().textContent).not.toContain("Ders adı boş olamaz.");
    expect(form().textContent).toContain("En az bir müderris seçin.");
    expect(document.activeElement).toBe(emailField());
    expect(openCourse).not.toHaveBeenCalled();
  });

  it("refuses a name of one letter", async () => {
    await mount();
    await typeInto(titleField(), " m ");
    await click(submit());
    expect(form().textContent).toContain("Ders adı en az 2 karakter olmalı.");
  });

  it("makes a lone müderris the imam, with no choice to make (criterion 3)", async () => {
    lookupPerson.mockResolvedValue(ISIKOGLU);
    await mount();
    await search(ISIKOGLU);
    const picker = form().querySelector("[data-testid=muderris-picker]");
    expect(picker?.textContent).toContain("Mehmet Emin Işıkoğlu");
    expect(picker?.textContent).toContain("m.isikoglu@example.com");
    expect(picker?.textContent).toContain("Dersin imamı");
    expect(picker?.querySelectorAll("[role=radio]")).toHaveLength(0);
  });

  it("asks for the imam among several, and will not send until one is chosen (criterion 3)", async () => {
    lookupPerson
      .mockResolvedValueOnce(ISIKOGLU)
      .mockResolvedValueOnce(KILICARSLAN)
      .mockResolvedValueOnce(KARAOSMANOGLU);
    await mount();
    await typeInto(titleField(), "Maksûd şerhi");
    await search(ISIKOGLU);
    await search(KILICARSLAN);
    await search(KARAOSMANOGLU);
    expect(
      form().querySelectorAll("[role=radio][aria-label^='Dersin']")
    ).toHaveLength(3);
    // the first is the imam until another is chosen
    expect(
      byLabel("Dersin imamı: Mehmet Emin Işıkoğlu").getAttribute("aria-checked")
    ).toBe("true");

    // the imam leaves: two müderrisler remain and nobody is chosen
    await click(byLabel("Çıkar: Mehmet Emin Işıkoğlu"));
    expect(form().textContent).toContain("Dersin imamını seçin.");
    await click(submit());
    expect(openCourse).not.toHaveBeenCalled();

    await click(byLabel("Dersin imamı: Ayşe Nur Kılıçarslan"));
    expect(form().textContent).not.toContain("Dersin imamını seçin.");
  });

  it("sends the köşk, the trimmed name, the müderrisler in order, the imam and the settings, and goes back to the list (criterion 4)", async () => {
    lookupPerson
      .mockResolvedValueOnce(ISIKOGLU)
      .mockResolvedValueOnce(KILICARSLAN);
    openCourse.mockResolvedValue({
      success: true,
      data: { id: "c-9", title: "Maksûd şerhi" },
    });
    await mount();
    await typeInto(titleField(), "  Maksûd şerhi ");
    await search(ISIKOGLU);
    await search(KILICARSLAN);
    await click(byLabel("Dersin imamı: Ayşe Nur Kılıçarslan"));
    // happy-dom does not forward a click on the box to its input; the label does, as the browser's does
    await click(choice("Kapalı ders"));
    await click(submit());
    await settle(60);

    expect(openCourse).toHaveBeenCalledExactlyOnceWith("m-1", {
      koskId: "k-1",
      title: "Maksûd şerhi",
      muderrisUserIds: ["u-1", "u-2"],
      imamUserId: "u-2",
      closedCourse: true,
      requiresApproval: false,
    });
    expect(toast("success")).toContain("Ders taslak olarak açıldı");
    expect(toast("success")).toContain(
      "“Maksûd şerhi” Dersler listesinde Taslak olarak görünür."
    );
    expect(push).toHaveBeenCalledExactlyOnceWith("/medrese/m-1/dersler");
  });

  it("sends the köşk that was chosen", async () => {
    lookupPerson.mockResolvedValue(ISIKOGLU);
    openCourse.mockResolvedValue({
      success: true,
      data: { id: "c-9", title: "Mantığa giriş" },
    });
    await mount();
    const radios = document
      .querySelector("[role=radiogroup]")
      ?.querySelectorAll("[role=radio]") as NodeListOf<Element>;
    await click(radios[1] as Element);
    await typeInto(titleField(), "Mantığa giriş");
    await search(ISIKOGLU);
    await click(submit());
    await settle(60);
    expect(openCourse.mock.calls[0]?.[1]).toMatchObject({ koskId: "k-2" });
  });

  it("sends a setting the medrese's policy fixes as on, though the form was left alone (criterion 5)", async () => {
    state.settings = settings({ alwaysApproval: true });
    lookupPerson.mockResolvedValue(ISIKOGLU);
    openCourse.mockResolvedValue({
      success: true,
      data: { id: "c-9", title: "Mantığa giriş" },
    });
    await mount();
    expect(checkbox("Kayıt onayı gereksin").getAttribute("aria-checked")).toBe(
      "true"
    );
    expect(checkbox("Kayıt onayı gereksin").getAttribute("aria-disabled")).toBe(
      "true"
    );
    expect(checkbox("Kapalı ders").getAttribute("aria-checked")).toBe("false");
    await typeInto(titleField(), "Mantığa giriş");
    await search(ISIKOGLU);
    await click(submit());
    await settle(60);
    expect(openCourse.mock.calls[0]?.[1]).toMatchObject({
      closedCourse: false,
      requiresApproval: true,
    });
  });

  it("stays on the page and says why when the API refuses, and reads the köşks again when the right is gone", async () => {
    lookupPerson.mockResolvedValue(ISIKOGLU);
    openCourse.mockResolvedValue({
      success: false,
      code: "HOSTING_RIGHT_REQUIRED",
    });
    await mount();
    await typeInto(titleField(), "Mantığa giriş");
    await search(ISIKOGLU);
    await click(submit());
    await settle(60);

    expect(toast("error")).toContain("Ders açılamadı");
    expect(toast("error")).toContain(
      "Bu köşk artık medresenize barındırma hakkı vermiyor."
    );
    expect(push).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
    expect(titleField().value).toBe("Mantığa giriş");
  });

  it("words a refusal it does not know in general terms, and does not read the page again", async () => {
    lookupPerson.mockResolvedValue(ISIKOGLU);
    openCourse.mockResolvedValue({ success: false, code: "" });
    await mount();
    await typeInto(titleField(), "Mantığa giriş");
    await search(ISIKOGLU);
    await click(submit());
    await settle(60);
    expect(toast("error")).toContain("Bir şeyler ters gitti.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("goes back to the list with 'Vazgeç', without sending anything", async () => {
    await mount();
    const cancel = buttonIn(form(), "Vazgeç");
    expect(cancel.getAttribute("href")).toBe("/medrese/m-1/dersler");
    expect(openCourse).not.toHaveBeenCalled();
  });
});
