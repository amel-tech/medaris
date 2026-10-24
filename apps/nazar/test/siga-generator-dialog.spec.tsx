// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SigaGeneratorDialog } from "~/features/decks/components/siga-generator-dialog";
import { cleanup, click, key, render, settle, type as typeInto } from "./dom";

const createCards = vi.fn();
const onClose = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/decks/actions", () => ({
  createCards: (deckId: string, bodies: unknown) => createCards(deckId, bodies),
}));

const mount = () =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <SigaGeneratorDialog
          deckId="deck-1"
          cardType="VOCABULARY"
          onClose={onClose}
        />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );

const dialog = () => document.querySelector(".mds-dialog") as HTMLElement;
const button = (label: string) =>
  [...dialog().querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement;
const field = (name: string) =>
  dialog().querySelector(`input[name=${name}]`) as HTMLInputElement;
const faces = () =>
  [...dialog().querySelectorAll("li input")] as HTMLInputElement[];

beforeEach(() => {
  createCards.mockReset();
  createCards.mockResolvedValue({ success: true, data: { count: 28 } });
  onClose.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

const fill = async () => {
  await typeInto(field("root"), "ن ص ر");
  await typeInto(field("maziMeaning"), "yardım etti");
  await typeInto(field("muzariMeaning"), "yardım ediyor");
};

describe("Sîga üretici", () => {
  it("says what is wrong with a root it cannot conjugate, and drafts nothing", async () => {
    await mount();
    await typeInto(field("root"), "قول");
    await click(button("Önizle"));
    expect(dialog().textContent).toContain(
      "Hemzeli ya da illetli kök bu üreticide yok"
    );
    expect(faces()).toHaveLength(0);
  });

  it("previews the 28 sîgas as editable drafts, Arabic set right to left", async () => {
    await mount();
    await fill();
    await click(button("Önizle"));
    const inputs = faces();
    expect(inputs).toHaveLength(56);
    expect(inputs[0].value).toBe("نَصَرَ");
    expect(inputs[0].getAttribute("dir")).toBe("rtl");
    expect(inputs[0].getAttribute("lang")).toBe("ar");
    expect(inputs[1].value).toBe("O (erkek) yardım etti");
    expect(dialog().textContent).toContain("Gâib · müfred");
    expect(dialog().textContent).toContain("Mütekellim · maa'l-gayr");
    expect(button("28 kartı kaydet")).toBeDefined();
  });

  it("saves the cards as corrected, each with its sîga, in one call", async () => {
    await mount();
    await fill();
    await click(button("Önizle"));
    await typeInto(faces()[1], "O yardım etti");
    await click(button("28 kartı kaydet"));
    await settle();
    expect(createCards).toHaveBeenCalledTimes(1);
    const [deckId, bodies] = createCards.mock.calls[0];
    expect(deckId).toBe("deck-1");
    expect(bodies).toHaveLength(28);
    expect(bodies[0]).toEqual({
      type: "VOCABULARY",
      contentFront: "نَصَرَ",
      contentBack: "O yardım etti",
      contentMeta: {
        kok: "ن ص ر",
        bab: "nasara",
        kip: "mazi",
        sahis: "gaib",
        cinsiyet: "muzekker",
        sayi: "mufred",
      },
    });
    expect(bodies[27].contentMeta).toMatchObject({
      kip: "muzari",
      sahis: "mutekellim",
      sayi: "cem",
    });
    expect(onClose).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("does not save while a meaning is left empty", async () => {
    await mount();
    await typeInto(field("root"), "ن ص ر");
    await click(button("Önizle"));
    await click(button("28 kartı kaydet"));
    await settle();
    expect(createCards).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain("3 ile 5000");
  });

  it("drafts one tense when the other is unticked", async () => {
    await mount();
    await fill();
    const muzari = [...dialog().querySelectorAll("label")].find((l) =>
      l.textContent?.startsWith("Muzâri · 14")
    ) as HTMLElement;
    await click(muzari);
    await click(button("Önizle"));
    expect(faces()).toHaveLength(28);
    expect(button("14 kartı kaydet")).toBeDefined();
  });

  it("goes back to the root without losing what was typed", async () => {
    await mount();
    await fill();
    await click(button("Önizle"));
    await click(button("Geri"));
    expect(field("root").value).toBe("ن ص ر");
    expect(field("maziMeaning").value).toBe("yardım etti");
  });

  it("labels each draft's faces with its sîga, and keeps the dialog open while saving", async () => {
    let finish: (value: unknown) => void = () => undefined;
    createCards.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await mount();
    await fill();
    await click(button("Önizle"));
    const legends = [...dialog().querySelectorAll("li fieldset > legend")];
    expect(legends).toHaveLength(28);
    expect(legends[0].textContent).toBe("Gâib · müfred");
    await click(button("28 kartı kaydet"));
    expect(button("Geri").disabled).toBe(true);
    await key(document.activeElement ?? dialog(), "Escape");
    expect(onClose).not.toHaveBeenCalled();
    finish({ success: true, data: { count: 28 } });
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ties the tense error to the boxes", async () => {
    await mount();
    await typeInto(field("root"), "ن ص ر");
    for (const label of ["Mâzî · 14", "Muzâri · 14"]) {
      await click(
        [...dialog().querySelectorAll("label")].find((l) =>
          l.textContent?.startsWith(label)
        ) as HTMLElement
      );
    }
    await click(button("Önizle"));
    const error = dialog().querySelector(".mds-error") as HTMLElement;
    expect(error.textContent).toBe("En az bir kip seçin.");
    const boxes = [...dialog().querySelectorAll("[role=checkbox]")];
    expect(
      boxes.every((b) => b.getAttribute("aria-describedby")?.includes(error.id))
    ).toBe(true);
  });
});
