// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * "Celse planla" as the server renders it, and what the form does: the
 * preview is the API's own expansion of the pattern, nothing is written until
 * "N celse oluştur", and a refusal is worded from its code. The read, the
 * viewer and the actions are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const holding = (...codes: string[]): Answer<unknown> => ({
  status: "ok",
  data: { permissions: ["course.view", ...codes], staffRead: false },
});

const state = {
  course: { status: "failed" } as Answer<unknown>,
  permissions: { status: "failed" } as Answer<unknown>,
  viewer: { id: "u-1", timeZone: "Europe/Istanbul" } as unknown,
};
const push = vi.fn();
const previewSessions = vi.fn();
const createSessions = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push }),
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
        getCourseById: async () => {},
        getMyCoursePermissions: async () => {},
      },
    });
    return what.includes("holds in the course")
      ? state.permissions
      : state.course;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("~/features/sessions/actions", () => ({
  previewSessions: (...args: unknown[]) => previewSessions(...args),
  createSessions: (...args: unknown[]) => createSessions(...args),
  changeSession: vi.fn(),
  cancelSession: vi.fn(),
  setLiveStream: vi.fn(),
}));

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

const element = async () => {
  const { PlanPage } = await import("~/features/sessions/components/plan-page");
  return wrap(<PlanPage courseId="c-1" />);
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";
const field = (name: string) =>
  document.querySelector(`input[name=${name}]`) as HTMLInputElement;
const chip = (label: string) =>
  [...document.querySelectorAll("button[aria-pressed]")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLElement;
const submit = () =>
  document.querySelector("button[type=submit]") as HTMLButtonElement;
const preview = () =>
  document.querySelector('[data-testid="plan-preview"]')?.textContent ?? "";

const planned = (...days: string[]) => ({
  success: true as const,
  data: {
    sessions: days.map((day, index) => ({
      scheduledAt: `${day}T18:00:00.000Z`,
      localDate: day,
      weekNumber: index + 1,
    })),
  },
});

/** Fills a weekly plan the way the form is meant to be: days, a start and an end. */
const fillWeekly = async () => {
  await click(chip("Pzt"));
  await click(chip("Çar"));
  await typeInto(field("startDate"), "2026-10-12");
  await typeInto(field("endDate"), "2026-10-19");
  await settle(350);
};

beforeEach(() => {
  state.course = {
    status: "ok",
    data: { id: "c-1", title: "Bina ve İzhar Şerhi", contentLocked: false },
  };
  state.permissions = holding("session.manage");
  state.viewer = { id: "u-1", timeZone: "Europe/Istanbul" };
  for (const fn of [push, previewSessions, createSessions]) fn.mockReset();
  previewSessions.mockResolvedValue(
    planned("2026-10-12", "2026-10-14", "2026-10-19")
  );
});
afterEach(cleanup);

describe("Celse planla", () => {
  it("is headed with the course and starts as a weekly repeat with nothing to create", async () => {
    const out = await markup();
    expect(out).toMatch(/<h1[^>]*>Celse planla<\/h1>/);
    expect(textOf(out)).toContain(
      "Bina ve İzhar Şerhi dersine tek bir celse ekleyin"
    );
    expect(out).toContain('href="/ders/c-1/celseler"');
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(textOf(out)).toContain("0 celse oluştur");
  });

  it("starts the zone as the viewer's own", async () => {
    state.viewer = { id: "u-1", timeZone: "Europe/Berlin" };
    expect(textOf(await markup())).toContain("Saatler Berlin saatiyle.");
  });

  it("is the 'Bu sayfaya izniniz yok' state when the API refuses the course", async () => {
    state.course = { status: "forbidden" };
    expect(textOf(await markup())).toContain("Bu sayfaya izniniz yok");
  });

  it("is that state for a caller without session.manage, even one who may set the live stream link or edit the course", async () => {
    for (const held of [
      [],
      ["session.live_link"],
      ["course.edit", "recording.manage", "enrollment.decide"],
    ]) {
      state.permissions = holding(...held);
      const out = textOf(await markup());
      expect(out).toContain("Bu sayfaya izniniz yok");
      expect(out).not.toContain("Önizleme");
    }
  });

  it("does not take a locked course for a refusal: session.manage opens it", async () => {
    state.course = {
      status: "ok",
      data: { id: "c-1", title: "x", contentLocked: true },
    };
    const out = textOf(await markup());
    expect(out).not.toContain("izniniz yok");
    expect(out).toContain("0 celse oluştur");
  });

  it("is the retry state, never the form and never 'no access', when the permissions cannot be read", async () => {
    state.permissions = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Ders okunamadı");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("izniniz yok");
    expect(out).not.toContain("0 celse oluştur");
  });

  it("is the retry state when the course cannot be read", async () => {
    state.course = { status: "failed" };
    const out = textOf(await markup());
    expect(out).toContain("Ders okunamadı");
    expect(out).toContain("Yeniden dene");
  });

  it("is bars while the course is read", async () => {
    const { PlanLoading } = await import(
      "~/features/sessions/components/plan-page"
    );
    const out = await html(<PlanLoading />);
    expect(out).toContain('aria-busy="true"');
    expect(textOf(out)).toBe("Yükleniyor");
  });
});

describe("the preview", () => {
  it("is the API's expansion of the pattern, asked for once the fields make one", async () => {
    await mount();
    expect(previewSessions).not.toHaveBeenCalled();
    await fillWeekly();

    expect(previewSessions).toHaveBeenLastCalledWith("c-1", {
      weekdays: [1, 3],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-12",
      endDate: "2026-10-19",
    });
    expect(preview()).toContain("3 celse");
    expect(preview()).toContain("12 Ekim 2026 Pazartesi 21:00");
    expect(preview()).toContain("Hafta 2 · 60 dk · Bağlantı boş");
    expect(submit().disabled).toBe(false);
    expect(submit().textContent).toContain("3 celse oluştur");
  });

  it("says so, and leaves nothing to create, when the API cannot expand the pattern", async () => {
    previewSessions.mockResolvedValue({
      success: false,
      code: "INVALID_SESSION_PATTERN",
    });
    await mount();
    await fillWeekly();
    expect(preview()).toContain("Önizleme alınamadı");
    expect(submit().disabled).toBe(true);
  });

  it("is a pattern of one session for 'Tek seferlik', on the weekday of its date", async () => {
    previewSessions.mockResolvedValue(planned("2026-10-14"));
    await mount();
    await click(chip("Tek seferlik"));
    await typeInto(field("startDate"), "2026-10-14");
    await settle(350);
    expect(previewSessions).toHaveBeenLastCalledWith("c-1", {
      weekdays: [3],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-14",
      count: 1,
    });
    expect(field("endDate")).toBeNull();
  });
});

describe("'N celse oluştur'", () => {
  it("creates the sessions of the pattern with the title and the length, and goes back to Celseler", async () => {
    createSessions.mockResolvedValue({ success: true, data: { count: 3 } });
    await mount();
    await fillWeekly();
    await typeInto(field("title"), "  Ders  ");
    await typeInto(field("duration"), "90");
    await settle(350);
    await click(submit());
    await settle(80);

    expect(createSessions).toHaveBeenCalledExactlyOnceWith("c-1", {
      weekdays: [1, 3],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-12",
      endDate: "2026-10-19",
      title: "Ders",
      durationMinutes: 90,
    });
    expect(toast("success")).toContain("Celseler oluşturuldu");
    expect(toast("success")).toContain("3 celse eklendi.");
    expect(push).toHaveBeenCalledExactlyOnceWith("/ders/c-1/celseler");
  });

  it("puts the link on the first session only, and only on https", async () => {
    createSessions.mockResolvedValue({ success: true, data: { count: 3 } });
    await mount();
    await fillWeekly();
    await click(
      [...document.querySelectorAll("[role=radio]")].find((r) =>
        r.closest("label")?.textContent?.includes("Yalnız ilk celseye ekle")
      ) as Element
    );
    await settle(40);
    await typeInto(field("meetingUrl"), "http://zoom.us/j/1");
    await click(submit());
    await settle(60);
    expect(document.body.textContent).toContain(
      "Toplantı bağlantısı https:// ile başlamalı."
    );
    expect(createSessions).not.toHaveBeenCalled();

    await typeInto(field("meetingUrl"), "zoom.us/j/1");
    await click(submit());
    await settle(80);
    expect(createSessions).toHaveBeenCalledExactlyOnceWith(
      "c-1",
      expect.objectContaining({ meetingUrl: "https://zoom.us/j/1" })
    );
  });

  it("asks for a title before it creates anything", async () => {
    await mount();
    await fillWeekly();
    await typeInto(field("title"), "  ");
    await click(submit());
    await settle(60);
    expect(document.body.textContent).toContain("Celse başlığını yazın.");
    expect(createSessions).not.toHaveBeenCalled();
  });

  it("stays on the form and says why when the API refuses, and for a caller who may not", async () => {
    createSessions.mockResolvedValue({
      success: false,
      code: "AUTHZ_FORBIDDEN",
    });
    await mount();
    await fillWeekly();
    await click(submit());
    await settle(80);
    expect(toast("error")).toContain("Celseler oluşturulamadı");
    expect(toast("error")).toContain("Bunu yapma izniniz yok.");
    expect(push).not.toHaveBeenCalled();

    createSessions.mockResolvedValue({
      success: false,
      code: "INVALID_SESSION_PATTERN",
    });
    await click(submit());
    await settle(80);
    expect(document.body.textContent).toContain("geçerli bir celse üretmiyor");
  });
});
