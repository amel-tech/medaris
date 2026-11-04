// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  AppealSummaryResponse,
  MadrasahAppealRowResponse,
} from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appealErrorKey,
  appealRows,
  listMoved,
} from "~/features/appeals/appeals";
import { cleanup, click, render, settle, type as typeInto } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * İtirazlar (nazar): the medrese's course requests a köşk refused, the
 * appeal against each, and "İtiraz aç". The read and the action are stubs.
 */
type Answer =
  | { status: "ok"; data: MadrasahAppealRowResponse[] }
  | { status: "forbidden" }
  | { status: "failed" };

const state = { rows: { status: "failed" } as Answer, asked: [] as unknown[] };
const refresh = vi.fn();
const openAppeal = vi.fn();

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
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (_what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      madrasahs: {
        listMadrasahAppeals: async (request: unknown) => {
          state.asked.push(request);
        },
      },
    });
    return state.rows;
  },
}));
vi.mock("~/features/appeals/actions", () => ({
  openAppeal: (id: string, requestId: string, reason: string) =>
    openAppeal(id, requestId, reason),
}));

const row = (
  n: number,
  over: Partial<MadrasahAppealRowResponse> = {}
): MadrasahAppealRowResponse => ({
  courseRequestId: `r-${n}`,
  title: `Ders ${n}`,
  kosk: { id: "k-1", name: "Fıkıh Köşkü" },
  requestStatus: "REJECTED",
  rejectReason: `Ret ${n}`,
  appeal: null,
  ...over,
});
const appeal = (
  status: AppealSummaryResponse["status"],
  decisionNote: string | null = null
): AppealSummaryResponse => ({
  id: `a-${status}`,
  status,
  reason: "Gerekçe",
  decisionNote,
  createdAt: new Date("2026-10-20T09:00:00Z"),
  decidedAt: null,
});

const wrap = (node: ReactNode) => (
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
  const { AppealsPage } = await import(
    "~/features/appeals/components/appeals-page"
  );
  return wrap(<AppealsPage madrasahId="m-1" />);
};
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};
const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const reason = () =>
  dialog().querySelector("textarea[name=reason]") as HTMLTextAreaElement;
const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const toast = (tone: string) =>
  document.querySelector(`.mds-toast--${tone}`)?.textContent ?? "";

beforeEach(() => {
  state.rows = {
    status: "ok",
    data: [
      row(1),
      row(2, { appeal: appeal("PENDING") }),
      row(3, {
        requestStatus: "PENDING",
        appeal: appeal("ACCEPTED"),
      }),
      row(4, { appeal: appeal("REJECTED", "Köşkün gerekçesi yerinde.") }),
    ],
  };
  state.asked = [];
  refresh.mockReset();
  openAppeal.mockReset();
});
afterEach(cleanup);

describe("the rows of İtirazlar", () => {
  it("offers İtiraz aç only on a refused request without an appeal", () => {
    const rows = appealRows(
      (state.rows as { data: MadrasahAppealRowResponse[] }).data
    );
    expect(rows.map((r) => [r.status, r.canAppeal])).toEqual([
      ["NONE", true],
      ["PENDING", false],
      ["ACCEPTED", false],
      ["REJECTED", false],
    ]);
    expect(rows[3]?.note).toBe("Köşkün gerekçesi yerinde.");
  });

  it("words the API's codes, and knows which mean the list moved", () => {
    expect(appealErrorKey("APPEAL_EXISTS")).toBe("Appeals.errors.exists");
    expect(appealErrorKey("X")).toBe("Appeals.errors.generic");
    expect(listMoved("APPEAL_EXISTS")).toBe(true);
    expect(listMoved("AUTHZ_FORBIDDEN")).toBe(false);
  });
});

describe("İtirazlar as the server renders it", () => {
  it("lists Ders · Köşk · Ret gerekçesi · İtiraz durumu · Karar notu with each status", async () => {
    const text = textOf(await html(await element()));
    expect(state.asked).toEqual([{ id: "m-1" }]);
    for (const word of [
      "İtirazlar",
      "Ders",
      "Köşk",
      "Ret gerekçesi",
      "İtiraz durumu",
      "Karar notu",
      "Yok",
      "Bekliyor",
      "Kabul edildi",
      "Reddedildi",
      "Köşkün gerekçesi yerinde.",
      "İtiraz aç",
    ]) {
      expect(text, word).toContain(word);
    }
    expect(text).not.toContain("Bu sayfa henüz hazır değil.");
  });

  it("is the empty state when no request was refused", async () => {
    state.rows = { status: "ok", data: [] };
    expect(textOf(await html(await element()))).toContain(
      "Köşkün reddettiği ders talebi yok."
    );
  });

  it("is a notice for a caller the API refuses", async () => {
    state.rows = { status: "forbidden" };
    const text = textOf(await html(await element()));
    expect(text).not.toContain("İtiraz aç");
  });
});

describe("İtiraz aç", () => {
  const open = async () => {
    await mount();
    await click(
      document.querySelector('[aria-label="İtiraz aç: Ders 1"]') as Element
    );
    await settle(80);
  };

  it("keeps Gönder off until there is a Gerekçe", async () => {
    await open();
    expect(dialog().textContent).toContain("Gerekçe");
    expect(buttonIn(dialog(), "Gönder").disabled).toBe(true);
    await typeInto(reason(), "   ");
    expect(buttonIn(dialog(), "Gönder").disabled).toBe(true);
  });

  it("sends the trimmed reason, says so and reads the list again", async () => {
    openAppeal.mockResolvedValue({ success: true, data: null });
    await open();
    await typeInto(reason(), "  Ders köşkün alanındadır.  ");
    await click(buttonIn(dialog(), "Gönder"));
    await settle(60);
    expect(openAppeal).toHaveBeenCalledExactlyOnceWith(
      "m-1",
      "r-1",
      "Ders köşkün alanındadır."
    );
    expect(toast("success")).toContain("İtiraz gönderildi");
    expect(refresh).toHaveBeenCalledOnce();
    expect(dialog()).toBeNull();
  });

  it("closes and reads again when the request was appealed meanwhile", async () => {
    openAppeal.mockResolvedValue({ success: false, code: "APPEAL_EXISTS" });
    await open();
    await typeInto(reason(), "Gerekçe");
    await click(buttonIn(dialog(), "Gönder"));
    await settle(60);
    expect(toast("error")).toContain("Bu talebe zaten itiraz edildi.");
    expect(dialog()).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("the words of İtirazlar", () => {
  it("has the same keys in tr, en and ar", () => {
    const keys = (o: unknown, at = ""): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${at}${k}.`) : [`${at}${k}`]
      );
    const tr = keys(resources.tr.nazar.Appeals);
    expect(keys(resources.en.nazar.Appeals)).toEqual(tr);
    expect(keys(resources.ar.nazar.Appeals)).toEqual(tr);
  });
});
