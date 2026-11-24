// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  PermanentBanRequestListResponse,
  PermanentBanRequestResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermanentBansView } from "~/features/permanent-bans/components/permanent-bans-view";
import {
  banPlace,
  bansHref,
  permanentBanFailureKey,
  permanentBanSettled,
  permanentBanVariant,
} from "~/features/permanent-bans/present";
import { cleanup, click, render, settle, type } from "./dom";

const approvePermanentBan = vi.fn();
const rejectPermanentBan = vi.fn();
const loadPermanentBans = vi.fn();
vi.mock("~/features/permanent-bans/actions", () => ({
  loadPermanentBans: (status: string) => loadPermanentBans(status),
  approvePermanentBan: (id: string) => approvePermanentBan(id),
  rejectPermanentBan: (id: string, note: string) =>
    rejectPermanentBan(id, note),
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

const banner = {
  id: "u-banner",
  name: "Abdülhamit Karaosmanoğlu",
  email: "abdulhamit@example.com",
};

const request = (
  over: Partial<PermanentBanRequestResponse> = {},
  ban: Partial<PermanentBanRequestResponse["ban"]> = {}
): PermanentBanRequestResponse => ({
  id: "r1",
  status: "PENDING",
  reason: "Yasaktan bir saat sonra yeni bir hesap açtı.",
  requestedBy: banner,
  createdAt: new Date("2026-10-02T09:30:00Z"),
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  platformBanId: null,
  ban: {
    id: "b1",
    user: {
      id: "u-1",
      name: "Kerem Ali Yazıcı",
      email: "kerem@example.com",
    },
    scope: "COURSE",
    koskName: "Nûruosmaniye Köşkü",
    courseTitle: "Emsile ve Bina",
    madrasahName: null,
    reason: "Celselerde başka talebelere hakaret.",
    bannedBy: banner,
    bannedRole: "MUDERRIS",
    createdAt: new Date("2026-10-02T07:40:00Z"),
    liftedAt: null,
    ...ban,
  },
  ...over,
});

const list = (
  items: PermanentBanRequestResponse[]
): PermanentBanRequestListResponse => ({
  items,
  pendingCount: items.length,
  decidedCount: 1,
});

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === text);

afterEach(async () => {
  await cleanup();
  approvePermanentBan.mockReset();
  rejectPermanentBan.mockReset();
  loadPermanentBans.mockReset();
});

describe("Kalıcı yasak talepleri (nizam 45)", () => {
  it("draws the card of the design: the person, the ban that stands and the request", () => {
    const html = renderToStaticMarkup(
      wrap(<PermanentBansView initial={list([request()])} />)
    );
    for (const text of [
      "Kalıcı yasak talepleri",
      "Karar bekleyen",
      "Karara bağlanan",
      "Kerem Ali Yazıcı",
      "Karar bekliyor",
      "Mevcut yasak",
      "Kapsam",
      "Ders yasağı · Emsile ve Bina, Nûruosmaniye Köşkü",
      "Koyan",
      "Abdülhamit Karaosmanoğlu, hoca",
      "Yasağın gerekçesi",
      "Celselerde başka talebelere hakaret.",
      "Talep eden",
      "Abdülhamit Karaosmanoğlu, yasağı koyan",
      "Talebin gerekçesi",
      "Yasaktan bir saat sonra yeni bir hesap açtı.",
      "Yasaklamalar’da gör",
      "Reddet",
      "Onayla",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain('href="/yasaklamalar?q=kerem%40example.com"');
  });

  it("says what an approval does, and promises no account closure", () => {
    const html = renderToStaticMarkup(
      wrap(<PermanentBansView initial={list([request()])} />)
    );
    expect(html).toContain(
      "Onay, kişiyi platformdan yasaklar: bütün köşk, medrese ve derslere erişimi kalkar."
    );
    expect(html).not.toMatch(/hesabını kapat/i);
  });

  it("says when nothing waits, and when the list could not be read", () => {
    expect(
      renderToStaticMarkup(wrap(<PermanentBansView initial={list([])} />))
    ).toContain("Karar bekleyen kalıcı yasak talebi yok.");
    expect(
      renderToStaticMarkup(wrap(<PermanentBansView initial={null} />))
    ).toContain("Kalıcı yasak talepleri okunamadı");
  });

  it("Onayla decides the request and it leaves the waiting list", async () => {
    approvePermanentBan.mockResolvedValue({ success: true, data: null });
    const host = await render(
      wrap(<PermanentBansView initial={list([request()])} />)
    );
    await click(button(host, "Onayla") as Element);
    await settle();
    expect(approvePermanentBan).toHaveBeenCalledWith("r1");
    expect(host.textContent).toContain(
      "Karar bekleyen kalıcı yasak talebi yok."
    );
  });

  it("Reddet asks for a reason and sends it", async () => {
    rejectPermanentBan.mockResolvedValue({ success: true, data: null });
    const host = await render(
      wrap(<PermanentBansView initial={list([request()])} />)
    );
    await click(button(host, "Reddet") as Element);
    await settle();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("Kalıcı yasak talebini reddet");
    const submit = dialog.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await type(
      dialog.querySelector("textarea") as Element,
      "  Tek olay; alt yasak yeterli.  "
    );
    await click(submit);
    await settle();
    expect(rejectPermanentBan).toHaveBeenCalledWith(
      "r1",
      "Tek olay; alt yasak yeterli."
    );
    expect(host.textContent).toContain(
      "Karar bekleyen kalıcı yasak talebi yok."
    );
  });

  it("offers only Reddet when the lower ban was lifted meanwhile", async () => {
    const host = await render(
      wrap(
        <PermanentBansView
          initial={list([
            request({}, { liftedAt: new Date("2026-10-03T09:00:00Z") }),
          ])}
        />
      )
    );
    expect(host.textContent).toContain("Bu yasak kaldırılmış");
    expect((button(host, "Onayla") as HTMLButtonElement).disabled).toBe(true);
    expect((button(host, "Reddet") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the request on the screen when the approval is refused for the person", async () => {
    approvePermanentBan.mockResolvedValue({
      success: false,
      errorBody: { code: "BAN_TARGET_INVALID" },
    });
    const host = await render(
      wrap(<PermanentBansView initial={list([request()])} />)
    );
    await click(button(host, "Onayla") as Element);
    await settle();
    expect(host.textContent).toContain("Kerem Ali Yazıcı");
  });

  it("shows a decided request with its outcome and note, without the decisions", () => {
    const html = renderToStaticMarkup(
      wrap(
        <PermanentBansView
          initial={list([
            request({
              status: "REJECTED",
              decisionNote: "Tek olay; alt yasak yeterli.",
              decidedAt: new Date("2026-10-03T09:00:00Z"),
              decidedBy: { id: "u-chief", name: "Yusuf Ziya", email: null },
            }),
          ])}
        />
      )
    );
    expect(html).toContain("Reddedildi");
    expect(html).toContain("Tek olay; alt yasak yeterli.");
    expect(html).toContain("Karar veren: Yusuf Ziya");
    expect(html).not.toContain(">Onayla<");
  });
});

describe("the rules behind Kalıcı yasak talepleri", () => {
  it("words the codes tedrisat answers with and knows which settle the card", () => {
    expect(
      permanentBanFailureKey({ code: "PERMANENT_BAN_REQUEST_NOT_PENDING" })
    ).toBe("errors.answered");
    expect(
      permanentBanFailureKey({ code: "PERMANENT_BAN_REQUEST_NOT_FOUND" })
    ).toBe("errors.gone");
    expect(permanentBanFailureKey({ code: "BAN_ALREADY_LIFTED" })).toBe(
      "errors.lifted"
    );
    expect(permanentBanFailureKey({ code: "BAN_TARGET_INVALID" })).toBe(
      "errors.target"
    );
    expect(permanentBanFailureKey({ code: "BAN_FORBIDDEN" })).toBe(
      "errors.forbidden"
    );
    expect(permanentBanFailureKey({ code: "X" })).toBe("errors.generic");
    expect(
      permanentBanSettled({ code: "PERMANENT_BAN_REQUEST_NOT_PENDING" })
    ).toBe(true);
    expect(permanentBanSettled({ code: "BAN_ALREADY_LIFTED" })).toBe(false);
  });

  it("draws each status in its own tone", () => {
    expect(permanentBanVariant("PENDING")).toBe("warning");
    expect(permanentBanVariant("APPROVED")).toBe("success");
    expect(permanentBanVariant("REJECTED")).toBe("error");
  });

  it("names what the lower ban covers, and where Yasaklamalar finds the person", () => {
    expect(
      banPlace({
        courseTitle: null,
        koskName: null,
        madrasahName: "Süleymaniye Medresesi",
      })
    ).toBe("Süleymaniye Medresesi");
    expect(bansHref({ id: "u", name: "Ali Veli", email: null })).toBe(
      "/yasaklamalar?q=Ali%20Veli"
    );
    expect(bansHref({ id: "u", name: null, email: null })).toBe(
      "/yasaklamalar"
    );
  });

  it("has the same keys in tr, en and ar", () => {
    const keys = (o: unknown, at = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${at}${k}.`) : [`${at}${k}`]
      );
    const tr = keys(resources.tr.nizam.PermanentBansPage);
    expect(keys(resources.en.nizam.PermanentBansPage)).toEqual(tr);
    expect(keys(resources.ar.nizam.PermanentBansPage)).toEqual(tr);
    const reject = keys(resources.tr.nizam.DeckReject.permanentBan);
    expect(keys(resources.en.nizam.DeckReject.permanentBan)).toEqual(reject);
    expect(keys(resources.ar.nizam.DeckReject.permanentBan)).toEqual(reject);
  });
});
