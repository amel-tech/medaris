// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  AppealResponse,
  CourseRequestResponse,
  DeckPublishRequestResponse,
  KoskApplicationItemResponse,
} from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppealsView } from "~/features/appeals/components/appeals-view";
import { DeckRequestsView } from "~/features/deck-review/components/deck-requests-view";
import { ApplicationsView } from "~/features/platform-admin/components/applications-view";
import { CourseRequestsView } from "~/features/platform-admin/components/course-requests-view";
import { cleanup, click, render, settle } from "./dom";

/**
 * The request pages' answers that come late: the tab "Karara bağlanan" is
 * read, "Bekleyen" is chosen again before the read is back, and the read
 * then lands. It belongs to a tab that is no longer shown, so it selects
 * nothing: on Köşk başvuruları a selection reads the applicant's contact
 * details, which tedrisat audits (APPDEC-7). On Deste yayın istekleri the
 * same holds for "Bütün kartlar" asked for one request and answered after
 * another was chosen. Each server action is held open by hand.
 */

const actions = vi.hoisted(() => ({
  loadKoskApplications: vi.fn(),
  loadKoskApplication: vi.fn(),
  approveKoskApplication: vi.fn(),
  rejectKoskApplication: vi.fn(),
  loadCourseRequests: vi.fn(),
  acceptCourseRequest: vi.fn(),
  rejectCourseRequest: vi.fn(),
  loadAppeals: vi.fn(),
  acceptAppeal: vi.fn(),
  rejectAppeal: vi.fn(),
  loadDeckRequests: vi.fn(),
  loadRequestCards: vi.fn(),
  approveDeckRequest: vi.fn(),
  rejectDeckRequest: vi.fn(),
  unpublishDeck: vi.fn(),
}));
vi.mock("~/features/platform-admin/actions", () => ({
  loadKoskApplications: actions.loadKoskApplications,
  loadKoskApplication: actions.loadKoskApplication,
  approveKoskApplication: actions.approveKoskApplication,
  rejectKoskApplication: actions.rejectKoskApplication,
  loadCourseRequests: actions.loadCourseRequests,
  acceptCourseRequest: actions.acceptCourseRequest,
  rejectCourseRequest: actions.rejectCourseRequest,
}));
vi.mock("~/features/appeals/actions", () => ({
  loadAppeals: actions.loadAppeals,
  acceptAppeal: actions.acceptAppeal,
  rejectAppeal: actions.rejectAppeal,
}));
vi.mock("~/features/deck-review/actions", () => ({
  loadDeckRequests: actions.loadDeckRequests,
  loadRequestCards: actions.loadRequestCards,
  approveDeckRequest: actions.approveDeckRequest,
  rejectDeckRequest: actions.rejectDeckRequest,
  unpublishDeck: actions.unpublishDeck,
}));
vi.mock("~/features/kosks/admin-actions", () => ({ openKosk: vi.fn() }));
vi.mock("~/features/madrasahs/actions", () => ({ lookupUserByEmail: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** A server action answer the test releases when it chooses. */
const deferred = <T,>() => {
  let settleIt: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settleIt = resolve;
  });
  return { promise, settle: settleIt };
};

const wrap = (node: ReactElement) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nizam: resources.tr.nizam } as never}
  >
    {node}
  </NextIntlClientProvider>
);

const tab = (name: string) =>
  [...document.querySelectorAll('[role="tab"]')].find((el) =>
    el.textContent?.startsWith(name)
  ) as HTMLElement;
const current = (testId: string) =>
  document.querySelector(`[data-testid="${testId}"][aria-current="true"]`)
    ?.textContent ?? null;

const AT = new Date("2026-11-20T09:00:00Z");

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});
afterEach(cleanup);

describe("Köşk başvuruları: a read of the answered tab that lands after Bekleyen is chosen again", () => {
  const application = (
    id: string,
    name: string,
    status: "PENDING" | "APPROVED"
  ): KoskApplicationItemResponse => ({
    id,
    name,
    field: "FIQH",
    applicantName: "Hatice Yıldırım",
    status,
    createdAt: AT,
    decidedAt: status === "PENDING" ? null : AT,
  });

  it("selects nothing, so no answered applicant's contact details are read under Bekleyen", async () => {
    actions.loadKoskApplication.mockResolvedValue({ success: false });
    const decided = deferred<unknown>();
    actions.loadKoskApplications.mockReturnValue(decided.promise);
    await render(
      wrap(
        <ApplicationsView
          initial={{
            items: [application("w1", "Bekleyen Köşk", "PENDING")],
            pendingCount: 1,
            decidedCount: 1,
          }}
        />
      )
    );
    await settle();
    expect(actions.loadKoskApplication).toHaveBeenLastCalledWith("w1");

    await click(tab("Karara bağlanan"));
    await click(tab("Bekleyen"));
    await settle();
    decided.settle({
      success: true,
      data: {
        items: [application("d1", "Kabul Edilen Köşk", "APPROVED")],
        pendingCount: 1,
        decidedCount: 1,
      },
    });
    await settle();

    expect(actions.loadKoskApplication).not.toHaveBeenCalledWith("d1");
    expect(current("application-item")).toContain("Bekleyen Köşk");
    expect(document.body.textContent).toContain("Bekleyen Köşk");
  });
});

describe("İtirazlar: a read of the decided tab that lands after Bekleyen is chosen again", () => {
  const appeal = (
    id: string,
    title: string,
    status: "PENDING" | "ACCEPTED"
  ): AppealResponse =>
    ({
      id,
      status,
      reason: "Ders müfredatı köşkün alanına uygundur.",
      decisionNote: null,
      createdAt: AT,
      decidedAt: status === "PENDING" ? null : AT,
      madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
      kosk: { id: "k1", name: "Fıkıh Köşkü" },
      courseRequestId: "r1",
      title,
      rejectReason: "Kontenjan dolu.",
      createdBy: { id: "u1", name: "Mehmet Emin Işıkoğlu" },
    }) as AppealResponse;

  it("keeps the waiting appeal selected, with its Kabul et", async () => {
    const decided = deferred<unknown>();
    actions.loadAppeals.mockReturnValue(decided.promise);
    actions.acceptAppeal.mockResolvedValue({ success: true, data: null });
    await render(
      wrap(
        <AppealsView
          initial={{
            items: [appeal("w1", "Usûl-i Fıkıh", "PENDING")],
            pendingCount: 1,
            decidedCount: 1,
          }}
        />
      )
    );

    await click(tab("Karara bağlanan"));
    await click(tab("Bekleyen"));
    decided.settle({
      success: true,
      data: {
        items: [appeal("d1", "Akaid Okumaları", "ACCEPTED")],
        pendingCount: 1,
        decidedCount: 1,
      },
    });
    await settle();

    const accept = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Kabul et"
    );
    expect(accept).toBeTruthy();
    await click(accept as Element);
    await settle();
    expect(actions.acceptAppeal).toHaveBeenCalledExactlyOnceWith("w1");
  });
});

describe("Ders talepleri: a read of the answered tab that lands after Bekleyen is chosen again", () => {
  const request = (
    id: string,
    title: string,
    status: "PENDING" | "REJECTED"
  ): CourseRequestResponse =>
    ({
      id,
      title,
      reason: "Medresemizde yer yok.",
      status,
      kosk: { id: "k1", name: "Nûruosmaniye Köşkü" },
      madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
      requestedBy: { id: "u1", name: "Ömer Başmüderris" },
      createdAt: AT,
      decidedAt: status === "PENDING" ? null : AT,
      rejectReason: status === "PENDING" ? null : "Kontenjan dolu.",
      courseId: null,
    }) as CourseRequestResponse;

  it("keeps the waiting request selected", async () => {
    const decided = deferred<unknown>();
    actions.loadCourseRequests.mockReturnValue(decided.promise);
    await render(
      wrap(
        <CourseRequestsView
          koskId="k1"
          initial={{
            items: [request("w1", "Usûl-i Fıkıh Okumaları", "PENDING")],
            pendingCount: 1,
            decidedCount: 1,
          }}
        />
      )
    );

    await click(tab("Karara bağlanan"));
    await click(tab("Bekleyen"));
    decided.settle({
      success: true,
      data: {
        items: [request("d1", "Belâgat Dersleri", "REJECTED")],
        pendingCount: 1,
        decidedCount: 1,
      },
    });
    await settle();

    expect(current("course-request-item")).toContain("Usûl-i Fıkıh Okumaları");
    expect(document.body.textContent).not.toContain("Belâgat Dersleri");
  });
});

describe("Deste yayın istekleri: answers that belong to another tab or another request", () => {
  const deck = (id: string, title: string): DeckPublishRequestResponse =>
    ({
      id,
      title,
      description: null,
      cardType: "VOCABULARY",
      cardCount: 18,
      owner: { id: "o1", name: "Zeynep Betül Karahanlı" },
      requestedAt: AT,
      outcome: "PENDING",
      decidedAt: null,
      rejectReason: null,
    }) as DeckPublishRequestResponse;
  const cards = (front: string) => ({
    success: true,
    data: {
      items: [{ id: `${front}-1`, front, back: "arka" }],
      total: 18,
    },
  });
  const sample = () =>
    document.querySelector('[data-testid="card-sample"]')?.textContent ?? "";

  it("does not read the cards of an answered request when its tab's read lands under Bekleyen", async () => {
    actions.loadRequestCards.mockImplementation(async (id: string) =>
      cards(`kart-${id}`)
    );
    const decided = deferred<unknown>();
    actions.loadDeckRequests.mockReturnValue(decided.promise);
    await render(
      wrap(
        <DeckRequestsView
          initial={{
            items: [deck("w1", "Mehmûz fiiller")],
            pendingCount: 1,
            decidedCount: 1,
          }}
        />
      )
    );
    await settle();

    await click(tab("Karara bağlanan"));
    await click(tab("Bekleyen"));
    await settle();
    decided.settle({
      success: true,
      data: {
        items: [{ ...deck("d1", "Avâmil ezberi"), outcome: "APPROVED" }],
        pendingCount: 1,
        decidedCount: 1,
      },
    });
    await settle();

    expect(actions.loadRequestCards).not.toHaveBeenCalledWith("d1", false);
    expect(current("deck-request-item")).toContain("Mehmûz fiiller");
    expect(sample()).toContain("kart-w1");
  });

  it("drops 'Bütün kartlar' of the first request once the second is chosen", async () => {
    const all = deferred<unknown>();
    actions.loadRequestCards.mockImplementation(
      (id: string, everything: boolean) =>
        everything ? all.promise : Promise.resolve(cards(`örnek-${id}`))
    );
    await render(
      wrap(
        <DeckRequestsView
          initial={{
            items: [deck("r1", "Mehmûz fiiller"), deck("r2", "Avâmil ezberi")],
            pendingCount: 2,
            decidedCount: 0,
          }}
        />
      )
    );
    await settle();
    expect(sample()).toContain("örnek-r1");

    await click(
      document.querySelector('[data-testid="all-cards"]') as HTMLElement
    );
    const second = [
      ...document.querySelectorAll('[data-testid="deck-request-item"]'),
    ].find((b) => b.textContent?.includes("Avâmil ezberi")) as HTMLElement;
    await click(second);
    await settle();
    expect(sample()).toContain("örnek-r2");

    all.settle(cards("bütün-r1"));
    await settle();

    expect(current("deck-request-item")).toContain("Avâmil ezberi");
    expect(sample()).toContain("örnek-r2");
    expect(sample()).not.toContain("bütün-r1");
  });
});
