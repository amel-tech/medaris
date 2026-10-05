// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, rerender, settle } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Ders ayarları of a course as the server renders it (MDRS-270). The reads
 * are stubs; what is under test is what the page draws from each answer, and
 * above all that it opens no control the API would refuse: every control
 * follows what `GET /courses/:id/my-permissions` lists.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  course: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
  tedris: "http://localhost:4000" as string | undefined,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/env", () => ({
  env: {
    get TEDRIS_URL() {
      return state.tedris;
    },
  },
}));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      courses: {
        getCourseById: async () => {},
        getMyCoursePermissions: async () => {},
      },
    });
    return what.includes("holds in the course")
      ? state.permissions
      : state.course;
  },
}));
vi.mock("~/features/course-settings/actions", () => ({
  saveCourseSettings: vi.fn(),
  setCourseStatus: vi.fn(),
  setSampleLesson: vi.fn(),
}));

const course = (over: Record<string, unknown> = {}) => ({
  id: "c-1",
  title: "Bina ve İzhar Şerhi",
  status: "PUBLISHED",
  isClosed: false,
  requiresApproval: true,
  timeZone: "Europe/Istanbul",
  version: 7,
  weeks: [
    {
      id: "w1",
      weekNumber: 1,
      lessons: [
        { id: "l-1", title: "Celse 1", type: "LIVE", isPreview: true },
        { id: "l-2", title: "Celse 2", type: "LIVE", isPreview: false },
      ],
    },
  ],
  ...over,
});

/** What the caller holds in the course, as `GET /courses/:id/my-permissions` answers. */
const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

/** A müderris's list: the course codes and the derived settings no policy closes. */
const MUDERRIS = [
  "course.edit",
  "course.settings",
  "course.publish",
  "session.manage",
  "setting.approval_off",
  "setting.course_open",
];

const element = async () => {
  const { CourseSettingsPage } = await import(
    "~/features/course-settings/components/course-settings-page"
  );
  return (
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <CourseSettingsPage courseId="c-1" />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(20);
};

const buttons = () => [...document.querySelectorAll("button")];
const button = (label: string) =>
  buttons().find((b) => b.textContent?.trim() === label);
const row = (label: string) =>
  [...document.querySelectorAll("label.mds-choice")].find(
    (l) => l.querySelector(".mds-choice__label")?.textContent === label
  ) as HTMLElement;
const box = (label: string) =>
  row(label).querySelector("[role=checkbox]") as HTMLElement;
const checked = (label: string) =>
  box(label).getAttribute("aria-checked") === "true";
const locked = (label: string) =>
  box(label).getAttribute("aria-disabled") === "true" ||
  box(label).hasAttribute("data-disabled");
/** The two selects, in the form's order: Örnek ders, then Saat dilimi. */
const select = (which: "sample" | "zone") =>
  [...document.querySelectorAll("button.mds-input")][
    which === "sample" ? 0 : 1
  ] as HTMLButtonElement;
const shut = (which: "sample" | "zone") =>
  select(which).disabled || select(which).hasAttribute("data-disabled");

beforeEach(() => {
  state.course = { status: "ok", data: course() };
  state.permissions = holding(...MUDERRIS);
  state.tedris = "http://localhost:4000";
});
afterEach(cleanup);

describe("Ders ayarları", () => {
  it("is headed with the course and opens every control to a müderris", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    expect(document.querySelector("h1")?.textContent).toBe("Ders ayarları");
    expect(text).toContain(
      "Bina ve İzhar Şerhi dersinin yayın, erişim, kayıt ve saat dilimi ayarları."
    );
    for (const label of ["Kapalı ders", "Kayıt onayı gereksin"]) {
      expect(locked(label), label).toBe(false);
    }
    expect(checked("Kayıt onayı gereksin")).toBe(true);
    expect(checked("Kapalı ders")).toBe(false);
    expect(shut("sample")).toBe(false);
    expect(shut("zone")).toBe(false);
    expect(select("sample").textContent).toBe("Hafta 1 · Celse 1");
    expect(select("zone").textContent).toBe("İstanbul");
    expect(button("Kaydet")?.disabled).toBe(true);
    expect(button("Taslağa çek")).toBeDefined();
    expect(text).not.toContain("izniniz yok");
  });

  it("keeps a change not yet saved when the course is read again with only a new version, as after 'Yayımla'", async () => {
    state.course = { status: "ok", data: course({ status: "DRAFT" }) };
    const host = await render((await expand(await element())) as ReactElement);
    await settle(20);
    await click(row("Kapalı ders"));
    expect(checked("Kapalı ders")).toBe(true);
    expect(button("Kaydet")?.disabled).toBe(false);

    // publishing bumps the version; nothing the form shows was stored
    state.course = {
      status: "ok",
      data: course({ status: "PUBLISHED", version: 8 }),
    };
    await rerender(host, (await expand(await element())) as ReactElement);
    await settle(20);
    expect(checked("Kapalı ders")).toBe(true);
    expect(button("Kaydet")?.disabled).toBe(false);

    // a read that brings other stored values starts the form from them
    state.course = {
      status: "ok",
      data: course({ version: 9, requiresApproval: false }),
    };
    await rerender(host, (await expand(await element())) as ReactElement);
    await settle(20);
    expect(checked("Kapalı ders")).toBe(false);
    expect(checked("Kayıt onayı gereksin")).toBe(false);
    expect(button("Kaydet")?.disabled).toBe(true);
  });

  it("links to the course's public page in a new tab, only when Tedris's address is set", async () => {
    const out = await markup();
    expect(out).toContain('href="http://localhost:4000/tr/courses/c-1"');
    expect(out).toContain('target="_blank"');
    expect(textOf(out)).toContain(
      "Tanıtım sayfasını gör (yeni sekmede açılır)"
    );
    state.tedris = "";
    expect(textOf(await markup())).not.toContain("Tanıtım sayfasını gör");
  });

  it("is 'Bu sayfaya izniniz yok' for every code set without the page's codes, however much else", async () => {
    for (const held of [
      [],
      ["course.view_details", "recording.manage", "enrollment.decide"],
      ["week.hide", "session.live_link", "setting.approval_off"],
    ]) {
      state.permissions = holding(...held);
      const out = textOf(await markup());
      expect(out, held.join()).toContain("Bu sayfaya izniniz yok");
      expect(out).not.toContain("Kapalı ders");
      expect(out).not.toContain("Kaydet");
      expect(out).not.toContain("Taslağa çek");
    }
  });

  it("is that state when the API refuses the course or the permissions", async () => {
    state.course = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
    state.course = { status: "ok", data: course() };
    state.permissions = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
  });

  it("is the retry state, not 'no access', when the course or the permissions cannot be read", async () => {
    for (const which of ["course", "permissions"] as const) {
      state.course = { status: "ok", data: course() };
      state.permissions = holding(...MUDERRIS);
      state[which] = { status: "failed" };
      const out = textOf(await markup());
      expect(out, which).toContain("Ders ayarları yüklenemedi");
      expect(out, which).toContain("Yeniden dene");
      expect(out, which).not.toContain("izniniz yok");
      expect(out, which).not.toContain("Kaydet");
    }
  });

  it("draws 'Yayımla' and 'Taslağa çek' only for course.edit with course.publish, and the status to anyone", async () => {
    state.permissions = holding("course.edit", "course.settings");
    let out = textOf(await markup());
    expect(out).toContain("Yayında");
    expect(out).not.toContain("Taslağa çek");
    state.permissions = holding("course.publish", "course.settings");
    out = textOf(await markup());
    expect(out).not.toContain("Taslağa çek");
    expect(out).not.toContain("Yayımla");
    state.course = { status: "ok", data: course({ status: "DRAFT" }) };
    state.permissions = holding("course.edit", "course.publish");
    out = textOf(await markup());
    expect(out).toContain("Taslak");
    expect(out).toContain("Yayımla");
  });

  it("keeps the boxes shut to course.edit without course.settings, and the sample to a caller without session.manage", async () => {
    state.permissions = holding("course.edit", "course.publish");
    await mount();
    expect(locked("Kapalı ders")).toBe(true);
    expect(locked("Kayıt onayı gereksin")).toBe(true);
    expect(shut("sample")).toBe(true);
    expect(shut("zone")).toBe(false);
    expect(button("Kaydet")).toBeDefined();
  });

  it("opens only the sample session to a caller who holds session.manage alone", async () => {
    state.permissions = holding("session.manage");
    await mount();
    expect(shut("sample")).toBe(false);
    expect(shut("zone")).toBe(true);
    expect(locked("Kapalı ders")).toBe(true);
    expect(locked("Kayıt onayı gereksin")).toBe(true);
    expect(document.body.textContent).not.toContain("Taslağa çek");
  });

  it("shuts everything to course.settings without course.edit, says the route asks for it, and draws no Kaydet", async () => {
    state.permissions = holding(
      "course.settings",
      "setting.approval_off",
      "setting.course_open"
    );
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "Bu ayarları değiştirmek için “Dersi düzenle” izni de gerekir."
    );
    expect(text).toContain(
      "Bu ayarları değiştirme izniniz yok; yalnız görebilirsiniz."
    );
    expect(locked("Kapalı ders")).toBe(true);
    expect(locked("Kayıt onayı gereksin")).toBe(true);
    expect(shut("sample")).toBe(true);
    expect(shut("zone")).toBe(true);
    expect(button("Kaydet")).toBeUndefined();
    expect(button("Vazgeç")).toBeUndefined();
  });

  it("holds 'Kayıt onayı gereksin' ticked and says why when a policy closes switching it off", async () => {
    state.course = {
      status: "ok",
      data: course({ requiresApproval: false }),
    };
    state.permissions = holding(
      ...MUDERRIS.filter((code) => code !== "setting.approval_off")
    );
    await mount();
    expect(checked("Kayıt onayı gereksin")).toBe(true);
    expect(locked("Kayıt onayı gereksin")).toBe(true);
    expect(row("Kayıt onayı gereksin").textContent).toContain(
      "Bir politika bu derste kaydın her zaman onaya bağlı olmasını istiyor"
    );
    expect(locked("Kapalı ders")).toBe(false);
  });

  it("holds a closed course closed under the medrese's policy, and leaves an open one free to close", async () => {
    state.permissions = holding(
      ...MUDERRIS.filter((code) => code !== "setting.course_open")
    );
    state.course = { status: "ok", data: course({ isClosed: true }) };
    await mount();
    expect(checked("Kapalı ders")).toBe(true);
    expect(locked("Kapalı ders")).toBe(true);
    expect(row("Kapalı ders").textContent).toContain(
      "Medresenin “Kapalı ders zorunlu” politikası bu ayarı kilitler."
    );
    await cleanup();

    state.course = { status: "ok", data: course({ isClosed: false }) };
    await mount();
    expect(locked("Kapalı ders")).toBe(false);
    expect(row("Kapalı ders").textContent).not.toContain("kilitler");
  });

  it("says what the time zone changes in nazar, which shows the viewer's own", async () => {
    expect(textOf(await markup())).toContain(
      "Nazar’da saatler sizin saat diliminizde görünür."
    );
  });

  it("is bars while the course is read", async () => {
    const { CourseSettingsLoading } = await import(
      "~/features/course-settings/components/course-settings-page"
    );
    const out = await html(<CourseSettingsLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});
