// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KoskDeckForm } from "~/features/deck-review/components/kosk-deck-form";
import { cleanup, click, render, settle, type } from "./dom";

/**
 * Köşk destesi aç (nizam 35) while the deck is sent: the name, the
 * description and the card type are held until the answer, so a choice made
 * then is never left out of the payload already on its way. The server
 * action is held open by hand.
 */

const openKoskDeck = vi.hoisted(() => vi.fn());
vi.mock("~/features/deck-review/actions", () => ({ openKoskDeck }));
vi.mock("@medaris/ui/components/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const tr = resources.tr.nizam.KoskDeckForm;

/** A server action answer the test releases when it chooses. */
const deferred = <T,>() => {
  let settleIt: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settleIt = resolve;
  });
  return { promise, settle: settleIt };
};

const field = (name: string) =>
  document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const radios = () => [...document.querySelectorAll('[role="radio"]')];

beforeEach(() => openKoskDeck.mockReset());
afterEach(cleanup);

describe("Köşk destesi aç while the deck is sent", () => {
  it("holds the name, the description and the card type until the answer", async () => {
    const sent = deferred<unknown>();
    openKoskDeck.mockReturnValue(sent.promise);
    await render(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <KoskDeckForm
          koskId="k1"
          koskName="Nûruosmaniye Köşkü"
          studentCount={74}
          proposal={null}
        />
      </NextIntlClientProvider>
    );
    await type(field("title"), "Mehmûz fiiller");
    expect(radios()).toHaveLength(2);
    for (const radio of radios()) {
      expect(radio.getAttribute("aria-disabled")).toBeNull();
    }

    await click(button(tr.submit));
    await settle();
    expect(openKoskDeck).toHaveBeenCalledOnce();
    expect(field("title").disabled).toBe(true);
    expect(field("description").disabled).toBe(true);
    for (const radio of radios()) {
      expect(radio.getAttribute("aria-disabled")).toBe("true");
    }

    sent.settle({ success: false, errorBody: { code: "X" } });
    await settle();
    expect(field("title").disabled).toBe(false);
    for (const radio of radios()) {
      expect(radio.getAttribute("aria-disabled")).toBeNull();
    }
  });
});
