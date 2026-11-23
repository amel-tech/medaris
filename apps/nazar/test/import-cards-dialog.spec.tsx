// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecksActions } from "~/features/decks/components/decks-actions";
import { ImportCardsDialog } from "~/features/decks/components/import-cards-dialog";
import { cleanup, click, render, settle } from "./dom";

/**
 * "Excel'den aktar" while the file is out: what the person sees is what is
 * sent, and a send that ends after its dialog was closed closes nothing else.
 * The server action is a stub that answers when the spec says so.
 */
const importCards = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/decks/actions", () => ({
  importCards: (deckId: string, body: FormData) => importCards(deckId, body),
  createDeck: vi.fn(),
}));

const words = resources.tr.nazar.Decks;
const DECKS = [
  { id: "deck-a", title: "Aktarma denemesi A" },
  { id: "deck-b", title: "Aktarma denemesi B" },
];

const wrap = (node: ReactElement) =>
  render(
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

const dialogs = () => [...document.querySelectorAll(".mds-dialog")];
const dialog = () => dialogs()[0] as HTMLElement;
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const deckField = () =>
  dialog().querySelector("[role=combobox]") as HTMLElement;

/** happy-dom opens no file picker: the input is given its file and told it changed. */
const choose = async (file: File) => {
  const input = dialog().querySelector("input[type=file]") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const csv = () =>
  new File(["Card Type,Content Front,Content Back\n"], "kartlar.csv", {
    type: "text/csv",
  });

/** The answer of the stubbed importCards, held until `answer` is called. */
const held = () => {
  let answer: (value: unknown) => void = () => undefined;
  importCards.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  return async (value: unknown) => {
    await act(async () => answer(value));
    await settle();
  };
};

beforeEach(() => {
  importCards.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe("the import dialog while the file is sent", () => {
  it("keeps 'Hedef deste' off while the file is out, so the deck shown is the deck it goes to", async () => {
    const answer = held();
    await wrap(<ImportCardsDialog decks={DECKS} onClose={vi.fn()} />);
    expect(deckField().hasAttribute("data-disabled")).toBe(false);

    await choose(csv());
    await click(button(dialog(), words.import));
    expect(importCards).toHaveBeenCalledWith("deck-a", expect.any(FormData));
    expect(deckField().hasAttribute("data-disabled")).toBe(true);
    await click(deckField());
    expect(document.querySelector("[role=listbox]")).toBeNull();

    await answer({ success: false, rows: [] });
    expect(deckField().hasAttribute("data-disabled")).toBe(false);
    expect(dialog().textContent).toContain(words.failed);
  });

  it("a send that ends after its dialog was closed does not close the dialog opened since", async () => {
    const answer = held();
    await wrap(<DecksActions courseId="course-1" decks={DECKS} weeks={[]} />);
    await click(button(document, words.importButton));
    await choose(csv());
    await click(button(dialog(), words.import));
    expect(importCards).toHaveBeenCalledTimes(1);

    await click(button(dialog(), words.cancel));
    await settle();
    expect(dialogs()).toHaveLength(0);
    await click(button(document, words.newButton));
    await settle();
    expect(dialog().textContent).toContain(words.newTitle);

    await answer({ success: true, data: { count: 2 } });
    expect(refresh).toHaveBeenCalled();
    expect(document.body.textContent).toContain("2 kart eklendi");
    expect(dialogs()).toHaveLength(1);
    expect(dialog().textContent).toContain(words.newTitle);
  });
});
