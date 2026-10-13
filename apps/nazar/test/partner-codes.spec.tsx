// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizePartnerCode,
  partnerCodeErrorKey,
  partnerCodeProblem,
  showsPartnerCodes,
} from "~/features/course-settings/partner-codes";
import { cleanup, click, render, settle, type } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * "Ortak uygulama kodları" on Ders ayarları (partner enrollments): drawn only
 * for a caller who holds `course.partner_codes` and only when the server works
 * with a partner application; codes are added and removed one call at a time,
 * and a code another course has is refused naming nothing about that course.
 * The reads and the two actions are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  permissions: { status: "failed" } as Answer<unknown>,
  partners: { status: "failed" } as Answer<unknown>,
  codes: { status: "failed" } as Answer<unknown>,
  reads: [] as string[],
};
const refresh = vi.fn();
const addPartnerCode = vi.fn();
const removePartnerCode = vi.fn();

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
vi.mock("~/env", () => ({ env: { TEDRIS_URL: "http://localhost:4000" } }));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    state.reads.push(what);
    await call({
      courses: {
        getCourseById: async () => {},
        getMyCoursePermissions: async () => {},
        listPartnerApplications: async () => {},
        getCoursePartnerCodes: async () => {},
      },
    });
    if (what.includes("holds in the course")) return state.permissions;
    if (what.includes("partner applications")) return state.partners;
    if (what.includes("partner codes")) return state.codes;
    return {
      status: "ok",
      data: {
        id: "c-1",
        title: "Tecvid",
        status: "PUBLISHED",
        isClosed: false,
        requiresApproval: false,
        inPerson: false,
        timeZone: "Europe/Istanbul",
        version: 1,
        weeks: [],
      },
    };
  },
}));
vi.mock("~/features/course-settings/actions", () => ({
  saveCourseSettings: vi.fn(),
  setCourseStatus: vi.fn(),
  setSampleLesson: vi.fn(),
  addPartnerCode: (...args: unknown[]) => addPartnerCode(...args),
  removePartnerCode: (...args: unknown[]) => removePartnerCode(...args),
}));

const PARTNER = { id: "ornek-uygulama", name: "Örnek Uygulama" };
const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});
/** What a köşk nazımı holds in a course of the köşk, as far as this page reads it. */
const NAZIM = [
  "course.edit",
  "course.settings",
  "course.publish",
  "session.manage",
  "course.partner_codes",
];
const MUDERRIS = NAZIM.filter((code) => code !== "course.partner_codes");

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
const markup = async () => textOf(await html(await element()));
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(20);
};
const section = () =>
  document.querySelector('[data-testid="partner-codes"]') as HTMLElement;
const button = (label: string) =>
  [...section().querySelectorAll("button")].find(
    (b) => b.textContent?.replace(/\s+/g, " ").trim() === label
  ) as HTMLButtonElement;
const field = () =>
  section().querySelector("#partner-code-ornek-uygulama") as HTMLInputElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const add = async (code: string) => {
  await type(field(), code);
  await click(button("Ekle"));
  await settle(40);
};

beforeEach(() => {
  state.permissions = holding(...NAZIM);
  state.partners = { status: "ok", data: [PARTNER] };
  state.codes = {
    status: "ok",
    data: {
      partners: [
        {
          ...PARTNER,
          codes: [
            { code: "tecvid-2026", createdAt: new Date() },
            { code: "tecvid-hafta-1", createdAt: new Date() },
          ],
        },
      ],
    },
  };
  state.reads = [];
  for (const fn of [refresh, addPartnerCode, removePartnerCode]) {
    fn.mockReset();
  }
  addPartnerCode.mockResolvedValue({
    success: true,
    data: { code: "tecvid-2027" },
  });
  removePartnerCode.mockResolvedValue({ success: true, data: null });
});
afterEach(cleanup);

describe("Ortak uygulama kodları on Ders ayarları", () => {
  it("lists each partner with its codes for the köşk nazımı", async () => {
    const out = await markup();
    expect(out).toContain("Ortak uygulama kodları");
    expect(out).toContain("Örnek Uygulama");
    expect(out).toContain("tecvid-2026");
    expect(out).toContain("tecvid-hafta-1");
    expect(out).toContain("Kod ekle");
  });

  it("is not drawn, nor read, for a caller without course.partner_codes", async () => {
    state.permissions = holding(...MUDERRIS);
    const out = await markup();
    expect(out).toContain("Ders ayarları");
    expect(out).not.toContain("Ortak uygulama kodları");
    expect(state.reads.some((what) => what.includes("partner"))).toBe(false);
  });

  it("is not drawn when the server works with no partner application, and the codes are not read", async () => {
    state.partners = { status: "ok", data: [] };
    expect(await markup()).not.toContain("Ortak uygulama kodları");
    expect(state.reads.some((what) => what.includes("partner codes"))).toBe(
      false
    );
    state.partners = { status: "failed" };
    expect(await markup()).not.toContain("Ortak uygulama kodları");
  });

  it("opens the page to a caller who holds course.partner_codes alone", async () => {
    state.permissions = holding("course.partner_codes");
    const out = await markup();
    expect(out).not.toContain("Bu sayfaya izniniz yok");
    expect(out).toContain("Ortak uygulama kodları");
  });

  it("says so in place when the codes cannot be read, and the rest of the page stands", async () => {
    state.codes = { status: "failed" };
    const out = await markup();
    expect(out).toContain(
      "Ortak uygulama kodları şu an okunamıyor. Biraz sonra yeniden deneyin."
    );
    expect(out).toContain("Kayıt onayı gereksin");
  });

  it("adds a code as the partner spells it, lower-cased, and reads the page again", async () => {
    await mount();
    await add("  Tecvid-2027 ");
    expect(addPartnerCode).toHaveBeenCalledWith(
      "c-1",
      "ornek-uygulama",
      "tecvid-2027"
    );
    expect(document.body.textContent).toContain(
      "Örnek Uygulama kodu tecvid-2027 artık bu derse bağlı."
    );
    expect(refresh).toHaveBeenCalled();
    expect(field().value).toBe("");
  });

  it("refuses a code of the wrong shape before sending it", async () => {
    await mount();
    await add("tecvid 2027!");
    expect(addPartnerCode).not.toHaveBeenCalled();
    expect(section().textContent).toContain(
      "Kod yalnız küçük harf, rakam ve tire içerebilir; harf ya da rakamla başlar."
    );
    await add("   ");
    expect(section().textContent).toContain("Bir kod yazın.");
  });

  it("says a code another course has is taken, naming nothing about that course", async () => {
    addPartnerCode.mockResolvedValue({
      success: false,
      code: "PARTNER_CODE_TAKEN",
    });
    await mount();
    await add("nahiv");
    expect(section().textContent).toContain(
      "Bu kod başka bir derse bağlı. Önce o dersten kaldırılması gerekir."
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(field().value).toBe("nahiv");
  });

  it("removes one code and says the people it enrolled stay", async () => {
    await mount();
    await click(button("Kaldır tecvid-hafta-1"));
    await settle(40);
    expect(removePartnerCode).toHaveBeenCalledWith(
      "c-1",
      "ornek-uygulama",
      "tecvid-hafta-1"
    );
    expect(document.body.textContent).toContain(
      "Örnek Uygulama kodu tecvid-hafta-1 artık bu derse bağlı değil. Bu kodla kaydedilen talebeler derste kalır."
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("words a refused removal from its code in a toast that stays", async () => {
    removePartnerCode.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    await click(button("Kaldır tecvid-2026"));
    await settle(40);
    expect(toast("error")).toContain("Kod kaldırılamadı");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("partner code rules", () => {
  it("takes a code trimmed and lower-cased, without the Turkish dotless i", () => {
    expect(normalizePartnerCode("  TECVID-2026 ")).toBe("tecvid-2026");
    expect(normalizePartnerCode("I")).toBe("i");
  });

  it("knows an empty code and one of the wrong shape", () => {
    expect(partnerCodeProblem("")).toBe("empty");
    expect(partnerCodeProblem("-tecvid")).toBe("shape");
    expect(partnerCodeProblem("tecvid_2026")).toBe("shape");
    expect(partnerCodeProblem("a".repeat(65))).toBe("shape");
    expect(partnerCodeProblem("a".repeat(64))).toBeNull();
    expect(partnerCodeProblem("tecvid-2026")).toBeNull();
  });

  it("is shown only with a partner and the permission", () => {
    expect(showsPartnerCodes(1, true)).toBe(true);
    expect(showsPartnerCodes(0, true)).toBe(false);
    expect(showsPartnerCodes(2, false)).toBe(false);
  });

  it("has a message in every locale for every key it builds", () => {
    const keys = [
      ...[
        "PARTNER_CODE_TAKEN",
        "VALIDATION_ERROR",
        "PARTNER_UNKNOWN",
        "AUTHZ_FORBIDDEN",
        "SOMETHING_NEW",
      ].map(partnerCodeErrorKey),
      "CourseSettings.partnerCodes.errors.empty",
      "CourseSettings.partnerCodes.errors.shape",
    ];
    for (const locale of ["tr", "en", "ar"] as const) {
      const t = createTranslator({
        locale,
        messages: resources[locale].nazar,
      });
      for (const key of keys) {
        expect(t.has(key as never), `${locale} ${key}`).toBe(true);
      }
    }
  });
});
