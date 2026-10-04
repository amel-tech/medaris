// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Talebeler of a course as the server renders it, and what can be done on it:
 * decide an application, mark a course complete, take a talebe out with a
 * reason. The reads, the portal and the actions are stubs; what is under test
 * is what the page does with each answer.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  enrolments: { status: "failed" } as Answer<unknown[]>,
  removed: { status: "failed" } as Answer<unknown[]>,
  course: { status: "failed" } as Answer<unknown>,
  portal: { status: "failed" } as unknown,
  asked: [] as string[],
};
const refresh = vi.fn();
const approveApplication = vi.fn();
const rejectApplication = vi.fn();
const setCompleted = vi.fn();
const removeStudent = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
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
      courses: {
        getCourseEnrollments: async (request: unknown) => {
          state.asked.push(`enrolments ${JSON.stringify(request)}`);
        },
        getRemovedEnrollments: async (request: unknown) => {
          state.asked.push(`removed ${JSON.stringify(request)}`);
        },
        getCourseById: async () => {},
      },
    });
    return what.includes("enrolments")
      ? state.enrolments
      : what.includes("removed")
        ? state.removed
        : state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/shell/reads", () => ({
  getPortal: async () => state.portal,
}));
vi.mock("~/features/pano/actions", () => ({
  approveApplication: (...args: unknown[]) => approveApplication(...args),
  rejectApplication: (...args: unknown[]) => rejectApplication(...args),
}));
vi.mock("~/features/enrolments/actions", () => ({
  setCompleted: (...args: unknown[]) => setCompleted(...args),
  removeStudent: (...args: unknown[]) => removeStudent(...args),
}));

const item = (
  n: number,
  status: string,
  over: Record<string, unknown> = {}
) => ({
  userId: `u-${n}`,
  courseId: "c-1",
  studentName: `Talebe ${n}`,
  studentEmail: `talebe.${n}@example.com`,
  progress: 40,
  status,
  createdAt: new Date(`2026-09-${10 + n}T10:00:00+03:00`),
  updatedAt: new Date("2026-09-30T10:00:00+03:00"),
  ban: null,
  ...over,
});

const removedItem = (over: Record<string, unknown> = {}) => ({
  userId: "u-9",
  name: "Sümeyye Nur",
  email: "sumeyye@example.com",
  reason: "Üç haftadır derslere katılmıyor.",
  progress: 10,
  removedAt: new Date("2026-09-29T10:00:00+03:00"),
  removedBy: { id: "u-1", name: "Yusuf Ziya Ertuğrul" },
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

const element = async () => {
  const { EnrolmentsPage } = await import(
    "~/features/enrolments/components/enrolments-page"
  );
  return wrap(<EnrolmentsPage courseId="c-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const alertDialog = () =>
  document.querySelector("[role=alertdialog]") as HTMLElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const tab = (label: string) =>
  [...document.querySelectorAll("[role=tab]")].find((t) =>
    t.textContent?.includes(label)
  ) as HTMLElement;
const reason = () =>
  dialog().querySelector("textarea[name=reason]") as HTMLTextAreaElement;
const panelText = (label: string) =>
  document.querySelector(`[role=tabpanel][aria-labelledby="${tab(label).id}"]`)
    ?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00+03:00"));
  state.enrolments = {
    status: "ok",
    data: [
      item(1, "PENDING"),
      item(2, "PENDING"),
      item(3, "ENROLLED", { progress: 75 }),
      item(4, "ENROLLED"),
      item(5, "COMPLETED", { progress: 100 }),
      item(6, "REVOKED"),
    ],
  };
  state.removed = { status: "ok", data: [removedItem()] };
  state.course = {
    status: "ok",
    data: { id: "c-1", title: "Bina ve İzhar Şerhi", requiresApproval: true },
  };
  state.portal = {
    status: "ok",
    scopes: [
      {
        kind: "ders",
        id: "c-1",
        name: "Bina (portal)",
        role: "MUDERRIS",
        isImam: false,
        koskName: null,
      },
    ],
  };
  state.asked = [];
  for (const fn of [
    refresh,
    approveApplication,
    rejectApplication,
    setCompleted,
    removeStudent,
  ]) {
    fn.mockReset();
  }
});
afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe("Talebeler of a course", () => {
  it("is headed with the course", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Talebeler<\/h1>/);
    expect(textOf(out)).toContain(
      "Bina ve İzhar Şerhi dersinin başvurularını karara bağlayın"
    );
  });

  it("asks the API for this course's enrolments and its removed talebe", async () => {
    await markup();
    expect(state.asked.sort()).toEqual([
      'enrolments {"id":"c-1"}',
      'removed {"id":"c-1"}',
    ]);
  });

  it("names the course from the portal when the course itself cannot be read, and goes without a name when neither can", async () => {
    state.course = { status: "failed" };
    expect(textOf(await markup())).toContain(
      "Bina (portal) dersinin başvurularını karara bağlayın"
    );
    state.portal = { status: "failed" };
    expect(textOf(await markup())).toContain(
      "Dersin başvurularını karara bağlayın"
    );
  });

  it("counts each tab by its own list, and leaves a revoked seat out of all but the removed record", async () => {
    await mount();
    expect(tab("Başvurular").textContent).toContain("2");
    expect(tab("Kayıtlı").textContent).toContain("2");
    expect(tab("Tamamlayanlar").textContent).toContain("1");
    expect(tab("Erişimi kaldırılanlar").textContent).toContain("1");
  });

  it("lists the applications newest first, with e-mail and day, and says the course needs approval", async () => {
    const out = await markup();
    const applications = out.slice(
      out.indexOf("<table"),
      out.indexOf("</table>")
    );
    const rows = applications.split("<tr").slice(2).map(textOf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Talebe 2");
    expect(rows[0]).toContain("talebe.2@example.com");
    expect(rows[0]).toContain("12 Eyl");
    expect(rows[1]).toContain("Talebe 1");
    expect(textOf(out)).toContain("Bu derse kayıt için onayınız gerekiyor.");
  });

  it("says a course that needs no approval needs none, and says nothing when it does not know", async () => {
    state.course = {
      status: "ok",
      data: { id: "c-1", title: "Bina", requiresApproval: false },
    };
    expect(textOf(await markup())).toContain(
      "Bu ders onay istemiyor; talebeler başvurur başvurmaz kaydolur."
    );
    state.course = { status: "failed" };
    const out = textOf(await markup());
    expect(out).not.toContain("onay istemiyor");
    expect(out).not.toContain("onayınız gerekiyor");
  });

  it("says there is nothing to decide when no application waits", async () => {
    state.enrolments = { status: "ok", data: [item(3, "ENROLLED")] };
    expect(textOf(await markup())).toContain("Onay bekleyen başvuru yok");
  });

  it("is the 'Bu sayfaya izniniz yok' state when the API refuses the roster", async () => {
    state.enrolments = { status: "forbidden" };
    const out = textOf(await markup());
    expect(out).toContain("Bu sayfaya izniniz yok");
    expect(out).not.toContain("Başvurular");
    expect(out).not.toContain("talebe.1@example.com");
  });

  it("is the retry state, not 'no access', when the roster cannot be read", async () => {
    state.enrolments = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Talebeler okunamadı");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("izniniz yok");
  });

  it("is bars while the roster is read", async () => {
    const { EnrolmentsLoading } = await import(
      "~/features/enrolments/components/enrolments-page"
    );
    const out = await html(<EnrolmentsLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("an application", () => {
  it("is approved with the Pano's action, leaves the list at once and the page is read again", async () => {
    approveApplication.mockResolvedValue({ success: true, data: null });
    await mount();
    await click(byLabel("Onayla: Talebe 1"));
    await settle(60);

    expect(approveApplication).toHaveBeenCalledExactlyOnceWith("c-1", "u-1");
    expect(toast("success")).toContain("Başvuru onaylandı");
    expect(toast("success")).toContain(
      "Talebe 1, “Bina ve İzhar Şerhi” dersine kabul edildi."
    );
    expect(byLabel("Onayla: Talebe 1")).toBeNull();
    expect(tab("Başvurular").textContent).toContain("1");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is rejected only after the person confirms, and without a reason", async () => {
    rejectApplication.mockResolvedValue({ success: true, data: null });
    await mount();
    await click(byLabel("Reddet: Talebe 2"));
    await settle(60);
    expect(alertDialog().textContent).toContain(
      "Talebe 2 adlı talebenin “Bina ve İzhar Şerhi” dersine başvurusu reddedilecek."
    );
    expect(rejectApplication).not.toHaveBeenCalled();

    await click(buttonIn(alertDialog(), "Reddet"));
    await settle(60);
    expect(rejectApplication).toHaveBeenCalledExactlyOnceWith("c-1", "u-2");
    expect(toast("success")).toContain("Başvuru reddedildi");
    expect(byLabel("Reddet: Talebe 2")).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is left alone when the person thinks better of rejecting it", async () => {
    await mount();
    await click(byLabel("Reddet: Talebe 2"));
    await settle(60);
    await click(buttonIn(alertDialog(), "Vazgeç"));
    await settle(60);
    expect(rejectApplication).not.toHaveBeenCalled();
    expect(byLabel("Reddet: Talebe 2")).not.toBeNull();
  });

  it("stays, with the sentence that says the caller may not, when the API refuses the decision", async () => {
    approveApplication.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    await click(byLabel("Onayla: Talebe 1"));
    await settle(60);
    expect(toast("error")).toContain("Başvuru işlenemedi");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(byLabel("Onayla: Talebe 1")).not.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves the list with a notice, not an error, when somebody decided it first", async () => {
    approveApplication.mockResolvedValue({
      success: false,
      code: "ENROLLMENT_STATE_CONFLICT",
    });
    await mount();
    await click(byLabel("Onayla: Talebe 1"));
    await settle(60);
    expect(toast("info")).toContain("Bu başvuru artık yok; liste yenilendi.");
    expect(toast("error")).toBe("");
    expect(byLabel("Onayla: Talebe 1")).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("the enrolled and the ones who completed", () => {
  it("lists the enrolled with e-mail and progress, and offers 'Tamamladı say' and 'Dersten çıkar'", async () => {
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    const text = panelText("Kayıtlı");
    expect(text).toContain("Talebe 3");
    expect(text).toContain("talebe.3@example.com");
    expect(byLabel("Tamamladı say: Talebe 3")).not.toBeNull();
    expect(byLabel("Dersten çıkar: Talebe 3")).not.toBeNull();
    expect(byLabel("Yeniden aç: Talebe 3")).toBeNull();
  });

  it("sets COMPLETED, in the course team's name and never the talebe's, and reads the page again", async () => {
    setCompleted.mockResolvedValue({ success: true, data: null });
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    await click(byLabel("Tamamladı say: Talebe 3"));
    await settle(60);

    expect(setCompleted).toHaveBeenCalledExactlyOnceWith("c-1", "u-3", true);
    expect(toast("success")).toContain("Talebe Tamamlayanlar’a taşındı");
    expect(toast("success")).toContain("Talebe 3 dersi tamamladı.");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers only 'Yeniden aç' on a completion, and reopens it", async () => {
    setCompleted.mockResolvedValue({ success: true, data: null });
    await mount();
    await click(tab("Tamamlayanlar"));
    await settle(40);
    expect(byLabel("Tamamladı say: Talebe 5")).toBeNull();
    expect(byLabel("Dersten çıkar: Talebe 5")).toBeNull();
    await click(byLabel("Yeniden aç: Talebe 5"));
    await settle(60);
    expect(setCompleted).toHaveBeenCalledExactlyOnceWith("c-1", "u-5", false);
    expect(toast("success")).toContain("Kayıt yeniden açıldı");
  });

  it("says the caller may not when the API refuses, and reads nothing again", async () => {
    setCompleted.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    await click(byLabel("Tamamladı say: Talebe 3"));
    await settle(60);
    expect(toast("error")).toContain("İşlem tamamlanamadı");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads the list again, with a notice, when the seat is no longer as shown", async () => {
    setCompleted.mockResolvedValue({
      success: false,
      code: "ENROLLMENT_STATE_CONFLICT",
    });
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    await click(byLabel("Tamamladı say: Talebe 3"));
    await settle(60);
    expect(toast("info")).toContain("liste yenilendi");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is searched by name or e-mail in the browser, and says when nobody matches", async () => {
    state.enrolments = {
      status: "ok",
      data: [
        item(3, "ENROLLED", { studentName: "İbrahim Halil" }),
        item(4, "ENROLLED", { studentName: "Sümeyye Nur" }),
      ],
    };
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    const box = [...document.querySelectorAll("input[type=search]")].find(
      (input) => input.closest("[data-testid=roster-enrolled]")
    ) as HTMLInputElement;
    expect(box).toBeDefined();
    await typeInto(box, "sumeyye");
    expect(panelText("Kayıtlı")).toContain("Sümeyye Nur");
    expect(panelText("Kayıtlı")).not.toContain("İbrahim Halil");
    await typeInto(box, "kimse");
    expect(panelText("Kayıtlı")).toContain("Aramaya uyan talebe yok");
  });

  it("shows ten at a time and the rest on 'Daha fazla göster'", async () => {
    state.enrolments = {
      status: "ok",
      data: Array.from({ length: 12 }, (_, i) => item(i + 10, "ENROLLED")),
    };
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    const showing = () =>
      document.querySelector("[data-testid=roster-showing]")?.textContent;
    expect(showing()).toBe("12 talebeden 10 tanesi gösteriliyor");
    await click(buttonIn(document, "Daha fazla göster"));
    expect(showing()).toBe("12 talebeden 12 tanesi gösteriliyor");
  });
});

describe("'Dersten çıkar'", () => {
  const open = async () => {
    await mount();
    await click(tab("Kayıtlı"));
    await settle(40);
    await click(byLabel("Dersten çıkar: Talebe 3"));
    await settle(80);
  };
  const submit = () => buttonIn(dialog(), "Dersten çıkar");

  it("opens a dialog for that talebe in that course, and says they cannot apply again until the team approves the seat", async () => {
    await open();
    expect(dialog().textContent).toContain(
      "Talebe 3 adlı talebe Bina ve İzhar Şerhi dersinden çıkarılacak."
    );
    expect(dialog().textContent).toContain(
      "Talebe bu derse yeniden başvuramaz; yeri ancak ders kadrosu onaylarsa geri gelir."
    );
    expect(dialog().textContent).not.toContain("yeniden başvurabilir");
  });

  it("takes a reason: the button stays off until there is one, and the field says so once it has been left empty", async () => {
    await open();
    expect(submit().disabled).toBe(true);
    await act(async () => {
      reason().focus();
      reason().blur();
    });
    expect(dialog().textContent).toContain("Bir gerekçe yazın.");
    await typeInto(reason(), "   ");
    expect(submit().disabled).toBe(true);
    await typeInto(reason(), "Üç haftadır derslere katılmıyor.");
    expect(submit().disabled).toBe(false);
  });

  it("removes the talebe with the reason trimmed, says so and reads the page again", async () => {
    removeStudent.mockResolvedValue({ success: true, data: null });
    await open();
    await typeInto(reason(), "  Üç haftadır derslere katılmıyor.  ");
    await click(submit());
    await settle(80);

    expect(removeStudent).toHaveBeenCalledExactlyOnceWith(
      "c-1",
      "u-3",
      "Üç haftadır derslere katılmıyor."
    );
    expect(toast("success")).toContain("Talebe dersten çıkarıldı");
    expect(toast("success")).toContain(
      "Talebe 3 Erişimi kaldırılanlar sekmesine taşındı."
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("keeps the dialog and the reason, and says why, when the API refuses", async () => {
    removeStudent.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await open();
    await typeInto(reason(), "Üç haftadır derslere katılmıyor.");
    await click(submit());
    await settle(80);

    expect(toast("error")).toContain("Talebe dersten çıkarılamadı");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(dialog()).not.toBeNull();
    expect(reason().value).toBe("Üç haftadır derslere katılmıyor.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and reads the list again when the seat has moved under the person", async () => {
    removeStudent.mockResolvedValue({
      success: false,
      code: "ENROLLMENT_STATE_CONFLICT",
    });
    await open();
    await typeInto(reason(), "Üç haftadır derslere katılmıyor.");
    await click(submit());
    await settle(80);
    expect(toast("info")).toContain("liste yenilendi");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("closes on 'Vazgeç' without sending anything", async () => {
    await open();
    await click(buttonIn(dialog(), "Vazgeç"));
    await settle(60);
    expect(dialog()).toBeNull();
    expect(removeStudent).not.toHaveBeenCalled();
  });
});

describe("Erişimi kaldırılanlar", () => {
  it("is the record of each removal: who, when, the reason and who wrote it", async () => {
    await mount();
    await click(tab("Erişimi kaldırılanlar"));
    await settle(40);
    const text = panelText("Erişimi kaldırılanlar");
    expect(text).toContain("Sümeyye Nur");
    expect(text).toContain("sumeyye@example.com");
    expect(text).toContain("29 Eyl");
    expect(text).toContain("Üç haftadır derslere katılmıyor.");
    expect(text).toContain("Yusuf Ziya Ertuğrul");
  });

  it("says a removed talebe cannot apply again until the team approves the seat", async () => {
    await mount();
    await click(tab("Erişimi kaldırılanlar"));
    await settle(40);
    const text = panelText("Erişimi kaldırılanlar");
    expect(text).toContain(
      "Çıkarılan talebe yeniden başvuramaz; yeri ancak ders kadrosu onaylarsa geri gelir."
    );
    expect(text).not.toContain("yeniden başvurabilir");
  });

  it("says nobody has been removed when the list is empty", async () => {
    state.removed = { status: "ok", data: [] };
    await mount();
    await click(tab("Erişimi kaldırılanlar"));
    await settle(40);
    expect(panelText("Erişimi kaldırılanlar")).toContain(
      "Erişimi kaldırılan talebe yok"
    );
  });

  it("says the list could not be read, with no count, and the rest of the page stays", async () => {
    state.removed = { status: "failed" };
    await mount();
    expect(tab("Erişimi kaldırılanlar").textContent).not.toMatch(/\d/);
    expect(byLabel("Onayla: Talebe 1")).not.toBeNull();
    await click(tab("Erişimi kaldırılanlar"));
    await settle(40);
    expect(panelText("Erişimi kaldırılanlar")).toContain(
      "Dersten çıkarılan talebeler şu an okunamadı."
    );
  });

  it("is that notice too when the API refuses the list", async () => {
    state.removed = { status: "forbidden" };
    await mount();
    await click(tab("Erişimi kaldırılanlar"));
    await settle(40);
    expect(panelText("Erişimi kaldırılanlar")).toContain("şu an okunamadı");
  });
});
