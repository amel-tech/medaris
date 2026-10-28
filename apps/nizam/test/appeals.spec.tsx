// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  AppealListResponse,
  AppealResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppealsView } from "~/features/appeals/components/appeals-view";
import {
  appealFailureKey,
  appealSettled,
  appealVariant,
} from "~/features/appeals/present";
import { cleanup, click, render, settle } from "./dom";

const acceptAppeal = vi.fn();
const rejectAppeal = vi.fn();
vi.mock("~/features/appeals/actions", () => ({
  loadAppeals: vi.fn(),
  acceptAppeal: (id: string) => acceptAppeal(id),
  rejectAppeal: (id: string, note: string) => rejectAppeal(id, note),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const wrap = (ui: ReactElement) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nizam: resources.tr.nizam } as never}
  >
    {ui}
  </NextIntlClientProvider>
);

const appeal = (over: Partial<AppealResponse> = {}): AppealResponse => ({
  id: "a1",
  status: "PENDING",
  reason: "Ders müfredatı köşkün alanına uygundur.",
  decisionNote: null,
  createdAt: new Date("2026-10-20T09:00:00Z"),
  decidedAt: null,
  madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
  kosk: { id: "k1", name: "Fıkıh Köşkü" },
  courseRequestId: "r1",
  title: "Usûl-i Fıkıh",
  rejectReason: "Kontenjan dolu.",
  createdBy: { id: "u1", name: "Mehmet Emin Işıkoğlu" },
  ...over,
});

const list = (items: AppealResponse[]): AppealListResponse => ({
  items,
  pendingCount: items.length,
  decidedCount: 3,
});

afterEach(async () => {
  await cleanup();
  acceptAppeal.mockReset();
  rejectAppeal.mockReset();
});

describe("İtirazlar (nizam)", () => {
  it("shows the medrese, the course, the köşk and both reasons, with Kabul et and Reddet", () => {
    const html = renderToStaticMarkup(
      wrap(<AppealsView initial={list([appeal()])} />)
    );
    for (const text of [
      "İtirazlar",
      "Bekleyen",
      "Karara bağlanan",
      "Süleymaniye Medresesi",
      "Usûl-i Fıkıh",
      "Fıkıh Köşkü",
      "Ret gerekçesi",
      "Kontenjan dolu.",
      "İtiraz gerekçesi",
      "Ders müfredatı köşkün alanına uygundur.",
      "Kabul et",
      "Reddet",
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it("says when nothing waits, and when the list could not be read", () => {
    expect(
      renderToStaticMarkup(wrap(<AppealsView initial={list([])} />))
    ).toContain("Karar bekleyen itiraz yok.");
    expect(
      renderToStaticMarkup(wrap(<AppealsView initial={null} />))
    ).toContain("İtirazlar okunamadı");
  });

  it("Kabul et decides the appeal and it leaves the waiting list", async () => {
    acceptAppeal.mockResolvedValue({ success: true, data: null });
    const host = await render(wrap(<AppealsView initial={list([appeal()])} />));
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Kabul et"
    );
    expect(button).toBeTruthy();
    await click(button as Element);
    await settle();
    expect(acceptAppeal).toHaveBeenCalledWith("a1");
    expect(host.textContent).toContain("Karar bekleyen itiraz yok.");
  });

  it("shows the decision note of a decided appeal, without the buttons", () => {
    const html = renderToStaticMarkup(
      wrap(
        <AppealsView
          initial={list([
            appeal({
              status: "REJECTED",
              decisionNote: "Köşkün gerekçesi yerinde.",
              decidedAt: new Date("2026-10-21T09:00:00Z"),
            }),
          ])}
        />
      )
    );
    expect(html).toContain("Köşkün gerekçesi yerinde.");
    expect(html).not.toContain("Kabul et");
  });
});

describe("the answers of İtirazlar", () => {
  it("words the codes tedrisat answers with and knows which settle the row", () => {
    expect(appealFailureKey({ code: "APPEAL_NOT_PENDING" })).toBe(
      "errors.answered"
    );
    expect(appealFailureKey({ code: "APPEAL_NOT_FOUND" })).toBe("errors.gone");
    expect(appealFailureKey({ code: "AUTHZ_FORBIDDEN" })).toBe(
      "errors.forbidden"
    );
    expect(appealFailureKey({ code: "X" })).toBe("errors.generic");
    expect(appealSettled({ code: "APPEAL_NOT_PENDING" })).toBe(true);
    expect(appealSettled({ code: "AUTHZ_FORBIDDEN" })).toBe(false);
  });

  it("draws each status in its own tone", () => {
    expect(appealVariant("PENDING")).toBe("warning");
    expect(appealVariant("ACCEPTED")).toBe("success");
    expect(appealVariant("REJECTED")).toBe("error");
  });

  it("has the same keys in tr, en and ar", () => {
    const keys = (o: unknown, at = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${at}${k}.`) : [`${at}${k}`]
      );
    const tr = keys(resources.tr.nizam.AppealsPage);
    expect(keys(resources.en.nizam.AppealsPage)).toEqual(tr);
    expect(keys(resources.ar.nizam.AppealsPage)).toEqual(tr);
  });
});
