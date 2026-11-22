// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZerothQuestionForm } from "~/features/settings/components/zeroth-question-form";
import type { ZerothSaved } from "~/features/settings/zeroth-question";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const save = vi.fn();
vi.mock("~/features/settings/actions", () => ({
  saveSettings: vi.fn(),
  saveZerothQuestion: (id: string, body: unknown) => save(id, body),
}));

/** Answers the test lets through when it wants. */
const held: Array<() => void> = [];
const later = <T,>(value: T) =>
  new Promise<T>((resolve) => held.push(() => resolve(value)));

const none: ZerothSaved = { text: "", options: [], updatedAt: null };

const mount = (initial = none) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <ZerothQuestionForm
          madrasahId="m-1"
          initial={initial}
          timeZone="Europe/Istanbul"
        />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );

const option = (n: number) =>
  document.querySelector(
    `input[aria-label="${n}. seçenek"]`
  ) as HTMLInputElement;
const question = () =>
  document.querySelector("[name=zerothText]") as HTMLTextAreaElement;
const kaydet = () =>
  [...document.querySelectorAll("button[type=submit]")].find((b) =>
    b.textContent?.includes("Kaydet")
  ) as HTMLButtonElement;
const status = () =>
  document.querySelector("[data-testid=zeroth-status]")?.textContent;

afterEach(async () => {
  await cleanup();
  held.length = 0;
  vi.clearAllMocks();
});

describe("the medrese's zeroth question form (MDRS-299)", () => {
  it("opens with two empty options, and saves without closing the fields", async () => {
    save.mockReturnValue(
      later({
        success: true,
        data: {
          text: "Kopya çekmeyeceğine söz veriyor musun?",
          options: ["Evet", "Hayır"],
          updatedAt: "2026-11-22T09:00:00.000Z",
        },
      })
    );
    await mount();
    expect(status()).toContain("Henüz sıfırıncı soru yok");
    expect(option(1).value).toBe("");
    expect(option(2).value).toBe("");
    expect(option(3)).toBeNull();
    expect(kaydet().disabled).toBe(true);

    await typeInto(question(), "  Kopya çekmeyeceğine söz veriyor musun? ");
    await typeInto(option(1), "Evet ");
    await typeInto(option(2), "Hayır");
    await click(kaydet());
    expect(save).toHaveBeenCalledWith("m-1", {
      text: "Kopya çekmeyeceğine söz veriyor musun?",
      options: ["Evet", "Hayır"],
    });
    // While it saves the fields stay open; only the status says it runs.
    expect(status()).toBe("Kaydediliyor…");
    expect(question().disabled).toBe(false);
    expect(option(1).disabled).toBe(false);

    held.shift()?.();
    await settle(40);
    expect(status()).toBe("Son kaydedilme: 22 Kasım 2026");
    expect(kaydet().disabled).toBe(true);
  });

  it("adds and removes options, and refuses two that are the same on the page", async () => {
    await mount();
    await typeInto(question(), "Soru");
    await click(
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Seçenek ekle"
      ) as HTMLButtonElement
    );
    expect(option(3)).not.toBeNull();
    await click(
      document.querySelector(
        'button[aria-label="3. seçeneği kaldır"]'
      ) as HTMLButtonElement
    );
    expect(option(3)).toBeNull();
    await typeInto(option(1), "Evet");
    await typeInto(option(2), " Evet");
    await click(kaydet());
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("İki seçenek aynı olamaz.");
  });

  it("keeps what was typed when the save fails", async () => {
    save.mockResolvedValue({ success: false, code: "SOMETHING" });
    await mount({
      text: "Eski soru",
      options: ["Evet", "Hayır"],
      updatedAt: "2026-11-01T09:00:00.000Z",
    });
    await typeInto(question(), "Yeni soru");
    await click(kaydet());
    await settle(40);
    expect(question().value).toBe("Yeni soru");
    expect(status()).toBe("Kaydedilemedi; yazdıklarınız duruyor.");
    expect(document.body.textContent).toContain("Sıfırıncı soru kaydedilemedi");
  });
});
