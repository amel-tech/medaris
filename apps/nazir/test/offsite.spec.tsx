// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  koskChoices,
  offsiteErrorKey,
  offsiteProblems,
  offsiteRequest,
  REASON_MAX,
  reasonProblem,
} from "~/features/offsite/offsite";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Medrese dışı ders talebi (nazir 09) as the server renders it, the rules of its
 * form, and what the form does with each answer. The read, the portal and the
 * action are stubs; what is under test is what the page does with each answer.
 */
const state = {
  mode: "ok" as "ok" | "forbidden" | "failed",
  /** the köşk list is open to everyone; the medrese's own route refuses a nazır */
  requests: "ok" as "ok" | "forbidden",
  /** the köşks the API lists, a page after another */
  pages: [] as Array<Array<{ id: string; name: string }>>,
  asked: [] as unknown[],
};
const refresh = vi.fn();
const push = vi.fn();
const sendOffsiteRequest = vi.fn();

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
  readOnce: async (what: string, call: (api: unknown) => Promise<unknown>) => {
    if (state.mode !== "ok") return { status: state.mode };
    if (state.requests === "forbidden" && what.includes("requests"))
      return { status: "forbidden" };
    return {
      status: "ok",
      data: await call({
        madrasahs: { getOffsiteCourseRequests: async () => [] },
        kosks: {
          getAllKosks: async (request: { page: number }) => {
            state.asked.push(request);
            const items = state.pages[request.page - 1] ?? [];
            return {
              items,
              total: state.pages.flat().length,
              page: request.page,
              limit: 50,
            };
          },
        },
      }),
    };
  },
}));
vi.mock("~/features/offsite/actions", () => ({
  sendOffsiteRequest: (id: string, request: unknown) =>
    sendOffsiteRequest(id, request),
}));

const NURUOSMANIYE = { id: "k-1", name: "Nûruosmaniye Köşkü" };
const FATIH = { id: "k-2", name: "Fatih Köşkü" };
const BEYAZIT = { id: "k-3", name: "Beyazıt Köşkü" };

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
  const { OffsitePage } = await import(
    "~/features/offsite/components/offsite-page"
  );
  return wrap(<OffsitePage madrasahId="m-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const form = () =>
  document.querySelector("[data-testid=offsite-form]") as HTMLFormElement;
const field = (name: string) =>
  form().elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;
const submit = () =>
  [...form().querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Talebi gönder"
  ) as HTMLButtonElement;
const fill = async (title: string, reason: string) => {
  await typeInto(field("title"), title);
  await typeInto(field("reason"), reason);
};

beforeEach(() => {
  state.mode = "ok";
  state.requests = "ok";
  state.pages = [[NURUOSMANIYE, FATIH, BEYAZIT]];
  state.asked = [];
  for (const fn of [refresh, push, sendOffsiteRequest]) fn.mockReset();
});
afterEach(cleanup);

describe("the form's rules", () => {
  it("takes a reason of 1 to 2000 characters, counted trimmed (criterion 2)", () => {
    expect(reasonProblem("")).toBe("required");
    expect(reasonProblem("   \n ")).toBe("required");
    expect(reasonProblem("Neden.")).toBeNull();
    expect(reasonProblem(`  ${"a".repeat(REASON_MAX)}  `)).toBeNull();
    expect(reasonProblem("a".repeat(REASON_MAX + 1))).toBe("long");
  });

  it("will not send until the köşk, the name and the reason are all there (criterion 2)", () => {
    const ok = { koskId: "k-1", title: "Erbaîn-i Nevevî", reason: "Neden." };
    expect(offsiteProblems(ok)).toBeNull();
    expect(offsiteProblems({ ...ok, koskId: null })).toMatchObject({
      kosk: true,
    });
    expect(offsiteProblems({ ...ok, title: "  " })).toMatchObject({
      title: "required",
    });
    expect(offsiteProblems({ ...ok, title: "a" })).toMatchObject({
      title: "short",
    });
    expect(offsiteProblems({ ...ok, reason: "" })).toMatchObject({
      reason: "required",
    });
  });

  it("sends the name and the reason trimmed", () => {
    expect(
      offsiteRequest({
        koskId: "k-1",
        title: "  Erbaîn-i Nevevî okumaları ",
        reason: "\n Neden. ",
      })
    ).toEqual({
      koskId: "k-1",
      title: "Erbaîn-i Nevevî okumaları",
      reason: "Neden.",
    });
  });

  it("lists the köşks by name, in Turkish order", () => {
    expect(
      koskChoices([
        { id: "a", name: "Şeyh Edebali Köşkü", extra: 1 } as never,
        { id: "b", name: "Fatih Köşkü" },
        { id: "c", name: "İstanbul Köşkü" },
        { id: "d", name: "Beyazıt Köşkü" },
      ]).map((kosk) => kosk.name)
    ).toEqual([
      "Beyazıt Köşkü",
      "Fatih Köşkü",
      "İstanbul Köşkü",
      "Şeyh Edebali Köşkü",
    ]);
  });

  it("words the codes the API answers with, and an unknown one generically", () => {
    expect(offsiteErrorKey("KOSK_NOT_FOUND")).toBe("Offsite.errors.kosk");
    expect(offsiteErrorKey("VALIDATION_ERROR")).toBe("Offsite.errors.invalid");
    expect(offsiteErrorKey("AUTHZ_FORBIDDEN")).toBe("Problems.actionForbidden");
    expect(offsiteErrorKey("SOMETHING_NEW")).toBe("Problems.actionGeneric");
  });
});

describe("Medrese dışı ders talebi", () => {
  it("is headed, names the way back and says what the form is for", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Medrese dışı ders talebi<\/h1>/);
    expect(textOf(out)).toContain(
      "Medreseye bağlı olmayan bir dersi kendiniz açamazsınız; bir köşkte açılmasını buradan isteyebilirsiniz."
    );
    expect(out).toContain('href="/medrese/m-1/dersler"');
    expect(textOf(out)).toContain("Dersler");
  });

  it("has the fields of the canvas with their help, and the köşk chosen is the first by name", async () => {
    const text = textOf(await markup());
    expect(text).toContain("Köşk *");
    expect(text).toContain("Beyazıt Köşkü");
    expect(text).toContain(
      "Bu form medreseye bağlı olmayacak dersler içindir; medrese dersini barındırma hakkı olan köşklerde “Medrese dersi aç” ile kendiniz açarsınız."
    );
    expect(text).toContain("Ders adı *");
    expect(text).toContain("Önerdiğiniz ad; dersi açan değiştirebilir.");
    expect(text).toContain("Gerekçe *");
    expect(text).toContain(
      "Dersin neden medrese dışında açılması gerektiğini ve önerdiğiniz müderrisleri yazın."
    );
    expect(text).toContain("Vazgeç");
    expect(text).toContain("Talebi gönder");
  });

  it("says what happens after, naming the köşk chosen, and that no course is made (criterion 4)", async () => {
    const text = textOf(await markup());
    expect(text).toContain("Talepten sonra");
    expect(text).toContain(
      "Talep Beyazıt Köşkü’nün nazımına gider; Medaris yönetimi talebi görür."
    );
    expect(text).toContain(
      "Kabul edilirse dersi köşk nazımı açar ve müderrislerini seçer."
    );
    expect(text).toContain(
      "Ders bu medreseye bağlı olmaz: medrese derslerinde görünmez, talebeleri medresenin talebesi sayılmaz."
    );
  });

  it("reads every page of the köşks and offers them all", async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `k-${i}`,
      name: `Köşk ${String(i).padStart(2, "0")}`,
    }));
    state.pages = [many, [FATIH]];
    await markup();
    expect(state.asked).toEqual([
      { page: 1, limit: 50 },
      { page: 2, limit: 50 },
    ]);
  });

  it("answers a refusal with a notice, without the form", async () => {
    state.mode = "forbidden";
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("offsite-form");
  });

  it("answers a nazır of the medrese, whom the köşk list lets through, with the notice too", async () => {
    state.pages = [[NURUOSMANIYE]];
    state.requests = "forbidden";
    const out = await markup();
    expect(textOf(out)).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("offsite-form");
  });

  it("answers a failed read with the retry state, never with 'izniniz yok'", async () => {
    state.mode = "failed";
    const text = textOf(await markup());
    expect(text).toContain("Köşkler okunamadı");
    expect(text).toContain("Yeniden dene");
    expect(text).not.toContain("izniniz yok");
  });

  it("says so, with the way back, where no köşk is listed", async () => {
    state.pages = [[]];
    const out = await markup();
    expect(textOf(out)).toContain("Talep gönderilecek köşk yok");
    expect(out).not.toContain("offsite-form");
    expect(out).toContain('href="/medrese/m-1/dersler"');
  });

  it("draws bars while the köşks are read", async () => {
    const { OffsiteLoading } = await import(
      "~/features/offsite/components/offsite-page"
    );
    const out = await html(<OffsiteLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the form", () => {
  it("sends nothing and says what is missing under the fields when 'Talebi gönder' is pressed on an empty form (criterion 2)", async () => {
    await mount();
    await click(submit());
    expect(sendOffsiteRequest).not.toHaveBeenCalled();
    const text = form().textContent ?? "";
    expect(text).toContain("Ders adı boş olamaz.");
    expect(text).toContain("Bir gerekçe yazın.");
    // the focus goes to the first problem
    expect(document.activeElement).toBe(field("title"));

    await typeInto(field("title"), "Erbaîn-i Nevevî okumaları");
    await click(submit());
    expect(form().textContent).not.toContain("Ders adı boş olamaz.");
    expect(document.activeElement).toBe(field("reason"));
    expect(sendOffsiteRequest).not.toHaveBeenCalled();
  });

  it("sends the köşk, the name and the reason trimmed, says so, and goes back to Dersler (criterion 1)", async () => {
    sendOffsiteRequest.mockResolvedValue({
      success: true,
      data: { title: "Erbaîn-i Nevevî okumaları", koskName: "Beyazıt Köşkü" },
    });
    await mount();
    await fill(
      "  Erbaîn-i Nevevî okumaları ",
      "  Medresemizde bu metni okutan yok.  "
    );
    await click(submit());
    await settle(60);

    expect(sendOffsiteRequest).toHaveBeenCalledExactlyOnceWith("m-1", {
      koskId: "k-3",
      title: "Erbaîn-i Nevevî okumaları",
      reason: "Medresemizde bu metni okutan yok.",
    });
    expect(toast("success")).toContain("Talep gönderildi");
    expect(toast("success")).toContain(
      "“Erbaîn-i Nevevî okumaları” talebiniz Beyazıt Köşkü’nün nazımına iletildi."
    );
    expect(push).toHaveBeenCalledExactlyOnceWith("/medrese/m-1/dersler");
  });

  it("sends the köşk that was chosen, and the card names it", async () => {
    sendOffsiteRequest.mockResolvedValue({
      success: true,
      data: { title: "Maksûd şerhi", koskName: "Fatih Köşkü" },
    });
    await mount();
    const trigger = form().querySelector(
      "button[role=combobox]"
    ) as HTMLElement;
    await click(trigger);
    await settle(40);
    await click(
      [...document.querySelectorAll("[role=option]")].find(
        (o) => o.textContent?.trim() === "Fatih Köşkü"
      ) as Element
    );
    await settle(40);
    expect(form().textContent).toContain(
      "Talep Fatih Köşkü’nün nazımına gider; Medaris yönetimi talebi görür."
    );
    await fill("Maksûd şerhi", "Neden.");
    await click(submit());
    await settle(60);
    expect(sendOffsiteRequest).toHaveBeenCalledExactlyOnceWith("m-1", {
      koskId: "k-2",
      title: "Maksûd şerhi",
      reason: "Neden.",
    });
  });

  it("keeps the form and the text, and says why, when the API refuses", async () => {
    sendOffsiteRequest.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    await fill("Maksûd şerhi", "Neden.");
    await click(submit());
    await settle(60);

    expect(toast("error")).toContain("Talep gönderilemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(push).not.toHaveBeenCalled();
    expect(field("title").value).toBe("Maksûd şerhi");
    expect(field("reason").value).toBe("Neden.");
  });

  it("reads the köşks again when the one chosen is gone", async () => {
    sendOffsiteRequest.mockResolvedValue({
      success: false,
      code: "KOSK_NOT_FOUND",
    });
    await mount();
    await fill("Maksûd şerhi", "Neden.");
    await click(submit());
    await settle(60);
    expect(toast("error")).toContain("Bu köşk artık yok.");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is left by 'Vazgeç', a link to Dersler", async () => {
    await mount();
    const cancel = [...form().querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Vazgeç"
    );
    expect(cancel?.getAttribute("href")).toBe("/medrese/m-1/dersler");
  });
});
