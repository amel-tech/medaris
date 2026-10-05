// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsForm } from "~/features/settings/components/settings-form";
import type { SettingsSnapshot } from "~/features/settings/settings";
import { cleanup, click, render, settle, type as typeInto } from "./dom";

const refresh = vi.fn();
const save = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("~/features/settings/actions", () => ({
  saveSettings: (id: string, patch: unknown) => save(id, patch),
}));

const initial: SettingsSnapshot = {
  form: {
    name: "Süleymaniye Medresesi",
    description: "Klasik medrese müfredatını çevrim içi sürdürür.",
    policies: {
      closedCourseRequired: false,
      alwaysApproval: true,
      noPublicRecordings: false,
    },
  },
  updatedAt: "2026-09-29T09:00:00.000Z",
  updatedBy: "Mehmet Emin Işıkoğlu",
};

const mount = (snapshot = initial) =>
  render(
    <NextIntlClientProvider
      locale="tr"
      timeZone="Europe/Istanbul"
      messages={{ nazar: resources.tr.nazar }}
    >
      <ToastProvider>
        <SettingsForm
          madrasahId="m-1"
          initial={snapshot}
          timeZone="Europe/Istanbul"
        />
        <Toaster />
      </ToastProvider>
    </NextIntlClientProvider>
  );

const field = (name: string) =>
  document.querySelector(`[name=${name}]`) as HTMLInputElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent === label
  ) as HTMLButtonElement;
const row = (label: string) =>
  [...document.querySelectorAll("label.mds-choice")].find((l) =>
    l.textContent?.includes(label)
  ) as HTMLElement;
/** Whether the policy is on, as the checkbox announces it. */
const isOn = (label: string) =>
  row(label).querySelector("[role=checkbox]")?.getAttribute("aria-checked") ===
  "true";
/** happy-dom does not forward a click on the box to its input; the label does, as the browser's does. */
const toggle = (label: string) => click(row(label));
const lastChange = () =>
  document.querySelector("[data-testid=last-change]")?.textContent;

/** Kaydet is a submit button; sending the form is what the browser does with a click on it. */
const submit = async () => {
  await click(button("Kaydet"));
  await settle(30);
};

beforeEach(() => {
  refresh.mockReset();
  save.mockReset();
});
afterEach(cleanup);

describe("the settings form (nazir 04)", () => {
  it("shows the saved values, the last change, and keeps Kaydet and Vazgeç off while nothing differs", async () => {
    await mount();
    expect(field("name").value).toBe("Süleymaniye Medresesi");
    expect(field("description").value).toContain("Klasik medrese");
    expect(isOn("Kayıt her zaman onaylı")).toBe(true);
    expect(isOn("Kapalı ders zorunlu")).toBe(false);
    expect(lastChange()).toBe(
      "Son değişiklik 29 Eylül 2026 · Mehmet Emin Işıkoğlu"
    );
    expect(button("Kaydet").disabled).toBe(true);
    expect(button("Vazgeç").disabled).toBe(true);
  });

  it("turns Kaydet on for a change and Vazgeç puts the saved values back", async () => {
    await mount();
    await typeInto(field("name"), "Fatih Medresesi");
    await toggle("Kapalı ders zorunlu");
    expect(button("Kaydet").disabled).toBe(false);
    expect(isOn("Kapalı ders zorunlu")).toBe(true);

    await click(button("Vazgeç"));
    expect(field("name").value).toBe("Süleymaniye Medresesi");
    expect(isOn("Kapalı ders zorunlu")).toBe(false);
    expect(button("Kaydet").disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a blank name under its field and sends nothing (criterion 1)", async () => {
    await mount();
    await typeInto(field("name"), "   ");
    await submit();
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Medrese adı boş olamaz.");
    expect(field("name").getAttribute("aria-invalid")).toBe("true");
    // the error replaces the help line, it does not stack under it
    expect(document.body.textContent).not.toContain(
      "Talebeler bu adı medrese sayfasında"
    );

    await typeInto(field("name"), "Fatih Medresesi");
    expect(document.body.textContent).not.toContain("Medrese adı boş olamaz.");
  });

  it("refuses a one-letter name and a description over 1000 characters", async () => {
    await mount();
    await typeInto(field("name"), "A");
    await submit();
    expect(document.body.textContent).toContain(
      "Medrese adı en az 2 karakter olmalı."
    );
    await typeInto(field("name"), "Fatih Medresesi");
    await typeInto(field("description"), "a".repeat(1001));
    await submit();
    expect(document.body.textContent).toContain(
      "Açıklama en çok 1000 karakter olabilir."
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("saves only what changed, then shows the new last change and says so (criterion 3)", async () => {
    save.mockResolvedValue({
      success: true,
      data: {
        form: {
          ...initial.form,
          name: "Fatih Medresesi",
          policies: { ...initial.form.policies, closedCourseRequired: true },
        },
        updatedAt: "2026-10-02T10:00:00.000Z",
        updatedBy: "Yusuf Ziya Ertuğrul",
      },
    });
    await mount();
    await typeInto(field("name"), "  Fatih Medresesi ");
    await toggle("Kapalı ders zorunlu");
    await submit();

    expect(save).toHaveBeenCalledExactlyOnceWith("m-1", {
      name: "Fatih Medresesi",
      policies: { closedCourseRequired: true },
    });
    expect(lastChange()).toBe(
      "Son değişiklik 2 Ekim 2026 · Yusuf Ziya Ertuğrul"
    );
    expect(
      document.querySelector(".mds-toast--success")?.textContent
    ).toContain("Ayarlar kaydedildi.");
    expect(refresh).toHaveBeenCalledOnce();
    expect(button("Kaydet").disabled).toBe(true);
  });

  it("clears the description with null when it is emptied", async () => {
    save.mockResolvedValue({
      success: true,
      data: { ...initial, form: { ...initial.form, description: "" } },
    });
    await mount();
    await typeInto(field("description"), "");
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith("m-1", { description: null });
  });

  it("keeps the form and says why in an error toast that stays when the API refuses (criterion 4)", async () => {
    save.mockResolvedValue({ success: false, code: "AUTHZ_FORBIDDEN" });
    await mount();
    await typeInto(field("name"), "Fatih Medresesi");
    await submit();

    const toast = document.querySelector(".mds-toast--error");
    expect(toast?.textContent).toContain("Ayarlar kaydedilemedi");
    expect(toast?.textContent).toContain("Bunu yapma izniniz yok.");
    expect(field("name").value).toBe("Fatih Medresesi");
    expect(button("Kaydet").disabled).toBe(false);
    expect(lastChange()).toBe(
      "Son değişiklik 29 Eylül 2026 · Mehmet Emin Işıkoğlu"
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("words a validation refusal from the code, never from the server's message", async () => {
    save.mockResolvedValue({ success: false, code: "VALIDATION_ERROR" });
    await mount();
    await typeInto(field("name"), "Fatih Medresesi");
    await submit();
    expect(document.querySelector(".mds-toast--error")?.textContent).toContain(
      "Medrese adını ve açıklamayı denetleyip yeniden deneyin."
    );
  });

  it("has no last-change line before the first save", async () => {
    await mount({ ...initial, updatedAt: null, updatedBy: null });
    expect(lastChange()).toBe("");
  });
});
